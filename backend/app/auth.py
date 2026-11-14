from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash

from app.config import settings
from app.db import connection
from app.errors import APIError

password_hash = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)
DUMMY_HASH = password_hash.hash("timing-only-not-an-account")
ROLES = ("doctor", "client", "warehouse_staff", "admin", "community_partner")


def issue(user):
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "sub": str(user["id"]),
            "role": user["role"],
            "email": user["email"],
            "iat": now,
            "exp": now + timedelta(hours=8),
        },
        settings().jwt_secret,
        algorithm="HS256",
    )
    return dict(access_token=token, token_type="bearer", role=user["role"], expires_in=28800)


def authenticated(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    conn=Depends(connection, scope="function"),
):
    try:
        if credentials is None:
            raise ValueError()
        claims = jwt.decode(
            credentials.credentials,
            settings().jwt_secret,
            algorithms=["HS256"],
            options={"require": ["sub", "role", "email", "exp", "iat"]},
        )
        uid = UUID(claims["sub"])
        user = conn.execute(
            "SELECT id,email,role,disabled FROM users WHERE id=%s", (uid,)
        ).fetchone()
        if (
            not user
            or user["disabled"]
            or user["role"] != claims["role"]
            or user["email"] != claims["email"]
        ):
            raise ValueError()
        return user
    except (jwt.PyJWTError, ValueError, TypeError):
        raise APIError(401, "unauthorized", "sign in required") from None


def require_role(*roles):
    def authorize(user=Depends(authenticated)):
        if user["role"] not in roles:
            raise APIError(403, "forbidden", "insufficient permissions")
        return user

    return authorize


TOKEN_SECONDS = 8 * 60 * 60


def hasher():
    return password_hash
