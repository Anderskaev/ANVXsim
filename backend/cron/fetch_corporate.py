# cron/fetch_corporate.py
# Запуск: раз в день в 03:00
# Заполняет: dividends, coupons, amortizations

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

import requests
import time
from datetime import datetime, timezone
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
    all_coupons = {}
    all_amortizations = {}
    
    # 1. Цикл для сбора ВСЕХ купонов
    start_coupons = 0
    while True:
        url = f'{ISS_BASE}/statistics/engines/stock/markets/bonds/bondization/{ticker}.json'
        params = {
            'iss.meta': 'off',
            'iss.only': 'coupons',
            'coupons.start': start_coupons
        }
        try:
            r = requests.get(url, params=params, timeout=15)
            r.raise_for_status()
            data = r.json()
            
            columns = data['coupons']['columns']
            rows = data['coupons']['data']
            
            if not rows:
                break
                
            for row in rows:
                item = dict(zip(columns, row))
                all_coupons[item['coupondate']] = item
                
            start_coupons += len(rows)
        except Exception as e:
            print(f' Ошибка при загрузке купонов {ticker} (start={start_coupons}): {e}')
            break

    # 2. Цикл для сбора ВСЕХ амортизаций
    start_amort = 0
    while True:
        url = f'{ISS_BASE}/statistics/engines/stock/markets/bonds/bondization/{ticker}.json'
        params = {
            'iss.meta': 'off',
            'iss.only': 'amortizations',
            'amortizations.start': start_amort
        }
        try:
            r = requests.get(url, params=params, timeout=15)
            r.raise_for_status()
            data = r.json()
            
            amort_columns = data['amortizations']['columns']
            amort_rows = data['amortizations']['data']
            
            if not amort_rows:
                break
                
            for row in amort_rows:
                item = dict(zip(amort_columns, row))
                all_amortizations[item['amortdate']] = item
                
            start_amort += len(amort_rows)
        except Exception as e:
            print(f' Ошибка при загрузке амортизаций {ticker} (start={start_amort}): {e}')
            break

    sorted_coupons = [all_coupons[k] for k in sorted(all_coupons.keys())]
    sorted_amorts = [all_amortizations[k] for k in sorted(all_amortizations.keys())]

    return sorted_coupons, sorted_amorts


with app.app_context():
    start_time = time.time()

    # ── БЛОК 1: КУПОНЫ И АМОРТИЗАЦИИ (ОБЛИГАЦИИ) ─────────────────
    bonds = Security.query.filter_by(is_active=True, type='bond').all()
    print(f'\nКупоны и амортизации: {len(bonds)} облигаций')

    bulk_amortizations = []
    bulk_coupons = []

    for i, sec in enumerate(bonds, 1):
        iter_start = time.time()
        rows, amort = fetch_coupons(sec.ticker)
        
        # Сбор амортизаций в память
        for a in amort:
            if not a.get('amortdate') or not a.get('value_rub'):
                continue
            bulk_amortizations.append({
                'ticker':     sec.ticker,
                'amort_date': a['amortdate'],
                'amount':      a['value_rub'],
                'currency':    a.get('currencyid') or 'RUB',
            })
  
        # Сбор купонов в память
        for c in rows:
            if not c.get('coupondate') or not c.get('value_rub'):
                continue
            bulk_coupons.append({
                'ticker':      sec.ticker,
                'coupon_date': c['coupondate'],
                'amount':      c['value_rub'],
                'currency':    c.get('currencyid') or 'RUB',
            })

        elapsed = time.time() - iter_start
        print(f'[{i}/{len(bonds)}] {sec.ticker} | Собран {len(rows)} куп. / {len(amort)} аморт. | {elapsed:.1f}с')
        time.sleep(0.3)

    # Массовый Upsert амортизаций
    if bulk_amortizations:
        print(f'\nЗапись {len(bulk_amortizations)} амортизаций в БД...')
        try:
            db.session.execute(
                db.text("""
                    INSERT INTO amortizations (ticker, amort_date, amount, currency)
                    VALUES (:ticker, :amort_date, :amount, :currency)
                    ON DUPLICATE KEY UPDATE
                        amount   = VALUES(amount),
                        currency = VALUES(currency)
                """),
                bulk_amortizations
            )
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            print(f'  Ошибка массовой записи амортизаций: {e}')

    # Массовый Upsert купонов
    if bulk_coupons:
        print(f'Запись {len(bulk_coupons)} купонов в БД...')
        try:
            db.session.execute(
                db.text("""
                    INSERT INTO coupons (ticker, coupon_date, amount, currency)
                    VALUES (:ticker, :coupon_date, :amount, :currency)
                    ON DUPLICATE KEY UPDATE
                        amount   = VALUES(amount),
                        currency = VALUES(currency)
                """),
                bulk_coupons
            )
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            print(f'  Ошибка массовой записи купонов: {e}')

    db.session.remove()
    print(f'Блок облигаций завершен за {time.time() - start_time:.0f}с')


    # ── БЛОК 2: ДИВИДЕНДЫ (АКЦИИ) ─────────────────────────────────
    shares = Security.query.filter_by(is_active=True, type='share').all()
    print(f'\nДивиденды: {len(shares)} акций')

    bulk_dividends = []
    shares_start_time = time.time()

    for i, sec in enumerate(shares, 1):
        iter_start = time.time()
        rows       = fetch_dividends(sec.ticker)

        # Сбор дивидендов в память
        for d in rows:
            if not d.get('registryclosedate') or not d.get('value'):
                continue
            bulk_dividends.append({
                'ticker':        sec.ticker,
                'registry_date': d['registryclosedate'],
                'payment_date':  d.get('paymentdate'),
                'amount':        d['value'],
                'currency':      d.get('currencyid') or 'RUB',
            })

        elapsed = time.time() - iter_start
        print(f'[{i}/{len(shares)}] {sec.ticker} | Собран {len(rows)} див. | {elapsed:.1f}с')
        time.sleep(0.3)

    # Массовый Upsert дивидендов (Вместо индивидуальных коммитов в цикле)
    if bulk_dividends:
        print(f'\nЗапись {len(bulk_dividends)} дивидендов в БД...')
        try:
            db.session.execute(
                db.text("""
                    INSERT INTO dividends (ticker, registry_date, payment_date, amount, currency)
                    VALUES (:ticker, :registry_date, :payment_date, :amount, :currency)
                    ON DUPLICATE KEY UPDATE
                        payment_date = VALUES(payment_date),
                        amount       = VALUES(amount),
                        currency     = VALUES(currency)
                """),
                bulk_dividends
            )
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            print(f'  Ошибка массовой записи дивидендов: {e}')

    db.session.remove()
    print(f'Блок акций завершен за {time.time() - shares_start_time:.0f}с')

    # Финальный лог с исправленным datetime.now(timezone.utc)
    print(f'\n[{datetime.now(timezone.utc)}] fetch_corporate: OK | всего {time.time() - start_time:.0f}с')