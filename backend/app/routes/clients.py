from uuid import UUID

from fastapi import APIRouter, Depends

from app.auth import require_role
from app.clients import CLIENT_SELECT, enroll, issue_card, read_client
from app.config import settings
from app.db import connection
from app.errors import APIError
from app.floor import advance
from app.schemas import ClientCreate, ClientPatch, Lookup, Reissue
from app.tier import derive

router = APIRouter()
doctor = require_role("doctor", "admin")
staff = require_role("warehouse_staff", "admin")


@router.post("/clients", status_code=201, dependencies=[Depends(doctor)])
def create_client(body: ClientCreate, conn=Depends(connection, scope="function")):
    return enroll(conn, body)


@router.get("/clients", dependencies=[Depends(doctor)])
def clients(conn=Depends(connection, scope="function")):
    return conn.execute(
        CLIENT_SELECT + " ORDER BY c.created_at,c.id", (settings().phi_key, settings().phi_key)
    ).fetchall()


@router.get("/clients/{id}", dependencies=[Depends(doctor)])
def client(id: UUID, conn=Depends(connection, scope="function")):
    return read_client(conn, id)


@router.patch("/clients/{id}", dependencies=[Depends(doctor)])
def patch_client(id: UUID, body: ClientPatch, conn=Depends(connection, scope="function")):
    advance(conn)
    conn.execute("SELECT id FROM clients WHERE id=%s FOR UPDATE", (id,))
    old = read_client(conn, id)
    flags = derive(body.icd10 if body.icd10 is not None else old["icd10"])
    allergens = body.allergens if body.allergens is not None else old["allergens"]
    k_order = body.k_limit_ordered if body.k_limit_ordered is not None else old["k_limit_ordered"]
    household = body.household_size if body.household_size is not None else old["household_size"]
    conn.execute(
        """UPDATE clients SET phone_enc=pgp_sym_encrypt(%s,%s),household_size=%s,
        dm=%s,htn=%s,ckd34=%s,k_limit_ordered=%s,tier_id=%s WHERE id=%s""",
        (
            body.phone if body.phone is not None else old["phone"] or "",
            settings().phi_key,
            household,
            flags["dm"],
            flags["htn"],
            flags["ckd34"],
            k_order,
            flags["tier_id"],
            id,
        ),
    )
    if body.icd10 is not None:
        conn.execute("DELETE FROM conditions WHERE client_id=%s", (id,))
        for code in sorted(set(c.upper().strip() for c in body.icd10)):
            conn.execute("INSERT INTO conditions VALUES(%s,%s)", (id, code))
    if body.allergens is not None:
        conn.execute("DELETE FROM client_allergens WHERE client_id=%s", (id,))
        for code in sorted(set(allergens)):
            conn.execute("INSERT INTO client_allergens VALUES(%s,%s)", (id, code))
    conn.execute(
        """UPDATE sessions SET dm=%s,htn=%s,ckd34=%s,k_limit_ordered=%s,tier_id=%s,
        allergens=%s,household_size=%s WHERE client_id=%s AND status IN ('active','queued')""",
        (
            flags["dm"],
            flags["htn"],
            flags["ckd34"],
            k_order,
            flags["tier_id"],
            allergens,
            household,
            id,
        ),
    )
    return {**read_client(conn, id), "warnings": flags["warnings"]}


@router.post("/clients/{id}/tokens/revoke", dependencies=[Depends(doctor)])
def revoke(id: UUID, conn=Depends(connection, scope="function")):
    advance(conn)
    read_client(conn, id)
    conn.execute(
        "UPDATE enrollment_tokens SET status='revoked' WHERE client_id=%s AND status='active'",
        (id,),
    )
    conn.execute(
        "UPDATE sessions SET status='expired' WHERE client_id=%s AND status IN ('active','queued')",
        (id,),
    )
    advance(conn)
    return {"ok": True}


@router.get("/me/profile")
def profile(user=Depends(require_role("client")), conn=Depends(connection, scope="function")):
    row = conn.execute("SELECT id FROM clients WHERE user_id=%s", (user["id"],)).fetchone()
    if not row:
        raise APIError(404, "not_found", "profile not found")
    return read_client(conn, row["id"])


@router.get("/me/visits")
def visits(user=Depends(require_role("client")), conn=Depends(connection, scope="function")):
    return conn.execute(
        """SELECT p.name AS product_name,l.grant_id,l.tier_id,l.qty,l.sold_at FROM checkout_ledger l
        JOIN products p ON p.id=l.product_id JOIN sessions s ON s.id=l.session_id JOIN clients c ON c.id=s.client_id
        WHERE c.user_id=%s ORDER BY l.sold_at DESC""",
        (user["id"],),
    ).fetchall()


@router.post("/staff/lookup", dependencies=[Depends(staff)])
def lookup(body: Lookup, conn=Depends(connection, scope="function")):
    return conn.execute(
        """SELECT c.id AS client_id,c.tier_id,pgp_sym_decrypt(c.legal_name_enc,%s) AS legal_name,
        (SELECT CASE WHEN status='active' AND expires_on<=CURRENT_DATE THEN 'expired' ELSE status::text END
        FROM enrollment_tokens WHERE client_id=c.id ORDER BY created_at DESC,id DESC LIMIT 1) AS token_status
        FROM clients c WHERE c.name_hmac=hmac(lower(btrim(%s)),%s,'sha256')""",
        (settings().phi_key, body.name, settings().hmac_key),
    ).fetchall()


@router.post("/staff/reissue", dependencies=[Depends(staff)])
def reissue(body: Reissue, conn=Depends(connection, scope="function")):
    advance(conn)
    read_client(conn, body.client_id)
    conn.execute("SELECT id FROM clients WHERE id=%s FOR UPDATE", (body.client_id,))
    conn.execute(
        "UPDATE sessions SET status='expired' WHERE client_id=%s AND status IN ('active','queued')",
        (body.client_id,),
    )
    raw = issue_card(conn, body.client_id)
    advance(conn)
    return {"client_id": body.client_id, "token": raw}
