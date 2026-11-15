"""Apply the authoritative schema once; repeatable demo seed without secret rotation."""

import argparse
import json
import os
from pathlib import Path

import psycopg
from psycopg import sql
from psycopg.rows import dict_row

from app.auth import password_hash
from app.clients import enroll
from app.config import settings
from app.schemas import ClientCreate
from seed.recipes import seed_library
from seed.stores import seed_stores

ROOT = Path(__file__).resolve().parents[2]


def initialize(conn):
    conn.execute("SELECT pg_advisory_xact_lock(861105)")
    if conn.execute("SELECT to_regclass('public.users') AS name").fetchone()["name"] is None:
        conn.execute((ROOT / "docs/schema.sql").read_text())
        conn.execute((ROOT / "docs/seed_reference.sql").read_text())
    else:
        # Never silently reapply a partial schema.
        from app.rules import RuleEngine

        RuleEngine(conn.execute("SELECT * FROM rules").fetchall())

    for migration in sorted((ROOT / "backend/migrations").glob("*.sql")):
        conn.execute(migration.read_text())
    seed_library(conn)
    stock_demo_sheet(conn)
    seed_stores(conn)


def stock_demo_sheet(conn):
    """Stock the barcode-test-sheet products so scanning them in the demo can add to cart.

    Idempotent: insert_product skips existing barcodes and stock_demo skips stocked products.
    seed_stores() then copies the stock to every partner store.
    """
    snapshot = ROOT / "backend/seed/data/demo_sheet_products.json"
    for i, food in enumerate(json.loads(snapshot.read_text())["products"], start=2000):
        pid = insert_product(conn, food) or conn.execute(
            "SELECT id FROM products WHERE barcode=%s", (food["barcode"],)
        ).fetchone()["id"]
        stock_demo(conn, pid, i)


def insert_product(conn, food):
    values = {k: v for k, v in food.items() if k != "key"}
    query = sql.SQL(
        "INSERT INTO products ({}) VALUES ({}) ON CONFLICT DO NOTHING RETURNING id"
    ).format(
        sql.SQL(",").join(map(sql.Identifier, values)),
        sql.SQL(",").join(sql.Placeholder() for _ in values),
    )
    row = conn.execute(query, list(values.values())).fetchone()
    if row:
        return row["id"]
    row = conn.execute(
        "SELECT id FROM products WHERE barcode=%s OR internal_code=%s",
        (food.get("barcode"), food.get("internal_code")),
    ).fetchone()
    return row["id"] if row else None


def stock_demo(conn, pid, index, produce=False):
    if conn.execute("SELECT id FROM bins WHERE product_id=%s", (pid,)).fetchone():
        return
    bid = conn.execute(
        "INSERT INTO bins(aisle,shelf,bin_code,product_id,min_qty) VALUES(%s,'1',%s,%s,2) RETURNING id",
        ("A" if produce else "B", f"DEMO-{index:03}", pid),
    ).fetchone()["id"]
    for arrival, expiry, qty in ((-4, -1, 1), (-3, 3, 1), (-1, 30, 1)):
        conn.execute(
            """INSERT INTO lots(product_id,bin_id,grant_id,arrived_on,expires_on,qty)
            VALUES(%s,%s,%s,CURRENT_DATE+%s,CURRENT_DATE+%s,%s)""",
            (pid, bid, "grant-a" if produce else "grant-b", arrival, expiry, qty),
        )


def seed(conn):
    golden = json.loads((ROOT / "docs/golden.json").read_text())
    password = os.getenv("SEED_PASSWORD", "nest-local-demo")
    for name, role in (
        ("admin", "admin"),
        ("doctor", "doctor"),
        ("staff", "warehouse_staff"),
        ("partner", "community_partner"),
    ):
        conn.execute(
            "INSERT INTO users(email,password_hash,role) VALUES(%s,%s,%s) ON CONFLICT(email) DO NOTHING",
            (name + "@demo.local", password_hash.hash(password), role),
        )
    cards = []
    for person in golden["personas"]:
        if conn.execute("SELECT id FROM users WHERE email=%s", (person["email"],)).fetchone():
            continue
        body = ClientCreate(
            **{k: v for k, v in person.items() if k not in ("key", "tier")}, password=password
        )
        result = enroll(conn, body)
        cards.append({"email": person["email"], "token": result["token"]})
    for i, food in enumerate(golden["foods"]):
        pid = insert_product(conn, food)
        stock_demo(conn, pid, i, food["category"] == "produce")
    snapshot = ROOT / "backend/seed/data/off_products.json"
    if snapshot.exists():
        for i, food in enumerate(json.loads(snapshot.read_text())["products"], start=1000):
            pid = insert_product(conn, food)
            if pid:
                stock_demo(conn, pid, i)
    return cards


def load_products(conn, foods):
    """Compatibility entry point for the incoming seed/test helpers; never clears existing data."""
    for index, food in enumerate(foods):
        pid = insert_product(conn, food)
        if pid:
            stock_demo(conn, pid, index, food.get("category") == "produce")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--enrich",
        action="store_true",
        help="Import actual FDC products toward 100; requires FDC_API_KEY",
    )
    args = parser.parse_args()
    with psycopg.connect(settings().database_url, row_factory=dict_row) as conn:
        initialize(conn)
        cards = seed(conn)
    for card in cards:
        print(json.dumps(card))  # Demo-only credentials, once after commit.
    if args.enrich:
        from seed.enrich import enrich

        enrich()


if __name__ == "__main__":
    main()
