# app/routes/market.py

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
import requests
from datetime import date, timedelta
from itertools import groupby
from datetime import datetime, timedelta, timezone
import os
import time

from requests_ratelimiter import LimiterSession

from app import db, cache
from app.models import Amortization, Security, LastPrice, Candle, Dividend, Coupon

market_bp = Blueprint('market', __name__)

ISS_BASE = 'https://iss.moex.com/iss'

TIMEFRAME_DAYS = {
    '1Д': 1,
    '1Н': 7,
    '1М': 30,
    '3М': 90,
    '6М': 180,
}

TIMEFRAME_ISS = {
    '1м': 1,
    '10м': 10,
    '1Ч': 60,
    '1Д': 24,
    '1Н': 7,
    '1М': 31,
    '1К': 4
}

session = LimiterSession(per_second=5)  # не более 5 запросов в секунду к ISS

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

    if sec_type in ('share', 'bond', 'etf', 'currency','pif','other'):
        query = query.filter_by(type=sec_type)

    # сортировка
    sort_map = {
        'ticker':     Security.ticker,
        'short_name': Security.short_name,
        'price':      LastPrice.price,
        'change_pct': LastPrice.change_pct,
        'volume':     LastPrice.volume,
    }

    sort_col = sort_map.get(sort_by, Security.ticker)
    
    order_fn = sort_col.asc() if order == 'asc' else sort_col.desc()

    if sort_by in ('price', 'change_pct', 'volume'):
        query = query.outerjoin(
        LastPrice, LastPrice.ticker == Security.ticker
        ).order_by(order_fn)
    else:
        query = query.order_by(order_fn)

    #query    = query.order_by(sort_col.asc() if order == 'asc' else sort_col.desc())

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

    upcoming_amort = []
    if sec.type == 'bond':
        upcoming_amort = Amortization.query.filter(
            Amortization.ticker == ticker.upper(),
            Amortization.amort_date >= date.today(),
        ).order_by(Amortization.amort_date.asc()).limit(5).all()        

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
    result['amortizations'] = [a.to_dict() for a in upcoming_amort]

    return jsonify(result), 200


# ── CHART ─────────────────────────────────────────────────────────────────────

def aggregate_candles(candles, tf):
    if tf == '1Н':
        key_fn = lambda c: c.date.isocalendar()[:2]
    elif tf == '1М':
        key_fn = lambda c: (c.date.year, c.date.month)
    elif tf == '3М':
        key_fn = lambda c: (c.date.year, (c.date.month - 1)//3)
    elif tf == '6М':
        key_fn = lambda c: (c.date.year, (c.date.month - 1)//6)       
    else:
        return [c.to_dict() for c in candles]                
    
    result = []
    for _, group in groupby(candles, key=key_fn):
        group = list(group)
        result.append({
            'date': group[0].date.isoformat(),
            'open': float(group[0].open),
            'high': max(float(c.high) for c in group),
            'low':  min(float(c.high) for c in group),
            'close': float(group[-1].close),
            'volume': sum(c.volume for c in group)
        })
    return result



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

    date_from = date.today() - timedelta(days=limit*days)

    candles = Candle.query.filter(
        Candle.ticker == ticker.upper(),
        Candle.date   >= date_from,
    ).order_by(Candle.date.desc()).limit(limit*days).all()

    # возвращаем в хронологическом порядке
    candles = list(reversed(candles))

    if tf == '1Д':
        result = [c.to_dict() for c in candles[-limit:]]
        return jsonify({'ticker': ticker.upper(), "tf": tf, "candles": result}), 200
            
    result = aggregate_candles(candles, tf)[-limit:]
    return jsonify({'ticker': ticker.upper(), "tf": tf, "candles": result}), 200

INTRADAY_INTERVALS = {1, 10, 60}  # минутные таймфреймы
MSK = timezone(timedelta(hours=3))

def format_candle_date(date_str: str, interval: int) -> str | int:
    if int(interval) in INTRADAY_INTERVALS:

        dt = datetime.strptime(str(date_str)[:19], '%Y-%m-%d %H:%M:%S')
        dt = dt.replace(tzinfo=MSK)
        return int(dt.timestamp())
    return str(date_str)[:10]

# ── CHART2 (from ISS ) ────────────────────────────────────────────────────────
@market_bp.route('/chart2/<ticker>')
@jwt_required()
@cache.cached(timeout=60, query_string=True)
def chart2(ticker):
    
    # limit = request.args.get('limit', 30,    type=int)
    tf    = request.args.get('tf',    '10',  type=str)
    start_date = request.args.get('start_date', None, type=str)
    end_date = request.args.get('end_date', None, type=str)
    start = request.args.get('start_index', None, type=str)
    reverse = request.args.get('reverse', None, type=str)

    # limit=min(limit,60)

    #interval = TIMEFRAME_ISS.get(tf)
    interval = tf
    if not interval:
        return jsonify({'error': f'Неверный таймфрейм. Допустимые: {list(TIMEFRAME_ISS.keys())}'}), 400

    params = {"interval": interval, "iss.meta": 'off'}
    if start_date: params['from'] = start_date
    if end_date:   params['till'] = end_date
    if reverse:   params['iss.reverse'] = reverse
    if start:   params['start'] = start

    sec = Security.query.filter_by(ticker=ticker.upper(), is_active=True).first()
    if not sec:
        return jsonify({'error': 'Бумага не найдена'}), 404

    market_map = {
        'share':    'shares',
        'etf':      'shares',
        'bond':     'bonds',
        'currency': 'currency',
    }
    market_name = market_map.get(sec.type, 'shares')    

    url = (
        f'{ISS_BASE}/engines/stock/markets/{market_name}'
        f'/boards/{sec.board}/securities/{ticker.upper()}/candles.json'
    )    

    try:
        r = session.get(url, params=params, timeout=10)
        r.raise_for_status()
        
        # print('---------------')
        # print(f'***URL: {r.url}')
        data    = r.json()
        columns = data['candles']['columns']
        rows    = data['candles']['data']
        
        if 'begin' in columns:
            indx = columns.index('begin')
            columns[indx] = "date"
        
        columns.append('sdate')

        seen = set()
        candles = []
        for row in rows:
            d = dict(zip(columns, row))
            d['sdate'] = d['date']
            if 'date' in d and d['date']:
                d['date'] = format_candle_date(d['date'], interval)
            date_key = d.get('date')
            if date_key in seen:
                continue
            seen.add(date_key)
            candles.append(d)
        candles.sort(key=lambda x: x['date'])

        return jsonify({
            'ticker': ticker.upper(),
            'tf': tf,
            #'candles': [dict(zip(columns, row)) for row in rows]
            'candles': candles
        }), 200

    except requests.exceptions.Timeout:
        return jsonify({'error': 'ISS не отвечает, попробуйте позже'}), 503
    except Exception as e:
        return jsonify({'error': f'Ошибка получения свечей: {url}{str(e)}'}), 503
    
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