import os
from flask import Flask


def create_app():
    app = Flask(__name__)

    @app.route('/api/ping')
    def ping():
        return {'status': 'ok'}

    return app