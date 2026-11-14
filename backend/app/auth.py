from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash

from app.db import env, get_conn

TOKEN_SECONDS = 8 * 60 * 60
_hasher: PasswordHash | None = None
_dummy: str | None = None
_bearer = HTTPBearer(auto_error=False)


class APIError(Exception):
    def __init__(self, status: int, error: str, message: str):
        self.status = status
        self.error = error
        self.message = message
        super().__init__(message)


def hasher() -> PasswordHash:
    global _hasher
    if _hasher is None:
        _hasher = PasswordHash.recommended()
    return _hasher


def dummy_hash() -> str:
    global _dummy
    if _dummy is None:
        _dummy = hasher().hash("not-a-real-password")
    return _dummy


def password_ok(password: str, stored: str) -> bool:
    try:
        return bool(hasher().verify(password, stored))
    except Exception:
        return False


def make_token(user_id, role: str, email: str) -> str:
    payload = {
        "sub": str(user_id),
        "role": role,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(seconds=TOKEN_SECONDS),
    }
    return jwt.encode(payload, env("JWT_SECRET"), algorithm="HS256")


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    conn=Depends(get_conn),
):
    if creds is None or not creds.credentials:
        raise APIError(401, "unauthorized", "not signed in")
    try:
        payload = jwt.decode(creds.credentials, env("JWT_SECRET"), algorithms=["HS256"])
    except jwt.PyJWTError:
        raise APIError(401, "unauthorized", "not signed in")
    sub = payload.get("sub")
    if not sub:
        raise APIError(401, "unauthorized", "not signed in")
    row = conn.execute(
        "SELECT id, email, role, disabled FROM users WHERE id = %s",
        (sub,),
    ).fetchone()
    if row is None or row["disabled"]:
        raise APIError(401, "unauthorized", "not signed in")
    return row


def require_role(*roles: str):
    def dep(user=Depends(current_user)):
        if user["role"] not in roles:
            raise APIError(403, "forbidden", "wrong role")
        return user

    return dep
