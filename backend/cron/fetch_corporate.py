# cron/fetch_corporate.py
# Запуск: раз в день в 03:00
# Заполняет: dividends, coupons

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

import requests
import time
from datetime import datetime
from app import create_app, db
from app.models import Security, Dividend, Coupon

app = create_app()

ISS_BASE = 'https://iss.moex.com/iss'


def fetch_dividends(ticker):
    url = f'{ISS_BASE}/securities/{ticker}/dividends.json'
    try:
        r = requests.get(url, params={'iss.meta': 'off'}, timeout=15)
        r.raise_for_status()
        data     = r.json()
        columns  = data['dividends']['columns']
        rows     = data['dividends']['data']
        return [dict(zip(columns, row)) for row in rows]
    except Exception as e:
        print(f'  Дивиденды {ticker}: {e}')
        return []


def fetch_coupons(ticker):
    url = (
        f'{ISS_BASE}/statistics/engines/stock/markets/bonds'
        f'/bondization/{ticker}.json'
    )
    try:
        r = requests.get(url, params={'iss.meta': 'off'}, timeout=15)
        r.raise_for_status()
        data    = r.json()
        columns = data['coupons']['columns']
        rows    = data['coupons']['data']
        return [dict(zip(columns, row)) for row in rows]
    except Exception as e:
        print(f'  Купоны {ticker}: {e}')
        return []


with app.app_context():
    # ── дивиденды — только акции ──────────────────────────────
    shares = Security.query.filter_by(is_active=True, type='share').all()
    print(f'Дивиденды: {len(shares)} акций')

    for sec in shares:
        rows = fetch_dividends(sec.ticker)
        for d in rows:
            if not d.get('registryclosedate') or not d.get('value'):
                continue
            div = Dividend(
                ticker        = sec.ticker,
                registry_date = d['registryclosedate'],
                payment_date  = d.get('paymentdate'),
                amount        = d['value'],
                currency      = d.get('currencyid') or 'RUB',
            )
            db.session.merge(div)
        time.sleep(0.3)

    # ── купоны — только облигации ─────────────────────────────
    bonds = Security.query.filter_by(is_active=True, type='bond').all()
    print(f'Купоны: {len(bonds)} облигаций')

    for sec in bonds:
        rows = fetch_coupons(sec.ticker)
        for c in rows:
            if not c.get('coupondate') or not c.get('value'):
                continue
            coupon = Coupon(
                ticker      = sec.ticker,
                coupon_date = c['coupondate'],
                amount      = c['value'],
                accrued_int = c.get('accruedint'),
            )
            db.session.merge(coupon)
        time.sleep(0.3)

    try:
        db.session.commit()
        print(f'[{datetime.utcnow()}] fetch_corporate: OK')
    except Exception as e:
        db.session.rollback()
        print(f'[{datetime.utcnow()}] fetch_corporate: ОШИБКА {e}')