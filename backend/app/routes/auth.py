# app/routes/auth.py

from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity,
)
from datetime import datetime, timedelta
import bcrypt
import hashlib
import secrets

from app import db
from app.models import User, Portfolio, RefreshToken

auth_bp = Blueprint('auth', __name__)

REFRESH_TOKEN_EXPIRES_DAYS = 90

# ── HELPERS ───────────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def check_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))


def hash_token(token: str) -> str:
    """Храним не сам токен а его hash — на случай утечки БД"""
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def make_refresh_token(user_id: int) -> tuple[str, RefreshToken]:
    """Генерирует refresh_token, сохраняет hash в БД, возвращает (raw_token, orm_object)"""
    raw_token = secrets.token_hex(64)
    db_token  = RefreshToken(
        user_id    = user_id,
        token_hash = hash_token(raw_token),
        expires_at = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRES_DAYS),
    )
    return raw_token, db_token


# ── REGISTER ──────────────────────────────────────────────────────────────────

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json(silent=True)

    if not data:
        return jsonify({'error': 'Тело запроса должно быть JSON'}), 400

    # валидация обязательных полей
    required = ['email', 'password', 'name', 'initial_cash']
    missing  = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({'error': f'Обязательные поля: {", ".join(missing)}'}), 400

    # проверка допустимых значений депозита
    # allowed_deposits = [50_000, 100_000, 500_000]
    initial_cash = int(data['initial_cash'])
    # if initial_cash not in allowed_deposits:
    #     return jsonify({'error': f'Депозит должен быть одним из: {allowed_deposits}'}), 400

    # проверка уникальности email
    if User.query.filter_by(email=data['email'].lower()).first():
        return jsonify({'error': 'Пользователь с таким email уже существует'}), 409

    # проверка длины пароля
    if len(data['password']) < 8:
        return jsonify({'error': 'Пароль должен быть не менее 8 символов'}), 400

    try:
        # создаём пользователя
        user = User(
            email         = data['email'].lower().strip(),
            password_hash = hash_password(data['password']),
            name          = data['name'].strip(),
        )
        db.session.add(user)
        db.session.flush()  # получаем user.id до commit

        # создаём портфель сразу
        portfolio = Portfolio(
            user_id      = user.id,
            name         = 'Мой портфель',
            cash         = initial_cash,
            initial_cash = initial_cash,
        )
        db.session.add(portfolio)

        # генерируем токены
        access_token      = create_access_token(identity=str(user.id))
        raw_refresh, db_refresh = make_refresh_token(user.id)
        db.session.add(db_refresh)

        db.session.commit()

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Ошибка при создании пользователя'}), 500

    return jsonify({
        'access_token':  access_token,
        'refresh_token': raw_refresh,
        'user':          user.to_dict(),
        'portfolio':     portfolio.to_dict(),
    }), 201


# ── LOGIN ─────────────────────────────────────────────────────────────────────

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json(silent=True)

    if not data:
        return jsonify({'error': 'Тело запроса должно быть JSON'}), 400

    if not data.get('email') or not data.get('password'):
        return jsonify({'error': 'Email и пароль обязательны'}), 400

    user = User.query.filter_by(email=data['email'].lower().strip()).first()

    # намеренно одно сообщение для обоих случаев — не раскрываем существует ли email
    if not user or not check_password(data['password'], user.password_hash):
        return jsonify({'error': 'Неверный email или пароль'}), 401

    if not user.is_active:
        return jsonify({'error': 'Аккаунт заблокирован'}), 403

    try:
        # обновляем last_login
        user.last_login = datetime.utcnow()

        # генерируем токены
        access_token         = create_access_token(identity=str(user.id))
        raw_refresh, db_refresh = make_refresh_token(user.id)
        db.session.add(db_refresh)

        db.session.commit()

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Ошибка при входе'}), 500

    # берём первый портфель пользователя
    portfolio = Portfolio.query.filter_by(user_id=user.id).first()

    return jsonify({
        'access_token':  access_token,
        'refresh_token': raw_refresh,
        'user':          user.to_dict(),
        'portfolio':     portfolio.to_dict() if portfolio else None,
    }), 200


# ── REFRESH ───────────────────────────────────────────────────────────────────

@auth_bp.route('/refresh', methods=['POST'])
def refresh():
    data = request.get_json(silent=True)

    if not data or not data.get('refresh_token'):
        return jsonify({'error': 'refresh_token обязателен'}), 400

    token_hash = hash_token(data['refresh_token'])
    db_token   = RefreshToken.query.filter_by(token_hash=token_hash).first()

    if not db_token or not db_token.is_active:
        return jsonify({'error': 'Токен недействителен или истёк'}), 401

    user = User.query.get(db_token.user_id)
    if not user or not user.is_active:
        return jsonify({'error': 'Пользователь не найден'}), 401

    try:
        # отзываем старый refresh_token
        db_token.revoked_at = datetime.utcnow()

        # выдаём новую пару токенов (rotation)
        access_token             = create_access_token(identity=str(user.id))
        raw_refresh, new_db_token = make_refresh_token(user.id)
        db.session.add(new_db_token)

        db.session.commit()

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Ошибка при обновлении токена'}), 500

    return jsonify({
        'access_token':  access_token,
        'refresh_token': raw_refresh,
    }), 200


# ── LOGOUT ────────────────────────────────────────────────────────────────────

@auth_bp.route('/logout', methods=['POST'])
@jwt_required()
def logout():
    data = request.get_json(silent=True)

    if not data or not data.get('refresh_token'):
        return jsonify({'error': 'refresh_token обязателен'}), 400

    token_hash = hash_token(data['refresh_token'])
    db_token   = RefreshToken.query.filter_by(token_hash=token_hash).first()

    if db_token and db_token.is_active:
        db_token.revoked_at = datetime.utcnow()
        db.session.commit()

    return jsonify({'message': 'Выход выполнен'}), 200


# ── LOGOUT ALL ────────────────────────────────────────────────────────────────

@auth_bp.route('/logout-all', methods=['POST'])
@jwt_required()
def logout_all():
    user_id = int(get_jwt_identity())

    try:
        # отзываем все активные токены пользователя
        RefreshToken.query.filter(
            RefreshToken.user_id   == user_id,
            RefreshToken.revoked_at == None,
        ).update({'revoked_at': datetime.utcnow()})

        db.session.commit()

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Ошибка при выходе'}), 500

    return jsonify({'message': 'Выход выполнен на всех устройствах'}), 200


# ── ME ────────────────────────────────────────────────────────────────────────

@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def me():
    user_id   = int(get_jwt_identity())
    user      = User.query.get(user_id)

    if not user:
        return jsonify({'error': 'Пользователь не найден'}), 404

    portfolio = Portfolio.query.filter_by(user_id=user_id).first()

    return jsonify({
        'user':      user.to_dict(),
        'portfolio': portfolio.to_dict() if portfolio else None,
    }), 200