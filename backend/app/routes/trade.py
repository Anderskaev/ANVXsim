# app/routes/trade.py

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timezone, timedelta

from app import db
from app.models import Portfolio, Position, Trade, LastPrice, Security

trade_bp = Blueprint('trade', __name__)

SPREAD     = 0.001   # 0.1%
COMMISSION = 0.001   # 0.1%
MAX_PRICE_AGE_MINUTES = 5


# ── TRADE ─────────────────────────────────────────────────────────────────────

@trade_bp.route('', methods=['POST'])
@jwt_required()
def trade():
    user_id = int(get_jwt_identity())
    data    = request.get_json(silent=True)

    if not data:
        return jsonify({'error': 'Тело запроса должно быть JSON'}), 400

    # валидация
    required = ['ticker', 'direction', 'quantity']
    missing  = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({'error': f'Обязательные поля: {", ".join(missing)}'}), 400

    ticker    = data['ticker'].upper().strip()
    direction = data['direction'].lower().strip()
    quantity  = int(data['quantity'])

    if direction not in ('buy', 'sell'):
        return jsonify({'error': 'direction должен быть buy или sell'}), 400

    if quantity <= 0:
        return jsonify({'error': 'quantity должен быть больше нуля'}), 400

    # проверяем бумагу
    sec = Security.query.filter_by(ticker=ticker, is_active=True).first()
    if not sec:
        return jsonify({'error': 'Бумага не найдена или не торгуется'}), 404

    # проверяем количество кратно лоту
    if quantity % sec.lot_size != 0:
        return jsonify({
            'error': f'Количество должно быть кратно размеру лота ({sec.lot_size})'
        }), 400

    # проверяем актуальность цены
    lp = LastPrice.query.filter_by(ticker=ticker).first()
    if not lp:
        return jsonify({'error': 'Нет данных о цене бумаги'}), 400

    price_age = datetime.now(timezone.utc) - lp.fetched_at.replace(tzinfo=timezone.utc)
    if price_age > timedelta(minutes=MAX_PRICE_AGE_MINUTES):
        return jsonify({
            'error': f'Цена устарела (обновлена {int(price_age.total_seconds() // 60)} мин назад). Попробуйте позже.'
        }), 400

    # цена исполнения со спредом
    base_price = float(lp.price)
    coupon = float(lp.coupon)
    exec_price = base_price * (1 + SPREAD) if direction == 'buy' else base_price * (1 - SPREAD)
    subtotal   = (exec_price + coupon) * quantity
    commission = exec_price * quantity * COMMISSION
    total      = subtotal + commission if direction == 'buy' else subtotal - commission

    # портфель
    port = Portfolio.query.filter_by(user_id=user_id).first()
    if not port:
        return jsonify({'error': 'Портфель не найден'}), 404

    try:
        if direction == 'buy':
            # проверяем хватает ли денег
            if float(port.cash) < total:
                return jsonify({
                    'error':     'Недостаточно средств',
                    'required':  round(total, 2),
                    'available': round(float(port.cash), 2),
                }), 400

            port.cash = float(port.cash) - total

            # обновляем позицию
            pos = Position.query.filter_by(
                portfolio_id=port.id, ticker=ticker
            ).first()

            if pos:
                # пересчитываем среднюю цену
                new_qty      = pos.quantity + quantity
                pos.avg_price = (float(pos.avg_price) * pos.quantity + exec_price * quantity) / new_qty
                pos.quantity  = new_qty
            else:
                pos = Position(
                    portfolio_id=port.id,
                    ticker=ticker,
                    quantity=quantity,
                    avg_price=exec_price,
                )
                db.session.add(pos)

        else:  # sell
            pos = Position.query.filter_by(
                portfolio_id=port.id, ticker=ticker
            ).first()

            if not pos or pos.quantity < quantity:
                available = pos.quantity if pos else 0
                return jsonify({
                    'error':     'Недостаточно бумаг',
                    'required':  quantity,
                    'available': available,
                }), 400

            port.cash    = float(port.cash) + total
            pos.quantity = pos.quantity - quantity

            # удаляем позицию если продали всё
            if pos.quantity == 0:
                db.session.delete(pos)

        # записываем сделку
        trade_record = Trade(
            portfolio_id=port.id,
            ticker=ticker,
            direction=direction,
            quantity=quantity,
            price=exec_price,
            commission=commission,
            coupon=coupon,
            total=total,
        )
        db.session.add(trade_record)
        db.session.commit()

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Ошибка исполнения заявки: {str(e)}'}), 500

    return jsonify({
        'message':    f'Заявка исполнена',
        'trade':      trade_record.to_dict(),
        'exec_price': round(exec_price, 4),
        'commission': round(commission, 4),
        'total':      round(total, 2),
        'cash':       round(float(port.cash), 2),
    }), 201