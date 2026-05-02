# cron/fetch_history.py
# Запуск: раз в день в 02:00
# Заполняет: candles (incremental load)

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

import requests
import time
from datetime import datetime, date, timedelta
from app import create_app, db
from app.models import Security, Candle
from sqlalchemy import func

app = create_app()

ISS_BASE  = 'https://iss.moex.com/iss'
HISTORY_FROM = (date.today() - timedelta(days=365*5)).isoformat()  # 1 год назад


def fetch_candles(ticker, sec_type, date_from):
    """Загружает свечи начиная с date_from. ISS отдаёт по 100 записей — листаем."""
    market = 'shares' if sec_type in ('share', 'etf') else 'bonds'
    url    = f'{ISS_BASE}/history/engines/stock/markets/{market}/securities/{ticker}.json'

    start   = 0
    results = []

    while True:
        params = {
            'iss.meta': 'off',
            'iss.only': 'history',
            'history.columns': 'TRADEDATE,OPEN,HIGH,LOW,CLOSE,VOLUME',
            'from':    date_from,
            'till':    date.today().isoformat(),
            'start':   start,
        }
        try:
            r = requests.get(url, params=params, timeout=15)
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            print(f'  Ошибка {ticker} start={start}: {e}')
            break

        rows = data['history']['data']
        if not rows:
            break

        results.extend(rows)
        start += len(rows)

        # ISS отдаёт максимум 100 строк за раз
        if len(rows) < 100:
            break

        time.sleep(0.3)  # не долбим ISS

    return results


with app.app_context():
    securities = Security.query.filter_by(is_active=True).all()
    total      = len(securities)
    start_time = time.time()


    for i, sec in enumerate(securities, 1):
        iter_start = time.time()
        # incremental load — смотрим какая последняя дата в БД
        last_date = db.session.query(
            func.max(Candle.date)
        ).filter_by(ticker=sec.ticker).scalar()

        if last_date:
            # грузим только то чего ещё нет
            date_from = (last_date + timedelta(days=1)).isoformat()
        else:
            # первая загрузка — берём год
            date_from = HISTORY_FROM

        if date_from > date.today().isoformat():
            continue  # уже актуально

        # print(f'[{i}/{total}] {sec.ticker} с {date_from}')
        rows = fetch_candles(sec.ticker, sec.type, date_from)

        for row in rows:
            trade_date, open_, high, low, close, volume = row

            if not close:
                continue

            # явный upsert через сырой SQL — merge не работает с составным уникальным ключом
            db.session.execute(
                db.text("""
                    INSERT INTO candles (ticker, date, open, high, low, close, volume)
                    VALUES (:ticker, :date, :open, :high, :low, :close, :volume)
                    ON DUPLICATE KEY UPDATE
                        open   = VALUES(open),
                        high   = VALUES(high),
                        low    = VALUES(low),
                        close  = VALUES(close),
                        volume = VALUES(volume)
                """),
                {
                    'ticker': sec.ticker,
                    'date':   trade_date,
                    'open':   open_  or close,
                    'high':   high   or close,
                    'low':    low    or close,
                    'close':  close,
                    'volume': volume or 0,
                }
            )

        elapsed     = time.time() - iter_start
        total_elapsed = time.time() - start_time
        print(f'[{i}/{total}] {sec.ticker} с {date_from} | {elapsed:.1f}с | всего {total_elapsed:.0f}с')            

        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            print(f'  Ошибка записи {sec.ticker}: {e}')

        time.sleep(0.5)  # пауза между бумагами

    print(f'[{datetime.utcnow()}] fetch_history: OK')