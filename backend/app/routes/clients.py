from fastapi import APIRouter, Depends
from psycopg.errors import UniqueViolation
from pydantic import BaseModel, ConfigDict, Field

from app.auth import APIError, hasher
from app.db import env, get_conn
from app.phi import client_public, copy_flags, fetch_clients, issue_card
from app.roles import doctor_or_admin
from app.tier import ALLOWED_ALLERGENS, OutsideMatrix, flags_from_icd

router = APIRouter()


class ClientCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    legal_name: str
    phone: str
    email: str
    password: str
    household_size: int = Field(ge=1)
    icd10: list[str]
    allergens: list[str]
    k_limit_ordered: bool


class ClientPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    phone: str | None = None
    household_size: int | None = Field(default=None, ge=1)
    icd10: list[str] | None = None
    allergens: list[str] | None = None
    k_limit_ordered: bool | None = None


def _check_allergens(codes: list[str]) -> list[str]:
    cleaned = []
    for code in codes:
        value = code.strip().lower()
        if value not in ALLOWED_ALLERGENS:
            raise APIError(422, "bad_input", "unknown allergen")
        if value not in cleaned:
            cleaned.append(value)
    return cleaned


def _flags(codes: list[str]):
    try:
        return flags_from_icd(codes)
    except OutsideMatrix:
        raise APIError(422, "outside_matrix", "stage 5 and dialysis are outside this matrix")


@router.post("/clients")
def create_client(body: ClientCreate, conn=Depends(get_conn), _user=Depends(doctor_or_admin)):
    allergens = _check_allergens(body.allergens)
    flags = _flags(body.icd10)
    email = body.email.strip().lower()
    if not email or not body.legal_name.strip():
        raise APIError(422, "bad_input", "name and email are required")
    if len(body.password) < 8:
        raise APIError(422, "bad_input", "new password must be at least 8 characters")
    try:
        with conn.transaction():
            user = conn.execute(
                """
                INSERT INTO users (email, password_hash, role)
                VALUES (%s, %s, 'client')
                RETURNING id
                """,
                (email, hasher().hash(body.password)),
            ).fetchone()
            client = conn.execute(
                """
                INSERT INTO clients (
                  user_id, legal_name_enc, phone_enc, name_hmac,
                  dm, htn, ckd34, k_limit_ordered, household_size, tier_id
                ) VALUES (
                  %s,
                  pgp_sym_encrypt(%s, %s),
                  pgp_sym_encrypt(%s, %s),
                  hmac(convert_to(lower(btrim(%s)), 'UTF8'), convert_to(%s, 'UTF8'), 'sha256'),
                  %s, %s, %s, %s, %s, %s
                )
                RETURNING id
                """,
                (
                    user["id"],
                    body.legal_name.strip(),
                    env("PHI_KEY"),
                    body.phone.strip(),
                    env("PHI_KEY"),
                    body.legal_name.strip(),
                    env("HMAC_KEY"),
                    flags.dm,
                    flags.htn,
                    flags.ckd34,
                    body.k_limit_ordered,
                    body.household_size,
                    flags.tier_id,
                ),
            ).fetchone()
            for code in {c.strip().upper() for c in body.icd10 if c.strip()}:
                conn.execute(
                    "INSERT INTO conditions (client_id, icd10) VALUES (%s, %s)",
                    (client["id"], code),
                )
            for code in allergens:
                conn.execute(
                    "INSERT INTO client_allergens (client_id, code) VALUES (%s, %s)",
                    (client["id"], code),
                )
            raw = issue_card(conn, client["id"])
    except UniqueViolation:
        raise APIError(409, "email_taken", "email is already in use")
    row = fetch_clients(conn, client_id=client["id"])[0]
    return client_public(row, card_token=raw)


@router.get("/clients")
def list_clients(conn=Depends(get_conn), _user=Depends(doctor_or_admin)):
    return [client_public(row) for row in fetch_clients(conn)]


@router.get("/clients/{client_id}")
def get_client(client_id: str, conn=Depends(get_conn), _user=Depends(doctor_or_admin)):
    rows = fetch_clients(conn, client_id=client_id)
    if not rows:
        raise APIError(404, "not_found", "unknown client")
    return client_public(rows[0])


@router.patch("/clients/{client_id}")
def patch_client(
    client_id: str,
    body: ClientPatch,
    conn=Depends(get_conn),
    _user=Depends(doctor_or_admin),
):
    current = fetch_clients(conn, client_id=client_id)
    if not current:
        raise APIError(404, "not_found", "unknown client")
    row = current[0]
    phone = body.phone.strip() if body.phone is not None else row["phone"]
    household = body.household_size if body.household_size is not None else row["household_size"]
    k_limit = body.k_limit_ordered if body.k_limit_ordered is not None else row["k_limit_ordered"]
    icd = body.icd10 if body.icd10 is not None else list(row["icd10"] or [])
    allergens = (
        _check_allergens(body.allergens)
        if body.allergens is not None
        else list(row["allergens"] or [])
    )
    flags = _flags(icd)
    with conn.transaction():
        conn.execute(
            """
            UPDATE clients
            SET phone_enc = pgp_sym_encrypt(%s, %s),
                household_size = %s,
                k_limit_ordered = %s,
                dm = %s, htn = %s, ckd34 = %s, tier_id = %s
            WHERE id = %s
            """,
            (
                phone,
                env("PHI_KEY"),
                household,
                k_limit,
                flags.dm,
                flags.htn,
                flags.ckd34,
                flags.tier_id,
                client_id,
            ),
        )
        if body.icd10 is not None:
            conn.execute("DELETE FROM conditions WHERE client_id = %s", (client_id,))
            for code in {c.strip().upper() for c in icd if c.strip()}:
                conn.execute(
                    "INSERT INTO conditions (client_id, icd10) VALUES (%s, %s)",
                    (client_id, code),
                )
        if body.allergens is not None:
            conn.execute("DELETE FROM client_allergens WHERE client_id = %s", (client_id,))
            for code in allergens:
                conn.execute(
                    "INSERT INTO client_allergens (client_id, code) VALUES (%s, %s)",
                    (client_id, code),
                )
        copy_flags(
            conn,
            client_id,
            flags.tier_id,
            flags.dm,
            flags.htn,
            flags.ckd34,
            k_limit,
            allergens,
            household,
        )
    return client_public(fetch_clients(conn, client_id=client_id)[0])


@router.post("/clients/{client_id}/tokens/revoke")
def revoke_token(client_id: str, conn=Depends(get_conn), _user=Depends(doctor_or_admin)):
    found = conn.execute("SELECT id FROM clients WHERE id = %s", (client_id,)).fetchone()
    if found is None:
        raise APIError(404, "not_found", "unknown client")
    conn.execute(
        """
        UPDATE enrollment_tokens
        SET status = 'revoked'
        WHERE client_id = %s AND status = 'active'
        """,
        (client_id,),
    )
    return {"token_status": "revoked"}
