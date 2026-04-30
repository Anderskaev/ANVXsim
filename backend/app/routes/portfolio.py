from flask import Blueprint

portfolio_bp = Blueprint('portfolio', __name__)

@portfolio_bp.route('/')
def portfolio():
    return "My data? PnL? etc "

@portfolio_bp.route('/history')
def history():
    return "My trading history "

@portfolio_bp.route('/leaderboard')
def leaderboard():
    return "TOP-50 traders"