from app.errors import APIError

PUBLIC_FIELDS = (
    "id",
    "status",
    "tier_id",
    "dm",
    "htn",
    "ckd34",
    "k_limit_ordered",
    "allergens",
    "household_size",
    "lease_expires_at",
)


def public_session(row):
    result = {k: row[k] for k in PUBLIC_FIELDS}
    result["session_id"] = result.pop("id")
    return result


def advance(conn):
    # All floor/session mutations take this lock first, including checkout and profile changes.
    conn.execute("SELECT pg_advisory_xact_lock(861104)")
    conn.execute(
        "UPDATE sessions SET status='expired' WHERE status='active' AND lease_expires_at<=now()"
    )
    # Revoked cards and disabled users cannot retain a bearer session or queue place.
    conn.execute("""UPDATE sessions s SET status='expired' WHERE s.status IN ('active','queued') AND
        (NOT EXISTS(SELECT 1 FROM enrollment_tokens t WHERE t.client_id=s.client_id AND t.status='active'
         AND t.expires_on>CURRENT_DATE) OR EXISTS(SELECT 1 FROM clients c JOIN users u ON u.id=c.user_id
         WHERE c.id=s.client_id AND u.disabled))""")
    conn.execute("""WITH lim AS (SELECT max_floor,lease_minutes FROM warehouse_limits WHERE id=1),
        free AS (SELECT greatest(0,(SELECT max_floor FROM lim)-(SELECT count(*) FROM sessions WHERE status='active')) AS n)
        UPDATE sessions SET status='active',lease_expires_at=now()+make_interval(mins=>(SELECT lease_minutes FROM lim))
        WHERE id IN (SELECT id FROM sessions WHERE status='queued' ORDER BY queued_at,id LIMIT (SELECT n FROM free))""")


def active_session(conn, sid, active=True):
    advance(conn)
    row = conn.execute("SELECT * FROM sessions WHERE id=%s FOR UPDATE", (sid,)).fetchone()
    if row is None:
        raise APIError(404, "not_found", "session not found")
    if row["status"] in ("expired", "closed") or (active and row["status"] != "active"):
        raise APIError(409, "session_inactive", "session is not active")
    return row


def product(conn, pid=None, barcode=None, internal_code=None):
    return conn.execute(
        """SELECT p.*,b.aisle,b.shelf,b.bin_code,
        EXISTS(SELECT 1 FROM lots l WHERE l.product_id=p.id AND l.qty>0
          AND l.expires_on>CURRENT_DATE AND l.expires_on<=CURRENT_DATE+7) AS soon_to_expire,
        coalesce((SELECT sum(qty) FROM lots WHERE product_id=p.id AND expires_on>CURRENT_DATE),0) AS stock
        FROM products p LEFT JOIN LATERAL (SELECT aisle,shelf,bin_code FROM bins WHERE product_id=p.id ORDER BY bin_code LIMIT 1) b ON true
        WHERE p.id=%s OR p.barcode=%s OR p.internal_code=%s LIMIT 1""",
        (pid, barcode, internal_code),
    ).fetchone()
