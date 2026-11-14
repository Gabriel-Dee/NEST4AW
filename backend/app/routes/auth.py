from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict

from app.auth import (
    TOKEN_SECONDS,
    APIError,
    current_user,
    dummy_hash,
    hasher,
    make_token,
    password_ok,
)
from app.db import get_conn

router = APIRouter()


class LoginBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str
    password: str


class PasswordBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: str
    new_password: str


@router.post("/auth/login")
def login(body: LoginBody, conn=Depends(get_conn)):
    row = conn.execute(
        """
        SELECT id, email, role, password_hash, disabled
        FROM users
        WHERE lower(email) = lower(%s)
        """,
        (body.email.strip(),),
    ).fetchone()
    if row is None:
        password_ok(body.password, dummy_hash())
        raise APIError(401, "unauthorized", "invalid email or password")
    if not password_ok(body.password, row["password_hash"]) or row["disabled"]:
        raise APIError(401, "unauthorized", "invalid email or password")
    return {
        "access_token": make_token(row["id"], row["role"], row["email"]),
        "token_type": "bearer",
        "role": row["role"],
        "expires_in": TOKEN_SECONDS,
    }


@router.get("/auth/me")
def me(user=Depends(current_user)):
    return {"id": str(user["id"]), "email": user["email"], "role": user["role"]}


@router.post("/auth/change-password")
def change_password(body: PasswordBody, user=Depends(current_user), conn=Depends(get_conn)):
    if len(body.new_password) < 8:
        raise APIError(422, "bad_input", "new password must be at least 8 characters")
    row = conn.execute(
        "SELECT password_hash FROM users WHERE id = %s",
        (user["id"],),
    ).fetchone()
    if not password_ok(body.current_password, row["password_hash"]):
        raise APIError(401, "unauthorized", "invalid email or password")
    conn.execute(
        "UPDATE users SET password_hash = %s WHERE id = %s",
        (hasher().hash(body.new_password), user["id"]),
    )
    return {"ok": True}
