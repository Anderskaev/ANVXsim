# app/routes/portfolio.py

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timezone

from app import db
from app.models import Portfolio, Position, Trade, Accrual, LastPrice, Security

portfolio_bp = Blueprint('portfolio', __name__)


# ── PORTFOLIO ─────────────────────────────────────────────────────────────────

@portfolio_bp.route('', methods=['GET'])
@jwt_required()
def portfolio():
    user_id = int(get_jwt_identity())

    port = Portfolio.query.filter_by(user_id=user_id).first()
    if not port:
        return jsonify({'error': 'Портфель не найден'}), 404

    positions = Position.query.filter_by(portfolio_id=port.id).all()

    # подтягиваем last_price одним запросом
    tickers   = [p.ticker for p in positions]
    prices    = LastPrice.query.filter(LastPrice.ticker.in_(tickers)).all()
    price_map = {lp.ticker: lp for lp in prices}

    # подтягиваем названия бумаг
    secs     = Security.query.filter(Security.ticker.in_(tickers)).all()
    sec_map  = {s.ticker: s for s in secs}

    positions_data = []
    total_pos_value = 0

    for pos in positions:
        lp          = price_map.get(pos.ticker)
        sec         = sec_map.get(pos.ticker)
        # fallback на avg_price если нет last_price
        cur_price   = float(lp.price) if lp else float(pos.avg_price)
        pos_value   = cur_price * pos.quantity
        total_pos_value += pos_value

        positions_data.append({
            **pos.to_dict(current_price=cur_price),
            'short_name': sec.short_name if sec else pos.ticker,
            'lot_size':   sec.lot_size   if sec else 1,
        })

    total_value = float(port.cash) + total_pos_value
    total_pnl   = total_value - float(port.initial_cash)
    roi         = (total_value / float(port.initial_cash) - 1) * 100 if port.initial_cash else 0

    return jsonify({
        'portfolio':   port.to_dict(),
        'positions':   positions_data,
        'total_value': total_value,
        'pos_value':   total_pos_value,
        'total_pnl':   total_pnl,
        'roi':         round(roi, 4),
    }), 200


# ── HISTORY ───────────────────────────────────────────────────────────────────

@portfolio_bp.route('/history', methods=['GET'])
@jwt_required()
def history():
    user_id  = int(get_jwt_identity())
    page     = request.args.get('page',  1,    type=int)
    per_page = request.args.get('limit', 20,   type=int)
    type_filter = request.args.get('type', '', type=str)  # trade | dividend | coupon | ''

    per_page = min(per_page, 100)

    port = Portfolio.query.filter_by(user_id=user_id).first()
    if not port:
        return jsonify({'error': 'Портфель не найден'}), 404

    items = []

    # фильтр — только сделки
    if type_filter in ('', 'trade', 'buy', 'sell'):
        trade_query = Trade.query.filter_by(portfolio_id=port.id)
        if type_filter in ('buy', 'sell'):
            trade_query = trade_query.filter_by(direction=type_filter)
        trades = trade_query.all()
        for t in trades:
            items.append({**t.to_dict(), 'item_type': 'trade'})

    # фильтр — только начисления
    if type_filter in ('', 'dividend', 'coupon'):
        accrual_query = Accrual.query.filter_by(portfolio_id=port.id)
        if type_filter in ('dividend', 'coupon'):
            accrual_query = accrual_query.filter_by(type=type_filter)
        accruals = accrual_query.all()
        for a in accruals:
            items.append({**a.to_dict(), 'item_type': 'accrual'})

    # сортируем по дате убыванию
    items.sort(key=lambda x: x.get('executed_at') or x.get('accrued_at'), reverse=True)

    # пагинация вручную
    total      = len(items)
    start      = (page - 1) * per_page
    end        = start + per_page
    page_items = items[start:end]
    pages      = (total + per_page - 1) // per_page

    return jsonify({
        'items':    page_items,
        'page':     page,
        'pages':    pages,
        'total':    total,
        'has_next': page < pages,
    }), 200


# ── LEADERBOARD ───────────────────────────────────────────────────────────────

@portfolio_bp.route('/leaderboard', methods=['GET'])
@jwt_required()
def leaderboard():
    user_id = int(get_jwt_identity())

    portfolios = Portfolio.query.all()

    result = []
    for port in portfolios:
        if not port.initial_cash:
            continue

        positions  = Position.query.filter_by(portfolio_id=port.id).all()
        tickers    = [p.ticker for p in positions]
        price_map  = {
            lp.ticker: float(lp.price)
            for lp in LastPrice.query.filter(LastPrice.ticker.in_(tickers)).all()
        }

        pos_value = sum(
            price_map.get(p.ticker, float(p.avg_price)) * p.quantity
            for p in positions
        )
        total_value = float(port.cash) + pos_value
        roi         = (total_value / float(port.initial_cash) - 1) * 100

        result.append({
            'user_id':    port.user_id,
            'name':       port.user.name,
            'total_value': total_value,
            'roi':         round(roi, 2),
            'is_me':       port.user_id == user_id,
        })

    result.sort(key=lambda x: x['roi'], reverse=True)

    # нумеруем позиции
    for i, row in enumerate(result, 1):
        row['rank'] = i

    return jsonify({'leaderboard': result[:50]}), 200


# ── DEPOSIT ───────────────────────────────────────────────────────────────────

@portfolio_bp.route('/deposit', methods=['POST'])
@jwt_required()
def deposit():
    user_id = int(get_jwt_identity())
    data    = request.get_json(silent=True)

    if not data or not data.get('amount'):
        return jsonify({'error': 'Укажите сумму пополнения'}), 400

    amount = float(data['amount'])
    if amount <= 0:
        return jsonify({'error': 'Сумма должна быть больше нуля'}), 400

    port = Portfolio.query.filter_by(user_id=user_id).first()
    if not port:
        return jsonify({'error': 'Портфель не найден'}), 404

    try:
        port.cash         = float(port.cash) + amount
        port.initial_cash = float(port.initial_cash) + amount
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Ошибка пополнения'}), 500

    return jsonify({
        'message': f'Счёт пополнен на {amount} ₽',
        'cash':    float(port.cash),
    }), 200