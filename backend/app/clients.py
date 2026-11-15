import hashlib
import secrets

from app.auth import password_hash
from app.config import settings
from app.errors import APIError
from app.tier import derive

CLIENT_SELECT = """SELECT c.id,c.user_id,(SELECT email FROM users WHERE id=c.user_id) AS email,c.dm,c.htn,c.ckd34,c.k_limit_ordered,c.household_size,c.tier_id,
pgp_sym_decrypt(c.legal_name_enc,%s) AS legal_name,
CASE WHEN c.phone_enc IS NOT NULL THEN pgp_sym_decrypt(c.phone_enc,%s) END AS phone,
ARRAY(SELECT icd10 FROM conditions WHERE client_id=c.id ORDER BY icd10) AS icd10,
ARRAY(SELECT code FROM client_allergens WHERE client_id=c.id ORDER BY code) AS allergens,
(SELECT CASE WHEN status='active' AND expires_on<=CURRENT_DATE THEN 'expired' ELSE status::text END
 FROM enrollment_tokens WHERE client_id=c.id ORDER BY created_at DESC,id DESC LIMIT 1) AS token_status
FROM clients c"""


def read_client(conn, client_id):
    row = conn.execute(
        CLIENT_SELECT + " WHERE c.id=%s", (settings().phi_key, settings().phi_key, client_id)
    ).fetchone()
    if not row:
        raise APIError(404, "not_found", "client not found")
    return row


def issue_card(conn, client_id):
    conn.execute(
        "UPDATE enrollment_tokens SET status='revoked' WHERE client_id=%s AND status='active'",
        (client_id,),
    )
    raw = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO enrollment_tokens(client_id,token_hash,expires_on) VALUES(%s,%s,CURRENT_DATE+365)",
        (client_id, hashlib.sha256(raw.encode()).digest()),
    )
    return raw


def enroll(conn, body):
    flags = derive(body.icd10)
    uid = conn.execute(
        "INSERT INTO users(email,password_hash,role) VALUES(%s,%s,'client') RETURNING id",
        (body.email.lower(), password_hash.hash(body.password)),
    ).fetchone()["id"]
    cfg = settings()
    row = conn.execute(
        """INSERT INTO clients(user_id,legal_name_enc,phone_enc,name_hmac,dm,htn,ckd34,
        k_limit_ordered,household_size,tier_id) VALUES(%s,pgp_sym_encrypt(%s,%s),pgp_sym_encrypt(%s,%s),
        hmac(lower(btrim(%s)),%s,'sha256'),%s,%s,%s,%s,%s,%s) RETURNING id""",
        (
            uid,
            body.legal_name,
            cfg.phi_key,
            body.phone,
            cfg.phi_key,
            body.legal_name,
            cfg.hmac_key,
            flags["dm"],
            flags["htn"],
            flags["ckd34"],
            body.k_limit_ordered,
            body.household_size,
            flags["tier_id"],
        ),
    ).fetchone()
    cid = row["id"]
    for code in sorted(set(c.strip().upper() for c in body.icd10)):
        conn.execute("INSERT INTO conditions VALUES(%s,%s)", (cid, code))
    for code in sorted(set(body.allergens)):
        conn.execute("INSERT INTO client_allergens VALUES(%s,%s)", (cid, code))
    raw = issue_card(conn, cid)
    return {
        **read_client(conn, cid),
        "token": raw,
        "card_token": raw,
        "token_status": "active",
        "warnings": flags["warnings"],
    }
