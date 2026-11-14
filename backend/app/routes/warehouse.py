import hashlib
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request

from app.auth import require_role
from app.db import connection
from app.errors import APIError
from app.floor import active_session, advance, product, public_session
from app.schemas import Arrival, CartAdd, LotCreate, Scan, SessionBody

router = APIRouter()
staff = require_role("warehouse_staff", "admin")


@router.post("/floor/arrive")
def arrive(body: Arrival, conn=Depends(connection, scope="function")):
    advance(conn)
    person = conn.execute(
        """SELECT c.* FROM enrollment_tokens t JOIN clients c ON c.id=t.client_id
        JOIN users u ON u.id=c.user_id WHERE t.token_hash=%s AND t.status='active' AND t.expires_on>CURRENT_DATE
        AND NOT u.disabled FOR UPDATE OF c""",
        (hashlib.sha256(body.token.encode()).digest(),),
    ).fetchone()
    if not person:
        raise APIError(401, "unauthorized", "please see a volunteer")
    existing = conn.execute(
        "SELECT * FROM sessions WHERE client_id=%s AND status IN ('active','queued') ORDER BY created_at LIMIT 1",
        (person["id"],),
    ).fetchone()
    if existing:
        return public_session(existing)
    limits = conn.execute("SELECT * FROM warehouse_limits WHERE id=1").fetchone()
    counts = {
        r["status"]: r["n"]
        for r in conn.execute("SELECT status,count(*) AS n FROM sessions GROUP BY status")
    }
    status = "active" if counts.get("active", 0) < limits["max_floor"] else "queued"
    if status == "queued" and counts.get("queued", 0) >= limits["max_queue"]:
        raise APIError(409, "floor_full", "please see a volunteer")
    allergens = [
        r["code"]
        for r in conn.execute(
            "SELECT code FROM client_allergens WHERE client_id=%s", (person["id"],)
        )
    ]
    row = conn.execute(
        """INSERT INTO sessions(client_id,status,queued_at,lease_expires_at,tier_id,dm,htn,ckd34,
        k_limit_ordered,allergens,household_size) VALUES(%s,%s,now(),
        CASE WHEN %s='active' THEN now()+make_interval(mins=>%s) END,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
        (
            person["id"],
            status,
            status,
            limits["lease_minutes"],
            person["tier_id"],
            person["dm"],
            person["htn"],
            person["ckd34"],
            person["k_limit_ordered"],
            allergens,
            person["household_size"],
        ),
    ).fetchone()
    return public_session(row)


@router.get("/sessions/{session_id}")
def session(session_id: UUID, conn=Depends(connection, scope="function")):
    return public_session(active_session(conn, session_id, False))


@router.get("/floor/board", dependencies=[Depends(staff)])
def board(conn=Depends(connection, scope="function")):
    advance(conn)
    counts = {
        r["status"]: r["n"]
        for r in conn.execute(
            "SELECT status,count(*) AS n FROM sessions WHERE status IN ('active','queued') GROUP BY status"
        )
    }
    rows = conn.execute(
        "SELECT id AS session_id,status,tier_id,queued_at FROM sessions WHERE status='queued' ORDER BY queued_at,id"
    ).fetchall()
    return {"active": counts.get("active", 0), "queued": counts.get("queued", 0), "queue": rows}


@router.post("/scan")
def scan(body: Scan, request: Request, conn=Depends(connection, scope="function")):
    person = active_session(conn, body.session_id)
    food = product(conn, barcode=body.barcode, internal_code=body.internal_code)
    return request.app.state.engine.evaluate(person, food)


@router.post("/cart/lines")
def add(body: CartAdd, request: Request, conn=Depends(connection, scope="function")):
    person = active_session(conn, body.session_id)
    food = product(conn, pid=body.product_id)
    result = request.app.state.engine.evaluate(person, food)
    if result["verdict"] not in ("green", "yellow"):
        raise APIError(409, "not_eligible", "item requires clinical review")
    old = conn.execute(
        "SELECT qty FROM cart_lines WHERE session_id=%s AND product_id=%s",
        (body.session_id, body.product_id),
    ).fetchone()
    if food["stock"] <= (old["qty"] if old else 0):
        raise APIError(409, "out_of_stock", "not enough unexpired stock")
    return conn.execute(
        """INSERT INTO cart_lines(session_id,product_id,qty,verdict) VALUES(%s,%s,1,%s)
        ON CONFLICT(session_id,product_id) DO UPDATE SET qty=cart_lines.qty+1,verdict=excluded.verdict RETURNING *""",
        (body.session_id, body.product_id, result["verdict"]),
    ).fetchone()


@router.delete("/cart/lines/{product_id}")
def remove(product_id: UUID, session_id: UUID, conn=Depends(connection, scope="function")):
    active_session(conn, session_id)
    conn.execute(
        "DELETE FROM cart_lines WHERE session_id=%s AND product_id=%s", (session_id, product_id)
    )
    return {"ok": True}


@router.get("/cart")
def cart(session_id: UUID, conn=Depends(connection, scope="function")):
    active_session(conn, session_id)
    return conn.execute(
        "SELECT * FROM cart_lines WHERE session_id=%s ORDER BY product_id", (session_id,)
    ).fetchall()


@router.post("/checkout", dependencies=[Depends(staff)])
def checkout(body: SessionBody, request: Request, conn=Depends(connection, scope="function")):
    person = active_session(conn, body.session_id)
    lines = conn.execute(
        "SELECT * FROM cart_lines WHERE session_id=%s ORDER BY product_id FOR UPDATE",
        (body.session_id,),
    ).fetchall()
    if not lines:
        raise APIError(409, "empty_cart", "cart is empty")
    # Lock all products in stable order before reading nutrition and stock.
    for line in lines:
        conn.execute("SELECT id FROM products WHERE id=%s FOR UPDATE", (line["product_id"],))
    for line in lines:
        result = request.app.state.engine.evaluate(person, product(conn, pid=line["product_id"]))
        if result["verdict"] in ("red", "unknown"):
            raise APIError(409, "red_in_cart", "cart contains an item requiring review")
    ledger = []
    for line in lines:
        remaining = line["qty"]
        lots = conn.execute(
            """SELECT * FROM lots WHERE product_id=%s AND qty>0 AND expires_on>CURRENT_DATE
            ORDER BY arrived_on,expires_on,id FOR UPDATE""",
            (line["product_id"],),
        ).fetchall()
        for lot in lots:
            take = min(remaining, lot["qty"])
            if take == 0:
                break
            conn.execute(
                "UPDATE lots SET qty=qty-%s WHERE id=%s AND qty>=%s", (take, lot["id"], take)
            )
            ledger.append(
                conn.execute(
                    """INSERT INTO checkout_ledger(session_id,lot_id,product_id,grant_id,tier_id,qty)
                VALUES(%s,%s,%s,%s,%s,%s) RETURNING *""",
                    (
                        body.session_id,
                        lot["id"],
                        line["product_id"],
                        lot["grant_id"],
                        person["tier_id"],
                        take,
                    ),
                ).fetchone()
            )
            remaining -= take
        if remaining:
            raise APIError(409, "out_of_stock", "not enough unexpired stock")
    conn.execute("UPDATE sessions SET status='closed' WHERE id=%s", (body.session_id,))
    advance(conn)
    return ledger


@router.get("/lots", dependencies=[Depends(staff)])
def lots(product_id: UUID | None = None, conn=Depends(connection, scope="function")):
    return conn.execute(
        """SELECT *,expires_on>CURRENT_DATE AND expires_on<=CURRENT_DATE+7 AS soon_to_expire
        FROM lots WHERE (%s::uuid IS NULL OR product_id=%s) ORDER BY arrived_on,expires_on,id""",
        (product_id, product_id),
    ).fetchall()


@router.post("/lots", status_code=201, dependencies=[Depends(staff)])
def receive(body: LotCreate, conn=Depends(connection, scope="function")):
    conn.execute("SELECT id FROM products WHERE id=%s FOR UPDATE", (body.product_id,))
    if not conn.execute(
        "SELECT id FROM bins WHERE id=%s AND product_id=%s", (body.bin_id, body.product_id)
    ).fetchone():
        raise APIError(422, "invalid_bin", "bin must belong to the product")
    return conn.execute(
        """INSERT INTO lots(product_id,bin_id,grant_id,arrived_on,expires_on,qty)
        VALUES(%s,%s,%s,%s,%s,%s) RETURNING *""",
        tuple(body.model_dump().values()),
    ).fetchone()


@router.get("/inventory", dependencies=[Depends(staff)])
def inventory(conn=Depends(connection, scope="function")):
    return conn.execute("""SELECT b.*,coalesce(sum(l.qty) FILTER(WHERE l.expires_on>CURRENT_DATE),0) AS stock,
        coalesce(sum(l.qty) FILTER(WHERE l.expires_on>CURRENT_DATE),0)<b.min_qty AS low_stock,
        coalesce(sum(l.qty) FILTER(WHERE l.expires_on<=CURRENT_DATE),0) AS expired_units,
        coalesce(sum(l.qty) FILTER(WHERE l.expires_on>CURRENT_DATE AND l.expires_on<=CURRENT_DATE+7),0) AS expiring_units
        FROM bins b LEFT JOIN lots l ON l.bin_id=b.id GROUP BY b.id ORDER BY b.bin_code""").fetchall()


@router.get(
    "/reports/dispensed", dependencies=[Depends(require_role("community_partner", "admin"))]
)
def report(
    from_date: date = Query(alias="from"),
    to_date: date = Query(alias="to"),
    conn=Depends(connection, scope="function"),
):
    if from_date > to_date:
        raise APIError(422, "invalid_range", "from must be on or before to")
    return conn.execute(
        "SELECT day,tier_id,grant_id,units,pounds FROM analytics_public WHERE day BETWEEN %s AND %s ORDER BY day,tier_id,grant_id",
        (from_date, to_date),
    ).fetchall()


@router.get("/rules", dependencies=[Depends(require_role("doctor", "admin"))])
def rules(conn=Depends(connection, scope="function")):
    return conn.execute("SELECT * FROM rules ORDER BY rule_id").fetchall()
