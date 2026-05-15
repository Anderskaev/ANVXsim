
# cron/fetch_quotes.py
# Запуск: каждую минуту
# Заполняет: securities, last_price

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

import requests
from datetime import datetime, timezone
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

SECTYPE_MAP = {
    "1": "share",
    "2": "share",
    "3": "bond",
    "4": "bond",
    "5": "bond",
    "6": "bond",
    "7": "bond",
    "8": "bond",
    "C": "bond",
    "J": "etf",
    "E": "etf",
    "9":"pif",
    "A":"pif",
    "B":"pif",
    "0":"other"
}


def fetch_board(engine, market, board, sec_type):
    url = (
        f'{ISS_BASE}/engines/{engine}/markets/{market}'
        #f'/securities.json'
         f'/boards/{board}/securities.json'
    )
    params = {
        'iss.meta':           'off',
        'iss.only':           'securities,marketdata',
        'securities.columns': 'SECID,SHORTNAME,SECNAME,LOTSIZE,ISIN,CURRENCYID,STATUS,SECTYPE,PREVPRICE',
        'marketdata.columns': 'SECID,LAST,OPEN,HIGH,LOW,VOLTODAY,LASTTOPREVPRICE,CHANGE',
    }
    try:
        r = requests.get(url, params=params, timeout=15)
        r.raise_for_status()
        return r.json(), sec_type
    except Exception as e:
        print(f'Ошибка запроса {board}: {e}')
        return None, sec_type
    
def process_board(data, sec_type, board):
    if not data:
        return

    md_columns = data['marketdata']['columns']
    md_map     = {}
    for row in data['marketdata']['data']:
        d = dict(zip(md_columns, row))
        md_map[d['SECID']] = d

    sec_columns = data['securities']['columns']

    # ── СНИЖАЕМ НАГРУЗКУ: Кэшируем всё для этой доски за 2 запроса ──
    # Вместо 6000 запросов в цикле делаем всего 2 перед циклом
    existing_securities = {s.ticker: s for s in Security.query.filter_by(board=board).all()}
    existing_prices = {lp.ticker: lp for lp in LastPrice.query.filter(LastPrice.ticker.in_(existing_securities.keys())).all()}

    # Используем одну переменную времени для экономии вызовов
    now_utc = datetime.now(timezone.utc)

    for row in data['securities']['data']:
        s = dict(zip(sec_columns, row))
        ticker = s['SECID']
        md     = md_map.get(ticker, {})

        # ── upsert security ──────────────────────────────────
        # ИСПРАВЛЕНО: берем из памяти, а не из базы
        security = existing_securities.get(ticker)
        if not security:
            security = Security(ticker=ticker)
            db.session.add(security)

        security.short_name = s.get('SHORTNAME') or ticker
        security.full_name  = s.get('SECNAME')
        security.board      = board
        security.lot_size   = int(s.get('LOTSIZE') or 1)
        security.isin       = s.get('ISIN')
        security.currency   = s.get('CURRENCYID') or 'RUB'
        security.type       = SECTYPE_MAP.get(s.get('SECTYPE',"0").upper(),"other")
        security.is_active  = s.get('STATUS')=='A'
        security.updated_at = now_utc

        # ── определяем цену ──────────────────────────────────
        price = md.get('LAST')
        if not price:
            price = s.get('PREVPRICE')
            if not price:
                continue  # бумага без цены вообще — пропускаем

        # ИСПРАВЛЕНО: берем из памяти, а не из базы
        lp = existing_prices.get(ticker)
        if not lp:
            lp = LastPrice(ticker=ticker)
            db.session.add(lp)

        lp.price      = price # точечное исправление из прошлого шага
        lp.open       = md.get('OPEN')
        lp.high       = md.get('HIGH')
        lp.low        = md.get('LOW')
        lp.volume     = md.get('VOLTODAY')
        lp.change_pct = md.get('LASTTOPREVPRICE') # точечное исправление из прошлого шага
        lp.fetched_at = now_utc

with app.app_context():
    for engine, market, board, sec_type in BOARDS:
        data, sec_type = fetch_board(engine, market, board, sec_type)
        process_board(data, sec_type, board)

        try:
            db.session.commit()
            db.session.remove() 

            # ИСПРАВЛЕНО ТУТ:
            print(f'[{datetime.now(timezone.utc)}] Board {board}: OK')
        except Exception as e:
            db.session.rollback()
            db.session.remove()

            # И ТУТ:
            print(f'[{datetime.now(timezone.utc)}] Board {board}: ОШИБКА {e}')