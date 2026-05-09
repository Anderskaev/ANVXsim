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
from app.models import Security

app = create_app()

ISS_BASE = 'https://iss.moex.com/iss'


def fetch_dividends(ticker):
    url = f'{ISS_BASE}/securities/{ticker}/dividends.json'
    try:
        r = requests.get(url, params={'iss.meta': 'off'}, timeout=15)
        r.raise_for_status()
        data    = r.json()
        columns = data['dividends']['columns']
        rows    = data['dividends']['data']
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
        amort_columns = data['amortizations']['columns']
        amort_rows    = data['amortizations']['data']        
        return [dict(zip(columns, row)) for row in rows], [dict(zip(amort_columns, row)) for row in amort_rows]
    except Exception as e:
        print(f'  Купоны и амортизации {ticker}: {e}')
        return []

# def fetch_ammortizations(ticker):
#     url = (
#         f'{ISS_BASE}/statistics/engines/stock/markets/bonds'
#         f'/bondization/{ticker}.json'
#     )
#     try:
#         r = requests.get(url, params={'iss.meta': 'off'}, timeout=15)
#         r.raise_for_status()
#         data    = r.json()
#         columns = data['amortizations']['columns']
#         rows    = data['amortizations']['data']
#         return [dict(zip(columns, row)) for row in rows]
#     except Exception as e:
#         print(f'  Амортизации {ticker}: {e}')
#         return []    


with app.app_context():
    start_time = time.time()

    # ── купоны — только облигации ─────────────────────────────
    bonds = Security.query.filter_by(is_active=True, type='bond').all()
    print(f'\nКупоны и амортизациии: {len(bonds)} облигаций')

    for i, sec in enumerate(bonds, 1):
        iter_start = time.time()
        rows, amort = fetch_coupons(sec.ticker)
        #amort = fetch_ammortizations(sec.ticker)
        amort_count = 0
        count      = 0

        for a in amort:
            if not a.get('ammortdate') or not a.get('value_rub'):
                continue
            try:
                db.session.execute(
                    db.text("""
                        INSERT INTO amortizations (ticker, amort_date, amount, currency)
                        VALUES (:ticker, :amort_date, :amount, :currency)
                        ON DUPLICATE KEY UPDATE
                            payment_date = VALUES(payment_date),
                            amount       = VALUES(amount)
                    """),
                    {
                        'ticker':      sec.ticker,
                        'amort_date': a['amortdate'],
                        'amount':      a['value_rub'],
                        'currency':    a.get('currencyid') or 'RUB',
                    }
                )
                amort_count += 1
            except Exception as e:
                print(f'  Ошибка записи амортизации {sec.ticker}: {e}')
                continue
  
        for c in rows:
            if not c.get('coupondate') or not c.get('value_rub'):
                continue
            try:
                db.session.execute(
                    db.text("""
                        INSERT INTO coupons (ticker, coupon_date, amount, currency)
                        VALUES (:ticker, :coupon_date, :amount, :currency)
                        ON DUPLICATE KEY UPDATE
                            coupon_date = VALUES(coupon_date),
                            amount       = VALUES(amount)
                    """),
                    {
                        'ticker':      sec.ticker,
                        'coupon_date': c['coupondate'],
                        'amount':      c['value_rub'],
                        'currency':    c.get('currencyid') or 'RUB',
                    }
                )
                count += 1
            except Exception as e:
                print(f'  Ошибка записи купона {sec.ticker}: {e}')
                continue

        elapsed       = time.time() - iter_start
        total_elapsed = time.time() - start_time
        print(f'[{i}/{len(bonds)}] {sec.ticker} | {count} купонов | {amort_count} амортизаций | {elapsed:.1f}с | всего {total_elapsed:.0f}с')

        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            print(f'  Ошибка commit {sec.ticker}: {e}')

        time.sleep(0.3)

    # ── дивиденды — только акции ──────────────────────────────
    shares = Security.query.filter_by(is_active=True, type='share').all()
    print(f'Дивиденды: {len(shares)} акций')

    for i, sec in enumerate(shares, 1):
        iter_start = time.time()
        rows       = fetch_dividends(sec.ticker)
        count      = 0

        for d in rows:
            if not d.get('registryclosedate') or not d.get('value'):
                continue
            try:
                db.session.execute(
                    db.text("""
                        INSERT INTO dividends (ticker, registry_date, payment_date, amount, currency)
                        VALUES (:ticker, :registry_date, :payment_date, :amount, :currency)
                        ON DUPLICATE KEY UPDATE
                            payment_date = VALUES(payment_date),
                            amount       = VALUES(amount)
                    """),
                    {
                        'ticker':        sec.ticker,
                        'registry_date': d['registryclosedate'],
                        'payment_date':  d.get('paymentdate'),
                        'amount':        d['value'],
                        'currency':      d.get('currencyid') or 'RUB',
                    }
                )
                count += 1
            except Exception as e:
                print(f'  Ошибка записи дивиденда {sec.ticker}: {e}')
                continue

        elapsed       = time.time() - iter_start
        total_elapsed = time.time() - start_time
        print(f'[{i}/{len(shares)}] {sec.ticker} | {count} записей | {elapsed:.1f}с | всего {total_elapsed:.0f}с')

        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            print(f'  Ошибка commit {sec.ticker}: {e}')

        time.sleep(0.3)

    print(f'\n[{datetime.utcnow()}] fetch_corporate: OK | всего {time.time() - start_time:.0f}с')