from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict

from app.auth import APIError
from app.db import env, get_conn
from app.phi import issue_card, token_status
from app.roles import staff_or_admin

router = APIRouter()


class LookupBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str


class ReissueBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    client_id: str


@router.post("/staff/lookup")
def lookup(body: LookupBody, conn=Depends(get_conn), _user=Depends(staff_or_admin)):
    row = conn.execute(
        """
        SELECT c.id,
               pgp_sym_decrypt(c.legal_name_enc, %s) AS legal_name,
               c.tier_id,
               tok.status AS token_row_status,
               tok.expires_on AS token_expires_on
        FROM clients c
        LEFT JOIN LATERAL (
          SELECT status, expires_on FROM enrollment_tokens
          WHERE client_id = c.id
          ORDER BY created_at DESC
          LIMIT 1
        ) tok ON true
        WHERE c.name_hmac = hmac(
          convert_to(lower(btrim(%s)), 'UTF8'),
          convert_to(%s, 'UTF8'),
          'sha256'
        )
        """,
        (env("PHI_KEY"), body.name, env("HMAC_KEY")),
    ).fetchone()
    if row is None:
        raise APIError(404, "not_found", "no client with that name")
    return {
        "client_id": str(row["id"]),
        "legal_name": row["legal_name"],
        "tier_id": row["tier_id"],
        "token_status": token_status(row["token_row_status"], row["token_expires_on"]),
    }


@router.post("/staff/reissue")
def reissue(body: ReissueBody, conn=Depends(get_conn), _user=Depends(staff_or_admin)):
    found = conn.execute("SELECT id FROM clients WHERE id = %s", (body.client_id,)).fetchone()
    if found is None:
        raise APIError(404, "not_found", "unknown client")
    with conn.transaction():
        conn.execute(
            """
            UPDATE enrollment_tokens SET status = 'revoked'
            WHERE client_id = %s AND status = 'active'
            """,
            (body.client_id,),
        )
        raw = issue_card(conn, body.client_id)
    return {"card_token": raw}
