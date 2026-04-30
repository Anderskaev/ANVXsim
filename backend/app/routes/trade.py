from flask import Blueprint

trade_bp = Blueprint('trade', __name__)

@trade_bp.route('/')
def trade():
    return "Trade"

@trade_bp.route('/estimate', methods=['GET'])
def estimate():
    return "Estimate cost"