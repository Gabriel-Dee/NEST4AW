import hashlib
from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
from fastapi import APIRouter, Depends
from fastapi.security import HTTPAuthorizationCredentials
from pwdlib.exceptions import UnknownHashError

from app.auth import (
    DUMMY_HASH,
    ROLES,
    authenticated,
    bearer,
    issue,
    password_hash,
    require_role,
)
from app.clients import enroll
from app.config import settings
from app.db import connection
from app.errors import APIError
from app.schemas import ClientCreate, Login, PasswordChange, Register, UserCreate, UserPatch
from app.visits import summary

router = APIRouter()


def find_user(conn, body: Login):
    login_name = (body.email or body.username or "").strip()
    if "@" in login_name:
        return conn.execute("SELECT * FROM users WHERE email=%s", (login_name.lower(),)).fetchone()
    phone = "".join(ch for ch in login_name if ch.isdigit())
    return conn.execute(
        """SELECT u.* FROM users u JOIN clients c ON c.user_id=u.id
        WHERE c.phone_hmac=hmac(%s,%s,'sha256')""",
        (phone, settings().hmac_key),
    ).fetchone()


@router.post("/auth/register", status_code=201)
def register(body: Register, conn=Depends(connection, scope="function")):
    email = body.email.lower() if body.email else None
    if email is None:
        digest = hashlib.sha256(body.phone.encode()).hexdigest()[:24]
        email = f"phone-{digest}@clients.nest4aw.local"
    created = enroll(
        conn,
        ClientCreate(
            email=email,
            password=body.password,
            legal_name=f"{body.first_name.strip()} {body.last_name.strip()}",
            phone=body.phone or "",
            household_size=body.household_size,
            icd10=body.icd10_codes,
            allergens=body.allergies,
        ),
    )
    user = conn.execute("SELECT * FROM users WHERE email=%s", (email,)).fetchone()
    if body.phone:
        digits = "".join(ch for ch in body.phone if ch.isdigit())
        conn.execute(
            "UPDATE clients SET phone_hmac=hmac(%s,%s,'sha256') WHERE id=%s",
            (digits, settings().hmac_key, created["id"]),
        )
    issued = issue(user)
    return {**issued, "client": summary(conn, created["id"])}


@router.post("/auth/login")
def login(body: Login, conn=Depends(connection, scope="function")):
    user = find_user(conn, body)
    try:
        valid = password_hash.verify(body.password, user["password_hash"] if user else DUMMY_HASH)
    except (UnknownHashError, ValueError):
        valid = False
    if not valid or not user or user["disabled"]:
        raise APIError(401, "unauthorized", "invalid email or password")
    return issue(user)


@router.get("/auth/me")
def me(user=Depends(require_role(*ROLES)), conn=Depends(connection, scope="function")):
    body = {key: user[key] for key in ("id", "email", "role")}
    client = conn.execute("SELECT id FROM clients WHERE user_id=%s", (user["id"],)).fetchone()
    if client:
        body["client"] = summary(conn, client["id"])
    return body


@router.post("/auth/logout")
def logout(
    user=Depends(authenticated),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    conn=Depends(connection, scope="function"),
):
    digest = hashlib.sha256(credentials.credentials.encode()).digest()
    conn.execute(
        """INSERT INTO revoked_tokens (token_hash, expires_at) VALUES (%s,%s)
        ON CONFLICT (token_hash) DO NOTHING""",
        (digest, datetime.now(timezone.utc) + timedelta(hours=8)),
    )
    return {"ok": True}


@router.get("/auth/me/checkin-qr")
def checkin_qr(user=Depends(require_role("client"))):
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "sub": str(user["id"]),
            "role": user["role"],
            "email": user["email"],
            "purpose": "checkin",
            "iat": now,
            "exp": now + timedelta(seconds=60),
        },
        settings().jwt_secret,
        algorithm="HS256",
    )
    return {"qr_token": token, "expires_in": 60}


@router.post("/auth/change-password")
def change_password(
    body: PasswordChange,
    user=Depends(require_role(*ROLES)),
    conn=Depends(connection, scope="function"),
):
    row = conn.execute(
        "SELECT password_hash FROM users WHERE id=%s FOR UPDATE", (user["id"],)
    ).fetchone()
    if not password_hash.verify(body.current_password, row["password_hash"]):
        raise APIError(401, "unauthorized", "invalid email or password")
    conn.execute(
        "UPDATE users SET password_hash=%s WHERE id=%s",
        (password_hash.hash(body.new_password), user["id"]),
    )
    return {"ok": True}


@router.post("/admin/users", status_code=201, dependencies=[Depends(require_role("admin"))])
def create_user(body: UserCreate, conn=Depends(connection, scope="function")):
    if body.role == "client":
        raise APIError(422, "invalid_role", "create clients through enrollment")
    return conn.execute(
        "INSERT INTO users(email,password_hash,role) VALUES(%s,%s,%s) RETURNING id,email,role,disabled",
        (body.email.lower(), password_hash.hash(body.password), body.role),
    ).fetchone()


@router.get("/admin/users", dependencies=[Depends(require_role("admin"))])
def list_users(conn=Depends(connection, scope="function")):
    return conn.execute(
        "SELECT id,email,role,disabled FROM users ORDER BY created_at,id"
    ).fetchall()


@router.patch("/admin/users/{id}", dependencies=[Depends(require_role("admin"))])
def patch_user(id: UUID, body: UserPatch, conn=Depends(connection, scope="function")):
    conn.execute("SELECT pg_advisory_xact_lock(861104)")
    old = conn.execute("SELECT role FROM users WHERE id=%s FOR UPDATE", (id,)).fetchone()
    if not old:
        raise APIError(404, "not_found", "user not found")
    if body.role == "client" or (old["role"] == "client" and body.role is not None):
        raise APIError(422, "invalid_role", "client roles are managed through enrollment")
    row = conn.execute(
        """UPDATE users SET disabled=coalesce(%s,disabled),role=coalesce(%s,role)
        WHERE id=%s RETURNING id,email,role,disabled""",
        (body.disabled, body.role, id),
    ).fetchone()
    if body.disabled:
        conn.execute(
            "UPDATE sessions SET status='expired' WHERE client_id IN (SELECT id FROM clients WHERE user_id=%s) AND status IN ('active','queued')",
            (id,),
        )
    return row
