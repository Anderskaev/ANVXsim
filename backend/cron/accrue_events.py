# cron/accrue_events.py
# Запуск: раз в день в 06:00
# Начисляет дивиденды и купоны в виртуальные портфели

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

import time
from datetime import datetime, date, timedelta
from app import create_app, db
from app.models import Dividend, Coupon, Position

app = create_app()

# начисляем за вчера

ACCRUAL_DATE = date.today() - timedelta(days=1)


def accrue(ticker, sec_type, registry_date, amount_per_share):
    """
    Начисляет выплату всем портфелям у которых есть позиция по тикеру.
    Использует ROW_COUNT() чтобы не начислять дважды.
    Возвращает количество реальных начислений.
    """
    positions = Position.query.filter_by(ticker=ticker).all()
    accrued   = 0

    for pos in positions:
        total_amount = float(amount_per_share) * pos.quantity

        try:
            # пытаемся вставить accrual
            db.session.execute(
                db.text("""
                    INSERT INTO accruals
                        (portfolio_id, ticker, type, amount, quantity, source_date, accrued_at)
                    VALUES
                        (:portfolio_id, :ticker, :type, :amount, :quantity, :source_date, NOW())
                    ON DUPLICATE KEY UPDATE id = id
                """),
                {
                    'portfolio_id': pos.portfolio_id,
                    'ticker':       ticker,
                    'type':         sec_type,
                    'amount':       total_amount,
                    'quantity':     pos.quantity,
                    'source_date':  registry_date,
                }
            )

            # ROW_COUNT() = 1 если INSERT прошёл, 0 если был дубль
            row_count = db.session.execute(
                db.text('SELECT ROW_COUNT()')
            ).scalar()

            if row_count == 1:
                # начисляем cash только если accrual реально вставился
                db.session.execute(
                    db.text("""
                        UPDATE portfolios
                        SET cash = cash + :amount
                        WHERE id = :portfolio_id
                    """),
                    {
                        'amount':       total_amount,
                        'portfolio_id': pos.portfolio_id,
                    }
                )
                accrued += 1

        except Exception as e:
            print(f'  Ошибка начисления {ticker} → portfolio {pos.portfolio_id}: {e}')
            db.session.rollback()
            continue

    return accrued


with app.app_context():
    start_time     = time.time()
    total_accruals = 0

    # ── дивиденды ─────────────────────────────────────────────
    dividends = Dividend.query.filter_by(registry_date=ACCRUAL_DATE).all()
    print(f'Дивиденды на {ACCRUAL_DATE}: {len(dividends)} бумаг')

    for div in dividends:
        iter_start = time.time()
        count      = accrue(div.ticker, 'dividend', ACCRUAL_DATE, div.amount)

        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            print(f'  Ошибка commit дивиденд {div.ticker}: {e}')
            continue

        elapsed       = time.time() - iter_start
        total_elapsed = time.time() - start_time
        total_accruals += count
        print(
            f'  {div.ticker} | {count} портфелей | '
            f'{elapsed:.1f}с | всего {total_elapsed:.0f}с'
        )

    # ── купоны ───────────────────────────────────────────────
    coupons = Coupon.query.filter_by(coupon_date=ACCRUAL_DATE).all()
    print(f'\nКупоны на {ACCRUAL_DATE}: {len(coupons)} облигаций')

    for coupon in coupons:
        iter_start = time.time()
        count      = accrue(coupon.ticker, 'coupon', ACCRUAL_DATE, coupon.amount)

        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            print(f'  Ошибка commit купон {coupon.ticker}: {e}')
            continue

        elapsed       = time.time() - iter_start
        total_elapsed = time.time() - start_time
        total_accruals += count
        print(
            f'  {coupon.ticker} | {count} портфелей | '
            f'{elapsed:.1f}с | всего {total_elapsed:.0f}с'
        )

    print(
        f'\n[{datetime.utcnow()}] accrue_events: '
        f'начислено {total_accruals} выплат | '
        f'всего {time.time() - start_time:.0f}с'
    )