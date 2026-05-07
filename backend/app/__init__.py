import os
from flask import Flask, Blueprint
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from flask_caching import Cache
from flask_cors import CORS
from dotenv import load_dotenv


# Load environment
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

db       = SQLAlchemy()
migrate  = Migrate()
jwt      = JWTManager()
cache    = Cache()

def create_app():
    app = Flask(__name__)

    #  CONFIG #
    app.config['SQLALCHEMY_DATABASE_URI']        = os.getenv('DB_URL')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SQLALCHEMY_ENGINE_OPTIONS']      = {
        'pool_recycle': 280,   # Рег.ру рвёт соединения после ~300 сек
        'pool_pre_ping': True, # проверять соединение перед запросом
    }
    app.config['JWT_SECRET_KEY']                 = os.getenv('JWT_SECRET')
    app.config['JWT_ACCESS_TOKEN_EXPIRES']       = 60 * 60 * 24  # 24 часа    
    
    # CHACHE CONFIG #
    cache_config = {
        "DEBUG":        True,
        "CACHE_TYPE":   "FileSystemCache",
        "CACHE_DIR":    "flask_cache",
        "CACHE_DEFAULT_TIMEOUT": 60
    }
    app.config.from_mapping(cache_config)
    
    # INIT #
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    cache.init_app(app)
    CORS(app, resources={r'/api/*': {'origins': os.getenv('ALLOWED_ORIGIN', '*')}})    

    # BLUEPRINTS #
    from app.routes.auth import auth_bp
    from app.routes.market import market_bp
    from app.routes.portfolio import portfolio_bp
    from app.routes.trade import trade_bp

    app.register_blueprint(auth_bp,  url_prefix='/api/auth')
    app.register_blueprint(market_bp,  url_prefix='/api/market')    
    app.register_blueprint(portfolio_bp, url_prefix='/api/portfolio')
    app.register_blueprint(trade_bp, url_prefix='/api/trade')

    # TEST ROUTE #
    @app.route('/api/ping')
    def ping():
        return os.getenv('JWT_SECRET')

    return app