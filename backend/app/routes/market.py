# app/routes/market.py

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
import requests
from datetime import date, timedelta

from app import db
from app.models import Security, LastPrice, Candle, Dividend, Coupon

market_bp = Blueprint('market', __name__)

ISS_BASE = 'https://iss.moex.com/iss'

TIMEFRAME_DAYS = {
    '1Д': 1,
    '1Н': 7,
    '1М': 30,
    '3М': 90,
    '6М': 180,
}


# ── MARKET LIST ───────────────────────────────────────────────────────────────

@market_bp.route('', methods=['GET'])
@jwt_required()
def market():
    page     = request.args.get('page',   1,     type=int)
    per_page = request.args.get('limit',  50,    type=int)
    search   = request.args.get('search', '',    type=str).strip()
    sec_type = request.args.get('type',   '',    type=str).strip()
    sort_by  = request.args.get('sort',   'ticker', type=str)
    order    = request.args.get('order',  'asc', type=str)

    # ограничиваем per_page чтобы не тянуть всё сразу
    per_page = min(per_page, 100)

    query = Security.query.filter_by(is_active=True)

    if search:
        query = query.filter(
            db.or_(
                Security.ticker.ilike(f'%{search}%'),
                Security.short_name.ilike(f'%{search}%'),
            )
        )

    if sec_type in ('share', 'bond', 'etf', 'currency'):
        query = query.filter_by(type=sec_type)

    # сортировка
    sort_map = {
        'ticker':     Security.ticker,
        'short_name': Security.short_name,
    }
    sort_col = sort_map.get(sort_by, Security.ticker)
    query    = query.order_by(sort_col.asc() if order == 'asc' else sort_col.desc())

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    securities = pagination.items

    # подтягиваем last_price одним запросом
    tickers   = [s.ticker for s in securities]
    prices    = LastPrice.query.filter(LastPrice.ticker.in_(tickers)).all()
    price_map = {p.ticker: p for p in prices}

    result = []
    for sec in securities:
        d  = sec.to_dict()
        lp = price_map.get(sec.ticker)
        if lp:
            d['price']      = float(lp.price)
            d['change_pct'] = float(lp.change_pct) if lp.change_pct is not None else None
            d['volume']     = lp.volume
            d['fetched_at'] = lp.fetched_at.isoformat()
        else:
            d['price']      = None
            d['change_pct'] = None
            d['volume']     = None
            d['fetched_at'] = None
        result.append(d)

    return jsonify({
        'items':    result,
        'page':     page,
        'pages':    pagination.pages,
        'total':    pagination.total,
        'has_next': pagination.has_next,
    }), 200


# ── SECURITY CARD ─────────────────────────────────────────────────────────────

@market_bp.route('/security/<ticker>', methods=['GET'])
@jwt_required()
def security(ticker):
    sec = Security.query.filter_by(ticker=ticker.upper(), is_active=True).first()
    if not sec:
        return jsonify({'error': 'Бумага не найдена'}), 404

    lp = LastPrice.query.filter_by(ticker=ticker.upper()).first()

    # ближайшие дивиденды (будущие + последние 3 прошлых)
    upcoming_divs = Dividend.query.filter(
        Dividend.ticker == ticker.upper(),
        Dividend.registry_date >= date.today(),
    ).order_by(Dividend.registry_date.asc()).limit(5).all()

    past_divs = Dividend.query.filter(
        Dividend.ticker == ticker.upper(),
        Dividend.registry_date < date.today(),
    ).order_by(Dividend.registry_date.desc()).limit(3).all()

    # ближайшие купоны (только для облигаций)
    upcoming_coupons = []
    if sec.type == 'bond':
        upcoming_coupons = Coupon.query.filter(
            Coupon.ticker == ticker.upper(),
            Coupon.coupon_date >= date.today(),
        ).order_by(Coupon.coupon_date.asc()).limit(5).all()

    result = sec.to_dict()

    if lp:
        result['price']      = float(lp.price)
        result['open']       = float(lp.open)       if lp.open       else None
        result['high']       = float(lp.high)       if lp.high       else None
        result['low']        = float(lp.low)        if lp.low        else None
        result['volume']     = lp.volume
        result['change_pct'] = float(lp.change_pct) if lp.change_pct is not None else None
        result['fetched_at'] = lp.fetched_at.isoformat()
    else:
        result['price'] = None

    result['dividends'] = [d.to_dict() for d in upcoming_divs + list(reversed(past_divs))]
    result['coupons']   = [c.to_dict() for c in upcoming_coupons]

    return jsonify(result), 200


