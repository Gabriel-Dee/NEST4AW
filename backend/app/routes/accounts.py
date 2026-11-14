from uuid import UUID

from fastapi import APIRouter, Depends
from pwdlib.exceptions import UnknownHashError

from app.auth import DUMMY_HASH, ROLES, issue, password_hash, require_role
from app.db import connection
from app.errors import APIError
from app.schemas import Login, PasswordChange, UserCreate, UserPatch

router = APIRouter()


@router.post("/auth/login")
def login(body: Login, conn=Depends(connection, scope="function")):
    user = conn.execute("SELECT * FROM users WHERE email=%s", (body.email.lower(),)).fetchone()
    try:
        valid = password_hash.verify(body.password, user["password_hash"] if user else DUMMY_HASH)
    except (UnknownHashError, ValueError):
        valid = False
    if not valid or not user or user["disabled"]:
        raise APIError(401, "unauthorized", "invalid email or password")
    return issue(user)


@router.get("/auth/me")
def me(user=Depends(require_role(*ROLES))):
    return {key: user[key] for key in ("id", "email", "role")}


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
