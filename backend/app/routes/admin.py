from fastapi import APIRouter, Depends
from psycopg.errors import UniqueViolation
from pydantic import BaseModel, ConfigDict

from app.auth import APIError, hasher
from app.db import get_conn
from app.roles import admin_only

router = APIRouter()
STAFF_ROLES = {"doctor", "warehouse_staff", "admin", "community_partner"}


class UserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str
    password: str
    role: str


class UserPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    disabled: bool | None = None
    role: str | None = None


def user_public(row) -> dict:
    return {
        "id": str(row["id"]),
        "email": row["email"],
        "role": row["role"],
        "disabled": row["disabled"],
    }


@router.post("/admin/users")
def create_user(body: UserCreate, conn=Depends(get_conn), _user=Depends(admin_only)):
    if body.role not in STAFF_ROLES:
        raise APIError(422, "bad_input", "role must be doctor, warehouse_staff, admin, or community_partner")
    if len(body.password) < 8:
        raise APIError(422, "bad_input", "new password must be at least 8 characters")
    email = body.email.strip().lower()
    try:
        row = conn.execute(
            """
            INSERT INTO users (email, password_hash, role)
            VALUES (%s, %s, %s)
            RETURNING id, email, role, disabled
            """,
            (email, hasher().hash(body.password), body.role),
        ).fetchone()
    except UniqueViolation:
        raise APIError(409, "email_taken", "email is already in use")
    return user_public(row)


@router.get("/admin/users")
def list_users(conn=Depends(get_conn), _user=Depends(admin_only)):
    rows = conn.execute(
        "SELECT id, email, role, disabled FROM users ORDER BY email"
    ).fetchall()
    return [user_public(row) for row in rows]


@router.patch("/admin/users/{user_id}")
def patch_user(
    user_id: str,
    body: UserPatch,
    conn=Depends(get_conn),
    _user=Depends(admin_only),
):
    row = conn.execute(
        "SELECT id, email, role, disabled FROM users WHERE id = %s",
        (user_id,),
    ).fetchone()
    if row is None:
        raise APIError(404, "not_found", "unknown user")
    role = body.role if body.role is not None else row["role"]
    disabled = body.disabled if body.disabled is not None else row["disabled"]
    if role not in STAFF_ROLES and role != "client":
        raise APIError(422, "bad_input", "unknown role")
    if role == "client" and row["role"] != "client":
        raise APIError(422, "bad_input", "clients are created only by POST /clients")
    if row["role"] == "client" and role != "client":
        raise APIError(422, "bad_input", "client accounts stay clients")
    updated = conn.execute(
        """
        UPDATE users SET role = %s, disabled = %s
        WHERE id = %s
        RETURNING id, email, role, disabled
        """,
        (role, disabled, user_id),
    ).fetchone()
    return user_public(updated)
