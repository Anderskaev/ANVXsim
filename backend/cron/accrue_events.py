# cron/accrue_events.py
# Запуск: раз в день в 06:00
# Начисляет дивиденды и купоны в виртуальные портфели

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from datetime import datetime, date, timedelta
from app import create_app, db
from app.models import Portfolio, Position, Dividend, Coupon, Accrual

app = create_app()

# начисляем за вчера
ACCRUAL_DATE = date.today() - timedelta(days=1)


with app.app_context():
    total_accruals = 0

    # ── дивиденды ─────────────────────────────────────────────
    dividends = Dividend.query.filter_by(registry_date=ACCRUAL_DATE).all()
    print(f'Дивиденды на {ACCRUAL_DATE}: {len(dividends)} бумаг')

    for div in dividends:
        # находим все позиции по этой бумаге
        positions = Position.query.filter_by(ticker=div.ticker).all()

        for pos in positions:
            amount = float(div.amount) * pos.quantity

            # защита от двойного начисления через UNIQUE KEY
            accrual = Accrual(
                portfolio_id = pos.portfolio_id,
                ticker       = div.ticker,
                type         = 'dividend',
                amount       = amount,
                quantity     = pos.quantity,
                source_date  = ACCRUAL_DATE,
            )
            db.session.merge(accrual)

            # зачисляем на счёт
            portfolio = Portfolio.query.get(pos.portfolio_id)
            if portfolio:
                portfolio.cash = float(portfolio.cash) + amount
                total_accruals += 1

    # ── купоны ───────────────────────────────────────────────
    coupons = Coupon.query.filter_by(coupon_date=ACCRUAL_DATE).all()
    print(f'Купоны на {ACCRUAL_DATE}: {len(coupons)} облигаций')

    for coupon in coupons:
        positions = Position.query.filter_by(ticker=coupon.ticker).all()

        for pos in positions:
            amount = float(coupon.amount) * pos.quantity

            accrual = Accrual(
                portfolio_id = pos.portfolio_id,
                ticker       = coupon.ticker,
                type         = 'coupon',
                amount       = amount,
                quantity     = pos.quantity,
                source_date  = ACCRUAL_DATE,
            )
            db.session.merge(accrual)

            portfolio = Portfolio.query.get(pos.portfolio_id)
            if portfolio:
                portfolio.cash = float(portfolio.cash) + amount
                total_accruals += 1

    try:
        db.session.commit()
        print(f'[{datetime.utcnow()}] accrue_events: начислено {total_accruals} выплат')
    except Exception as e:
        db.session.rollback()
        print(f'[{datetime.utcnow()}] accrue_events: ОШИБКА {e}')