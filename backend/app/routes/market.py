from flask import Blueprint
from flask_jwt_extended import jwt_required

market_bp = Blueprint('market', __name__)

@market_bp.route('/securities')
@jwt_required()
def list():
    return "List "

@market_bp.route('/security/<ticker>')
def security(ticker):
    return f'Info about {ticker} '

@market_bp.route('/chart/<ticker>')
def chart(ticker):
    return f"{ticker}'s chart "

@market_bp.route('/orderbook/<ticker>')
def orderbook(ticker):
    return f"{ticker}'s orders "
