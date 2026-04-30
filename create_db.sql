-- ============================================================
--  ANVX Investment Simulator — создание базы данных
--  MySQL 5.7+ / MariaDB 10.3+
--  Кодировка: utf8mb4
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = '+03:00';  -- московское время
SET foreign_key_checks = 0;

-- ============================================================
--  А. СПРАВОЧНИКИ РЫНКА (заполняются из ISS MOEX API)
-- ============================================================

-- ------------------------------------------------------------
--  Список торгуемых инструментов
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS securities (
    id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    ticker      VARCHAR(12)     NOT NULL COMMENT 'Тикер: SBER, GAZP, SU26238RMFS3',
    isin        VARCHAR(12)     NULL     COMMENT 'Международный код бумаги',
    short_name  VARCHAR(64)     NOT NULL COMMENT 'Краткое название',
    full_name   VARCHAR(255)    NULL     COMMENT 'Полное наименование эмитента',
    type        ENUM(
                    'share',    -- акция
                    'bond',     -- облигация
                    'etf',      -- фонд
                    'currency'  -- валюта
                )               NOT NULL DEFAULT 'share',
    board       VARCHAR(12)     NOT NULL DEFAULT 'TQBR' COMMENT 'Режим торгов: TQBR, TQOB и др.',
    lot_size    INT UNSIGNED    NOT NULL DEFAULT 1       COMMENT 'Кол-во бумаг в 1 лоте',
    currency    VARCHAR(3)      NOT NULL DEFAULT 'RUB'   COMMENT 'Валюта торгов',
    is_active   TINYINT(1)      NOT NULL DEFAULT 1       COMMENT '1 — торгуется, 0 — делистинг',
    updated_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE  KEY uq_ticker (ticker),
    KEY     idx_type     (type),
    KEY     idx_is_active(is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Справочник торгуемых инструментов';

-- ------------------------------------------------------------
--  Текущие котировки (обновляется cron-скриптом каждую минуту)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS last_price (
    ticker      VARCHAR(12)     NOT NULL COMMENT 'FK → securities.ticker',
    price       DECIMAL(18,4)   NOT NULL DEFAULT 0 COMMENT 'Последняя цена сделки',
    open        DECIMAL(18,4)   NULL     COMMENT 'Цена открытия сессии',
    high        DECIMAL(18,4)   NULL     COMMENT 'Максимум за день',
    low         DECIMAL(18,4)   NULL     COMMENT 'Минимум за день',
    volume      BIGINT UNSIGNED NULL     COMMENT 'Объём торгов в штуках',
    change_pct  DECIMAL(8,4)    NULL     COMMENT 'Изменение за день, %',
    fetched_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP
                                COMMENT 'Время получения данных из ISS',

    PRIMARY KEY (ticker),
    CONSTRAINT fk_lp_ticker
        FOREIGN KEY (ticker) REFERENCES securities(ticker)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Текущие котировки с задержкой ~15 мин';

-- ------------------------------------------------------------
--  История OHLCV (свечи) — пишется один раз, не меняется
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS candles (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    ticker      VARCHAR(12)     NOT NULL COMMENT 'FK → securities.ticker',
    date        DATE            NOT NULL COMMENT 'Дата торговой сессии',
    open        DECIMAL(18,4)   NOT NULL,
    high        DECIMAL(18,4)   NOT NULL,
    low         DECIMAL(18,4)   NOT NULL,
    close       DECIMAL(18,4)   NOT NULL,
    volume      BIGINT UNSIGNED NOT NULL DEFAULT 0,

    PRIMARY KEY (id),
    UNIQUE  KEY uq_candle (ticker, date),          -- один раз пишем, не дублируем
    KEY     idx_candle_ticker (ticker),
    CONSTRAINT fk_candle_ticker
        FOREIGN KEY (ticker) REFERENCES securities(ticker)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Исторические дневные свечи OHLCV (incremental load)';

-- ------------------------------------------------------------
--  Дивиденды — история и будущие выплаты
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dividends (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    ticker          VARCHAR(12)     NOT NULL COMMENT 'FK → securities.ticker',
    registry_date   DATE            NOT NULL COMMENT 'Дата закрытия реестра (отсечки)',
    payment_date    DATE            NULL     COMMENT 'Дата выплаты (может быть NULL)',
    amount          DECIMAL(18,4)   NOT NULL COMMENT 'Размер дивиденда на 1 акцию, руб.',
    currency        VARCHAR(3)      NOT NULL DEFAULT 'RUB',

    PRIMARY KEY (id),
    UNIQUE  KEY uq_dividend (ticker, registry_date),
    KEY     idx_div_date    (registry_date),
    CONSTRAINT fk_div_ticker
        FOREIGN KEY (ticker) REFERENCES securities(ticker)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='История и будущие дивиденды из ISS MOEX';

-- ------------------------------------------------------------
--  Купонный календарь облигаций
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coupons (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    ticker          VARCHAR(12)     NOT NULL COMMENT 'FK → securities.ticker',
    coupon_date     DATE            NOT NULL COMMENT 'Дата выплаты купона',
    amount          DECIMAL(18,4)   NOT NULL COMMENT 'Размер купона на 1 облигацию, руб.',
    accrued_int     DECIMAL(18,4)   NULL     COMMENT 'НКД на дату',

    PRIMARY KEY (id),
    UNIQUE  KEY uq_coupon (ticker, coupon_date),
    KEY     idx_coupon_date (coupon_date),
    CONSTRAINT fk_coupon_ticker
        FOREIGN KEY (ticker) REFERENCES securities(ticker)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Купонный календарь облигаций из ISS MOEX';


-- ============================================================
--  Б. ПОЛЬЗОВАТЕЛЬСКИЕ ДАННЫЕ
-- ============================================================

-- ------------------------------------------------------------
--  Пользователи
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    email           VARCHAR(128)    NOT NULL COMMENT 'Уникальный email для входа',
    password_hash   VARCHAR(255)    NOT NULL COMMENT 'bcrypt-хэш пароля',
    name            VARCHAR(64)     NOT NULL COMMENT 'Отображаемое имя',
    avatar_url      VARCHAR(255)    NULL,
    is_active       TINYINT(1)      NOT NULL DEFAULT 1,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login      TIMESTAMP       NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Пользователи симулятора';

-- ------------------------------------------------------------
--  Виртуальные портфели
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portfolios (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    user_id         INT UNSIGNED    NOT NULL COMMENT 'FK → users.id',
    name            VARCHAR(64)     NOT NULL DEFAULT 'Мой портфель',
    cash            DECIMAL(18,2)   NOT NULL DEFAULT 0.00 COMMENT 'Свободные деньги, руб.',
    initial_cash    DECIMAL(18,2)   NOT NULL DEFAULT 0.00 COMMENT 'Начальный депозит для расчёта ROI',
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_portfolio_user (user_id),
    CONSTRAINT fk_portfolio_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Виртуальные портфели пользователей';

-- ------------------------------------------------------------
--  Открытые позиции
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS positions (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    portfolio_id    INT UNSIGNED    NOT NULL COMMENT 'FK → portfolios.id',
    ticker          VARCHAR(12)     NOT NULL COMMENT 'FK → securities.ticker',
    quantity        INT UNSIGNED    NOT NULL DEFAULT 0  COMMENT 'Кол-во штук в позиции',
    avg_price       DECIMAL(18,4)   NOT NULL DEFAULT 0  COMMENT 'Средняя цена покупки (FIFO)',

    PRIMARY KEY (id),
    UNIQUE  KEY uq_position (portfolio_id, ticker),    -- одна позиция на бумагу
    KEY     idx_pos_ticker  (ticker),
    CONSTRAINT fk_pos_portfolio
        FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_pos_ticker
        FOREIGN KEY (ticker) REFERENCES securities(ticker)
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Текущие открытые позиции по портфелям';

-- ------------------------------------------------------------
--  История сделок
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trades (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    portfolio_id    INT UNSIGNED    NOT NULL COMMENT 'FK → portfolios.id',
    ticker          VARCHAR(12)     NOT NULL,
    direction       ENUM('buy','sell') NOT NULL,
    quantity        INT UNSIGNED    NOT NULL COMMENT 'Кол-во штук',
    price           DECIMAL(18,4)   NOT NULL COMMENT 'Цена исполнения (last_price ± спред)',
    commission      DECIMAL(18,4)   NOT NULL DEFAULT 0 COMMENT 'Комиссия 0.1% от суммы',
    total           DECIMAL(18,2)   NOT NULL COMMENT 'Итоговая сумма с комиссией',
    executed_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_trade_portfolio (portfolio_id, executed_at),
    KEY idx_trade_ticker    (ticker),
    CONSTRAINT fk_trade_portfolio
        FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='История всех виртуальных сделок';

-- ------------------------------------------------------------
--  Начисленные дивиденды и купоны
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accruals (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    portfolio_id    INT UNSIGNED    NOT NULL COMMENT 'FK → portfolios.id',
    ticker          VARCHAR(12)     NOT NULL,
    type            ENUM('dividend','coupon') NOT NULL,
    amount          DECIMAL(18,4)   NOT NULL COMMENT 'Сумма начисления, руб.',
    quantity        INT UNSIGNED    NOT NULL COMMENT 'Кол-во бумаг на дату отсечки',
    source_date     DATE            NOT NULL COMMENT 'Дата отсечки / купона из ISS',
    accrued_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE  KEY uq_accrual (portfolio_id, ticker, source_date, type), -- защита от двойного начисления
    KEY     idx_accrual_portfolio (portfolio_id),
    KEY     idx_accrual_date      (source_date),
    CONSTRAINT fk_accrual_portfolio
        FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='История начисленных дивидендов и купонов';


-- ------------------------------------------------------------
--  Токен
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    user_id     INT UNSIGNED    NOT NULL,
    token_hash  VARCHAR(255)    NOT NULL COMMENT 'hash от токена, не сам токен',
    expires_at  TIMESTAMP       NOT NULL,
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at  TIMESTAMP       NULL     COMMENT 'NULL = активен',

    PRIMARY KEY (id),
    KEY idx_token_hash (token_hash),
    KEY idx_user_id    (user_id),
    CONSTRAINT fk_rt_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  ВОССТАНАВЛИВАЕМ ПРОВЕРКУ FK
-- ============================================================
SET foreign_key_checks = 1;


-- ============================================================
--  ПРОВЕРКА — список созданных таблиц
-- ============================================================
SELECT
    table_name      AS `Таблица`,
    table_rows      AS `Строк (прибл.)`,
    table_comment   AS `Описание`
FROM information_schema.tables
WHERE table_schema = DATABASE()
ORDER BY table_name;
