import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from app import create_app, db
from app.models import RefreshToken
from datetime import datetime

app = create_app()

with app.app_context():
    deleted = RefreshToken.query.filter(
        (RefreshToken.expires_at < datetime.utcnow()) |
        (RefreshToken.revoked_at != None)
    ).delete()
    db.session.commit()
    print(f'Удалено токенов: {deleted}')