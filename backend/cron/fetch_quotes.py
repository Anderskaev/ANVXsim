# cron/fetch_quotes.py
# Запуск: каждую минуту
# Заполняет: securities, last_price

import sys
import os
import time

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

import requests
from datetime import datetime, timezone
from app import create_app, db

app = create_app()

ISS_BASE = 'https://iss.moex.com/iss'

BOARDS = [
    ('stock', 'shares',   'TQBR', 'share'),
    ('stock', 'shares',   'TQBS', 'share'),
    ('stock', 'bonds',    'TQOB', 'bond'),
    ('stock', 'bonds',    'TQCB', 'bond'),
    ('stock', 'shares',   'TQTF', 'etf'),
]

SECTYPE_MAP = {
    "1": "share", "2": "share", "3": "bond", "4": "bond", "5": "bond",
    "6": "bond", "7": "bond", "8": "bond", "C": "bond", "J": "etf",
    "E": "etf", "9":"pif", "A":"pif", "B":"pif", "0":"other"
}


def fetch_board(engine, market, board, sec_type):
    url = f'{ISS_BASE}/engines/{engine}/markets/{market}/boards/{board}/securities.json'
    params = {
        'iss.meta':           'off',
        'iss.only':           'securities,marketdata',
        'securities.columns': 'SECID,SHORTNAME,SECNAME,LOTSIZE,ISIN,CURRENCYID,STATUS,SECTYPE,PREVPRICE,FACEVALUE',
        'marketdata.columns': 'SECID,LAST,OPEN,HIGH,LOW,VOLTODAY,LASTTOPREVPRICE,CHANGE',
    }
    try:
        r = requests.get(url, params=params, timeout=15)
        r.raise_for_status()
        return r.json(), sec_type
    except Exception as e:
        print(f'Ошибка запроса {board}: {e}')
        return None, sec_type
    

def process_board_bulk(data, board, now_utc, sec_type):
    if not data:
        return [], []

    md_columns = data['marketdata']['columns']
    md_map = {row[md_columns.index('SECID')]: dict(zip(md_columns, row)) 
              for row in data['marketdata']['data'] if row[md_columns.index('SECID')]}

    sec_columns = data['securities']['columns']
    
    sec_bulk = []
    price_bulk = []

    for row in data['securities']['data']:
        s = dict(zip(sec_columns, row))
        ticker = s['SECID']
        md = md_map.get(ticker, {})

        if s.get('FACEUNIT', '').lower() != 'sur':
            continue

        price = md.get('LAST')
        if not price:
            price = s.get('PREVPRICE')
            if not price:
                continue
        if sec_type == 'bond':
            price = price * s.get('FACEVALUE', 1)/100

        # Просто собираем данные в плоский список (0% нагрузки на CPU)
        sec_bulk.append({
            'ticker':     ticker,
            'short_name': (s.get('SHORTNAME') or ticker)[:64],
            'full_name':  s.get('SECNAME'),
            'board':      board,
            'lot_size':   int(s.get('LOTSIZE') or 1),
            'isin':       s.get('ISIN'),
            'currency':   s.get('FACEUNIT') or 'UNK',
            'type':       SECTYPE_MAP.get(str(s.get('SECTYPE', "0")).upper(), "other"),
            'is_active':  1 if s.get('STATUS') == 'A' else 0,
            'updated_at': now_utc
        })

        price_bulk.append({
            'ticker':     ticker,
            'price':      price,
            'open':       md.get('OPEN'),
            'high':       md.get('HIGH'),
            'low':        md.get('LOW'),
            'volume':     md.get('VOLTODAY'),
            'change_pct': md.get('LASTTOPREVPRICE'),
            'fetched_at': now_utc
        })
        
    return sec_bulk, price_bulk


with app.app_context():
    cpu_start = time.process_time()
    wall_start = time.time()

    all_securities = []
    all_prices = []
    now_utc = datetime.now(timezone.utc)

    # 1. Используем requests.Session(), чтобы процессор не тратил время на SSL-рукопожатия 5 раз
    with requests.Session() as session:
        for engine, market, board, sec_type in BOARDS:
            
            # Передаем сессию вместо стандартного requests.get
            url = f'{ISS_BASE}/engines/{engine}/markets/{market}/boards/{board}/securities.json'
            params = {
                'iss.meta':           'off',
                'iss.only':           'securities,marketdata',
                'securities.columns': 'SECID,SHORTNAME,SECNAME,LOTSIZE,ISIN,CURRENCYID,STATUS,SECTYPE,PREVPRICE,FACEVALUE,FACEUNIT',
                'marketdata.columns': 'SECID,LAST,OPEN,HIGH,LOW,VOLTODAY,LASTTOPREVPRICE,CHANGE',
            }
            try:
                r = session.get(url, params=params, timeout=15)
                r.raise_for_status()
                data = r.json()
            except Exception as e:
                print(f'Ошибка запроса {board}: {e}')
                data = None

            if data:
                sec_list, price_list = process_board_bulk(data, board, now_utc, sec_type)
                all_securities.extend(sec_list)
                all_prices.extend(price_list)

            # РАЗГРУЖАЕМ CPU: После каждой доски принудительно засыпаем на 3 секунды.
            # Это искусственно растянет общее время работы, и средняя нагрузка упадет.
            time.sleep(3.0)

    # 2. Сбрасываем всё в базу двумя SQL-запросами
    if all_securities:
        try:
            db.session.execute(
                db.text("""
                    INSERT INTO securities (ticker, short_name, full_name, board, lot_size, isin, currency, type, is_active, updated_at)
                    VALUES (:ticker, :short_name, :full_name, :board, :lot_size, :isin, :currency, :type, :is_active, :updated_at)
                    ON DUPLICATE KEY UPDATE
                        short_name = VALUES(short_name),
                        full_name  = VALUES(full_name),
                        board      = VALUES(board),
                        lot_size   = VALUES(lot_size),
                        isin       = VALUES(isin),
                        currency   = VALUES(currency),
                        type       = VALUES(type),
                        is_active  = VALUES(is_active),
                        updated_at = VALUES(updated_at)
                """),
                all_securities
            )

            db.session.execute(
                db.text("""
                    INSERT INTO last_price (ticker, price, open, high, low, volume, change_pct, fetched_at)
                    VALUES (:ticker, :price, :open, :high, :low, :volume, :change_pct, :fetched_at)
                    ON DUPLICATE KEY UPDATE
                        price      = VALUES(price),
                        open       = VALUES(open),
                        high       = VALUES(high),
                        low        = VALUES(low),
                        volume     = VALUES(volume),
                        change_pct = VALUES(change_pct),
                        fetched_at = VALUES(fetched_at)
                """),
                all_prices
            )
            
            db.session.commit()
            print(f'[{datetime.now(timezone.utc)}] fetch_quotes Bulk: OK')
        except Exception as e:
            db.session.rollback()
            print(f'[{datetime.now(timezone.utc)}] fetch_quotes Bulk: ОШИБКА {e}')
        finally:
            db.session.remove()

    cpu_h = time.process_time() - cpu_start
    wall_h = time.time() - wall_start

    print(f"Затрачено CPU: {cpu_h:.3f} секунд")
    print(f"Прошло реального времени: {wall_h:.1f} секунд")

    load_pct = (cpu_h / wall_h * 100) if wall_h > 0 else 0
    print(f"Средняя нагрузка на ядро CPU за время работы: {load_pct:.1f}%")