# ── CHART ─────────────────────────────────────────────────────────────────────

@market_bp.route('/chart/<ticker>', methods=['GET'])
@jwt_required()
def chart(ticker):
    tf    = request.args.get('tf',    '1М',  type=str)
    limit = request.args.get('limit', 30,    type=int)

    # ограничиваем limit
    limit = min(limit, 60)

    days = TIMEFRAME_DAYS.get(tf)
    if not days:
        return jsonify({'error': f'Неверный таймфрейм. Допустимые: {list(TIMEFRAME_DAYS.keys())}'}), 400

    sec = Security.query.filter_by(ticker=ticker.upper()).first()
    if not sec:
        return jsonify({'error': 'Бумага не найдена'}), 404

    date_from = date.today() - timedelta(days=days)

    candles = Candle.query.filter(
        Candle.ticker == ticker.upper(),
        Candle.date   >= date_from,
    ).order_by(Candle.date.desc()).limit(limit).all()

    # возвращаем в хронологическом порядке
    candles = list(reversed(candles))

    return jsonify({
        'ticker':  ticker.upper(),
        'tf':      tf,
        'candles': [c.to_dict() for c in candles],
    }), 200


# ── ORDERBOOK ─────────────────────────────────────────────────────────────────
# Платно от MOEX. Пока пусть висит
# @market_bp.route('/orderbook/<ticker>', methods=['GET'])
# @jwt_required()
# def orderbook(ticker):
#     sec = Security.query.filter_by(ticker=ticker.upper(), is_active=True).first()
#     if not sec:
#         return jsonify({'error': 'Бумага не найдена'}), 404

#     market_map = {
#         'share':    'shares',
#         'etf':      'shares',
#         'bond':     'bonds',
#         'currency': 'currency',
#     }
#     market_name = market_map.get(sec.type, 'shares')

#     url = (
#         f'{ISS_BASE}/engines/stock/markets/{market_name}'
#         f'/boards/{sec.board}/securities/{ticker.upper()}/orderbook.json'
#     )
#     try:
#         r = requests.get(url, params={'iss.meta': 'off'}, timeout=10)
#         r.raise_for_status()
#         data    = r.json()
#         columns = data['orderbook']['columns']
#         rows    = data['orderbook']['data']

#         bids = []  # покупка
#         asks = []  # продажа

#         for row in rows:
#             d         = dict(zip(columns, row))
#             buysell   = d.get('BUYSELL')
#             price     = d.get('PRICE')
#             quantity  = d.get('QUANTITY')

#             if not price or not quantity:
#                 continue

#             entry = {'price': float(price), 'quantity': int(quantity)}
#             if buysell == 'B':
#                 bids.append(entry)
#             elif buysell == 'S':
#                 asks.append(entry)

#         # bids по убыванию цены, asks по возрастанию
#         bids.sort(key=lambda x: x['price'], reverse=True)
#         asks.sort(key=lambda x: x['price'])

#         return jsonify({
#             'ticker': ticker.upper(),
#             'bids':   bids[:20],
#             'asks':   asks[:20],
#         }), 200

#     except requests.exceptions.Timeout:
#         return jsonify({'error': 'ISS не отвечает, попробуйте позже'}), 503
#     except Exception as e:
#         return jsonify({'error': f'Ошибка получения стакана: {url}{str(e)}'}), 503