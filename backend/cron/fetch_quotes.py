# cron/fetch_quotes.py
# Запуск: каждую минуту
# Заполняет: securities, last_price

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

import requests
from datetime import datetime
from app import create_app, db
from app.models import Security, LastPrice

app = create_app()

ISS_BASE = 'https://iss.moex.com/iss'

BOARDS = [
    # (engine, market, board, type)
    ('stock', 'shares',   'TQBR', 'share'),
    ('stock', 'shares',   'TQBS', 'share'),  # внесписочные акции
    ('stock', 'bonds',    'TQOB', 'bond'),
    ('stock', 'bonds',    'TQCB', 'bond'),   # корп. облигации
    ('stock', 'shares',   'TQTF', 'etf'),
]


def fetch_board(engine, market, board, sec_type):
    url = (
        f'{ISS_BASE}/engines/{engine}/markets/{market}'
        f'/boards/{board}/securities.json'
    )
    params = {
        'iss.meta':           'off',
        'iss.only':           'securities,marketdata',
        'securities.columns': 'SECID,SHORTNAME,SECNAME,LOTSIZE,ISIN,CURRENCYID',
        'marketdata.columns': 'SECID,LAST,OPEN,HIGH,LOW,VOLTODAY,LASTTOPREVPRICE',
    }
    try:
        r = requests.get(url, params=params, timeout=15)
        r.raise_for_status()
        return r.json(), sec_type
    except Exception as e:
        print(f'Ошибка запроса {board}: {e}')
        return None, sec_type


def process_board(data, sec_type):
    if not data:
        return

    # строим словарь marketdata по тикеру
    md_columns = data['marketdata']['columns']
    md_map     = {}
    for row in data['marketdata']['data']:
        d = dict(zip(md_columns, row))
        md_map[d['SECID']] = d

    sec_columns = data['securities']['columns']

    for row in data['securities']['data']:
        s = dict(zip(sec_columns, row))
        ticker = s['SECID']
        md     = md_map.get(ticker, {})

        # ── upsert security ──────────────────────────────────
        security = Security.query.filter_by(ticker=ticker).first()
        if not security:
            security = Security(ticker=ticker)
            db.session.add(security)

        security.short_name = s.get('SHORTNAME') or ticker
        security.full_name  = s.get('SECNAME')
        security.lot_size   = int(s.get('LOTSIZE') or 1)
        security.isin       = s.get('ISIN')
        security.currency   = s.get('CURRENCYID') or 'RUB'
        security.type       = sec_type
        security.is_active  = True
        security.updated_at = datetime.utcnow()

        # ── определяем цену ──────────────────────────────────
        # если LAST равен null — берём цену закрытия предыдущего дня
        price = md.get('LAST') or md.get('LASTTOPREVPRICE')
        if not price:
            continue  # бумага без цены вообще — пропускаем

        # change_pct = None
        # prev = md.get('LASTTOPREVPRICE')
        # if prev and prev != 0:
        #     change_pct = round((float(price) / float(prev) - 1) * 100, 4)
        change_pct = md.get('CHANGE')            

        # ── upsert last_price ─────────────────────────────────
        lp = LastPrice.query.filter_by(ticker=ticker).first()
        if not lp:
            lp = LastPrice(ticker=ticker)
            db.session.add(lp)

        lp.price      = price
        lp.open       = md.get('OPEN')
        lp.high       = md.get('HIGH')
        lp.low        = md.get('LOW')
        lp.volume     = md.get('VOLTODAY')
        lp.change_pct = change_pct
        lp.fetched_at = datetime.utcnow()


with app.app_context():
    for engine, market, board, sec_type in BOARDS:
        data, sec_type = fetch_board(engine, market, board, sec_type)
        process_board(data, sec_type)

    try:
        db.session.commit()
        print(f'[{datetime.utcnow()}] fetch_quotes: OK')
    except Exception as e:
        db.session.rollback()
        print(f'[{datetime.utcnow()}] fetch_quotes: ОШИБКА {e}')