from datetime import datetime
from app import db

# MARKET

class Security(db.Model):
    __tablename__ = 'securities'

    id         = db.Column(db.Integer,      primary_key=True, autoincrement=True)
    ticker     = db.Column(db.String(12),   nullable=False, unique=True)
    isin       = db.Column(db.String(12),   nullable=True)
    short_name = db.Column(db.String(64),   nullable=False)
    full_name  = db.Column(db.String(255),  nullable=True)
    type       = db.Column(db.Enum('share', 'bond', 'etf', 'currency', 'pif', 'other'), nullable=False, default='share')
    #type       = db.Column(db.String(10),  nullable=True)
    board      = db.Column(db.String(12),   nullable=False, default='TQBR')
    lot_size   = db.Column(db.Integer,      nullable=False, default=1)
    currency   = db.Column(db.String(3),    nullable=False, default='RUB')
    is_active  = db.Column(db.Boolean,      nullable=False, default=True)
    updated_at = db.Column(db.DateTime,     nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # relationships
    last_price    = db.relationship('LastPrice', backref='security', uselist=False, cascade='all, delete-orphan')
    candles       = db.relationship('Candle',    backref='security', cascade='all, delete-orphan')
    dividends     = db.relationship('Dividend',  backref='security', cascade='all, delete-orphan')
    coupons       = db.relationship('Coupon',    backref='security', cascade='all, delete-orphan')
    amortization  = db.relationship('Amortization',    backref='security', cascade='all, delete-orphan')

    def to_dict(self, with_price=False):
        d = {
            'ticker':     self.ticker,
            'isin':       self.isin,
            'short_name': self.short_name,
            'full_name':  self.full_name,
            'type':       self.type,
            'board':      self.board,
            'lot_size':   self.lot_size,
            'currency':   self.currency,
            'is_active':  self.is_active,
        }
        if with_price and self.last_price:
            d['price']      = float(self.last_price.price)
            d['change_pct'] = float(self.last_price.change_pct) if self.last_price.change_pct else None
            d['volume']     = self.last_price.volume
            d['fetched_at'] = self.last_price.fetched_at.isoformat()
        return d

    def __repr__(self):
        return f'<Security {self.ticker}>'


class LastPrice(db.Model):
    __tablename__ = 'last_price'

    ticker     = db.Column(db.String(12),      db.ForeignKey('securities.ticker', onupdate='CASCADE', ondelete='CASCADE'), primary_key=True)
    price      = db.Column(db.Numeric(18, 4),  nullable=False, default=0)
    open       = db.Column(db.Numeric(18, 4),  nullable=True)
    high       = db.Column(db.Numeric(18, 4),  nullable=True)
    low        = db.Column(db.Numeric(18, 4),  nullable=True)
    volume     = db.Column(db.BigInteger,       nullable=True)
    change_pct = db.Column(db.Numeric(8, 4),   nullable=True)
    fetched_at = db.Column(db.DateTime,         nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'ticker':     self.ticker,
            'price':      float(self.price),
            'open':       float(self.open)       if self.open       else None,
            'high':       float(self.high)       if self.high       else None,
            'low':        float(self.low)        if self.low        else None,
            'volume':     self.volume,
            'change_pct': float(self.change_pct) if self.change_pct else None,
            'fetched_at': self.fetched_at.isoformat(),
        }

    def __repr__(self):
        return f'<LastPrice {self.ticker} {self.price}>'


class Candle(db.Model):
    __tablename__ = 'candles'

    id     = db.Column(db.BigInteger,     primary_key=True, autoincrement=True)
    ticker = db.Column(db.String(12),     db.ForeignKey('securities.ticker', onupdate='CASCADE', ondelete='CASCADE'), nullable=False)
    date   = db.Column(db.Date,           nullable=False)
    open   = db.Column(db.Numeric(18, 4), nullable=False)
    high   = db.Column(db.Numeric(18, 4), nullable=False)
    low    = db.Column(db.Numeric(18, 4), nullable=False)
    close  = db.Column(db.Numeric(18, 4), nullable=False)
    volume = db.Column(db.BigInteger,     nullable=False, default=0)

    __table_args__ = (
        db.UniqueConstraint('ticker', 'date', name='uq_candle'),
    )

    def to_dict(self):
        return {
            'date':   self.date.isoformat(),
            'open':   float(self.open),
            'high':   float(self.high),
            'low':    float(self.low),
            'close':  float(self.close),
            'volume': self.volume,
        }

    def __repr__(self):
        return f'<Candle {self.ticker} {self.date}>'


class Dividend(db.Model):
    __tablename__ = 'dividends'

    id            = db.Column(db.Integer,      primary_key=True, autoincrement=True)
    ticker        = db.Column(db.String(12),   db.ForeignKey('securities.ticker', onupdate='CASCADE', ondelete='CASCADE'), nullable=False)
    registry_date = db.Column(db.Date,         nullable=False)
    payment_date  = db.Column(db.Date,         nullable=True)
    amount        = db.Column(db.Numeric(18, 4), nullable=False)
    currency      = db.Column(db.String(3),    nullable=False, default='RUB')

    __table_args__ = (
        db.UniqueConstraint('ticker', 'registry_date', name='uq_dividend'),
    )

    def to_dict(self):
        return {
            'ticker':        self.ticker,
            'registry_date': self.registry_date.isoformat(),
            'payment_date':  self.payment_date.isoformat() if self.payment_date else None,
            'amount':        float(self.amount),
            'currency':      self.currency,
        }


class Coupon(db.Model):
    __tablename__ = 'coupons'

    id          = db.Column(db.Integer,        primary_key=True, autoincrement=True)
    ticker      = db.Column(db.String(12),     db.ForeignKey('securities.ticker', onupdate='CASCADE', ondelete='CASCADE'), nullable=False)
    coupon_date = db.Column(db.Date,           nullable=False)
    amount      = db.Column(db.Numeric(18, 4), nullable=False)
    currency      = db.Column(db.String(3),    nullable=False, default='RUB')

    __table_args__ = (
        db.UniqueConstraint('ticker', 'coupon_date', name='uq_coupon'),
    )

    def to_dict(self):
        return {
            'ticker':      self.ticker,
            'coupon_date': self.coupon_date.isoformat(),
            'amount':      float(self.amount),
            'currency':    self.currency,
        }

class Amortization(db.Model):
    __tablename__ = 'amortizations'

    id          = db.Column(db.Integer,        primary_key=True, autoincrement=True)
    ticker      = db.Column(db.String(12),     db.ForeignKey('securities.ticker', onupdate='CASCADE', ondelete='CASCADE'), nullable=False)
    amort_date = db.Column(db.Date,           nullable=False)
    amount      = db.Column(db.Numeric(18, 4), nullable=False)
    currency      = db.Column(db.String(3),    nullable=False, default='RUB')

    __table_args__ = (
        db.UniqueConstraint('ticker', 'amort_date', name='uq_amortization'),
    )

    def to_dict(self):
        return {
            'ticker':      self.ticker,
            'amort_date': self.amort_date.isoformat(),
            'amount':      float(self.amount),
            'currency':    self.currency,
        }

# USER

class User(db.Model):
    __tablename__ = 'users'

    id            = db.Column(db.Integer,     primary_key=True, autoincrement=True)
    email         = db.Column(db.String(128), nullable=False, unique=True)
    password_hash = db.Column(db.String(255), nullable=False)
    name          = db.Column(db.String(64),  nullable=False)
    avatar_url    = db.Column(db.String(255), nullable=True)
    is_active     = db.Column(db.Boolean,     nullable=False, default=True)
    created_at    = db.Column(db.DateTime,    nullable=False, default=datetime.utcnow)
    last_login    = db.Column(db.DateTime,    nullable=True)

    # relationships
    portfolios     = db.relationship('Portfolio',    backref='user', cascade='all, delete-orphan')
    refresh_tokens = db.relationship('RefreshToken', backref='user', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id':         self.id,
            'email':      self.email,
            'name':       self.name,
            'avatar_url': self.avatar_url,
            'created_at': self.created_at.isoformat(),
        }

    def __repr__(self):
        return f'<User {self.email}>'


class RefreshToken(db.Model):
    __tablename__ = 'refresh_tokens'

    id         = db.Column(db.Integer,     primary_key=True, autoincrement=True)
    user_id    = db.Column(db.Integer,     db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    token_hash = db.Column(db.String(255), nullable=False)
    expires_at = db.Column(db.DateTime,   nullable=False)
    created_at = db.Column(db.DateTime,   nullable=False, default=datetime.utcnow)
    revoked_at = db.Column(db.DateTime,   nullable=True)

    @property
    def is_active(self):
        return self.revoked_at is None and self.expires_at > datetime.utcnow()

    def __repr__(self):
        return f'<RefreshToken user_id={self.user_id}>'


class Portfolio(db.Model):
    __tablename__ = 'portfolios'

    id           = db.Column(db.Integer,        primary_key=True, autoincrement=True)
    user_id      = db.Column(db.Integer,        db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    name         = db.Column(db.String(64),     nullable=False, default='Мой портфель')
    cash         = db.Column(db.Numeric(18, 2), nullable=False, default=0)
    initial_cash = db.Column(db.Numeric(18, 2), nullable=False, default=0)
    created_at   = db.Column(db.DateTime,       nullable=False, default=datetime.utcnow)

    # relationships
    positions = db.relationship('Position', backref='portfolio', cascade='all, delete-orphan')
    trades    = db.relationship('Trade',    backref='portfolio', cascade='all, delete-orphan')
    accruals  = db.relationship('Accrual',  backref='portfolio', cascade='all, delete-orphan')

    @property
    def total_value(self):
        pos_value = sum(
            float(p.avg_price) * p.quantity
            for p in self.positions
        )
        return float(self.cash) + pos_value

    @property
    def roi(self):
        if not self.initial_cash:
            return 0
        return (self.total_value / float(self.initial_cash) - 1) * 100

    def to_dict(self):
        return {
            'id':           self.id,
            'name':         self.name,
            'cash':         float(self.cash),
            'initial_cash': float(self.initial_cash),
            'created_at':   self.created_at.isoformat(),
        }

    def __repr__(self):
        return f'<Portfolio {self.id} user={self.user_id}>'


class Position(db.Model):
    __tablename__ = 'positions'

    id           = db.Column(db.Integer,        primary_key=True, autoincrement=True)
    portfolio_id = db.Column(db.Integer,        db.ForeignKey('portfolios.id', ondelete='CASCADE'), nullable=False)
    ticker       = db.Column(db.String(12),     db.ForeignKey('securities.ticker', onupdate='CASCADE'), nullable=False)
    quantity     = db.Column(db.Integer,        nullable=False, default=0)
    avg_price    = db.Column(db.Numeric(18, 4), nullable=False, default=0)

    __table_args__ = (
        db.UniqueConstraint('portfolio_id', 'ticker', name='uq_position'),
    )

    def pnl(self, current_price):
        return (current_price - float(self.avg_price)) * self.quantity

    def pnl_pct(self, current_price):
        if not self.avg_price:
            return 0
        return (current_price / float(self.avg_price) - 1) * 100

    def to_dict(self, current_price=None):
        d = {
            'ticker':    self.ticker,
            'quantity':  self.quantity,
            'avg_price': float(self.avg_price),
        }
        if current_price is not None:
            d['current_price'] = current_price
            d['pnl']           = self.pnl(current_price)
            d['pnl_pct']       = self.pnl_pct(current_price)
            d['value']         = current_price * self.quantity
        return d

    def __repr__(self):
        return f'<Position {self.ticker} qty={self.quantity}>'


class Trade(db.Model):
    __tablename__ = 'trades'

    id           = db.Column(db.BigInteger,     primary_key=True, autoincrement=True)
    portfolio_id = db.Column(db.Integer,        db.ForeignKey('portfolios.id', ondelete='CASCADE'), nullable=False)
    ticker       = db.Column(db.String(12),     nullable=False)
    direction    = db.Column(db.Enum('buy', 'sell'), nullable=False)
    quantity     = db.Column(db.Integer,        nullable=False)
    price        = db.Column(db.Numeric(18, 4), nullable=False)
    commission   = db.Column(db.Numeric(18, 4), nullable=False, default=0)
    total        = db.Column(db.Numeric(18, 2), nullable=False)
    executed_at  = db.Column(db.DateTime,       nullable=False, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id':          self.id,
            'ticker':      self.ticker,
            'direction':   self.direction,
            'quantity':    self.quantity,
            'price':       float(self.price),
            'commission':  float(self.commission),
            'total':       float(self.total),
            'executed_at': self.executed_at.isoformat(),
        }

    def __repr__(self):
        return f'<Trade {self.direction} {self.ticker} qty={self.quantity}>'


class Accrual(db.Model):
    __tablename__ = 'accruals'

    id           = db.Column(db.BigInteger,  primary_key=True, autoincrement=True)
    portfolio_id = db.Column(db.Integer,     db.ForeignKey('portfolios.id', ondelete='CASCADE'), nullable=False)
    ticker       = db.Column(db.String(12),  nullable=False)
    type         = db.Column(db.Enum('dividend', 'coupon', 'amortization'), nullable=False)
    amount       = db.Column(db.Numeric(18, 4), nullable=False)
    quantity     = db.Column(db.Integer,     nullable=False)
    source_date  = db.Column(db.Date,        nullable=False)
    accrued_at   = db.Column(db.DateTime,    nullable=False, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('portfolio_id', 'ticker', 'source_date', 'type', name='uq_accrual'),
    )

    def to_dict(self):
        return {
            'id':          self.id,
            'ticker':      self.ticker,
            'type':        self.type,
            'amount':      float(self.amount),
            'quantity':    self.quantity,
            'source_date': self.source_date.isoformat(),
            'accrued_at':  self.accrued_at.isoformat(),
        }

    def __repr__(self):
        return f'<Accrual {self.type} {self.ticker} {self.source_date}>'