"""Epic Cure warehouse plus nearby partner sites. Existing lots stay on the main store."""

from psycopg.types.json import Json

HOURS = {day: ["00:00", "23:59"] for day in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")}

STORES = (
    {
        "slug": "epic-cure",
        "name": "Epic Cure main warehouse",
        "address": "100 King Street",
        "city": "St. Augustine",
        "lat": 29.8947,
        "lng": -81.3145,
        "kiosk_code": "epic-main-kiosk",
        "max_floor_capacity": 25,
    },
    {
        "slug": "west-augustine",
        "name": "West Augustine partner pantry",
        "address": "800 West King Street",
        "city": "St. Augustine",
        "lat": 29.9075,
        "lng": -81.3520,
        "kiosk_code": "west-augustine-kiosk",
        "max_floor_capacity": 8,
    },
    {
        "slug": "st-augustine-beach",
        "name": "St. Augustine Beach partner site",
        "address": "300 A1A Beach Boulevard",
        "city": "St. Augustine Beach",
        "lat": 29.8419,
        "lng": -81.2712,
        "kiosk_code": "beach-kiosk",
        "max_floor_capacity": 8,
    },
)


def seed_stores(conn):
    for store in STORES:
        conn.execute(
            """INSERT INTO stores
            (name,slug,address,city,lat,lng,timezone,open_hours_json,max_floor_capacity,kiosk_code)
            VALUES (%s,%s,%s,%s,%s,%s,'America/New_York',%s,%s,%s)
            ON CONFLICT (slug) DO NOTHING""",
            (
                store["name"],
                store["slug"],
                store["address"],
                store["city"],
                store["lat"],
                store["lng"],
                Json(HOURS),
                store["max_floor_capacity"],
                store["kiosk_code"],
            ),
        )
    main = conn.execute("SELECT id FROM stores WHERE slug='epic-cure'").fetchone()["id"]
    conn.execute("UPDATE lots SET store_id=%s WHERE store_id IS NULL", (main,))
    conn.execute("UPDATE checkout_ledger SET store_id=%s WHERE store_id IS NULL", (main,))
    partners = conn.execute(
        "SELECT id FROM stores WHERE slug<>'epic-cure' ORDER BY slug"
    ).fetchall()
    products = conn.execute(
        "SELECT DISTINCT product_id FROM lots WHERE store_id=%s", (main,)
    ).fetchall()
    for partner in partners:
        for product in products:
            exists = conn.execute(
                "SELECT id FROM lots WHERE store_id=%s AND product_id=%s",
                (partner["id"], product["product_id"]),
            ).fetchone()
            if exists:
                continue
            conn.execute(
                """INSERT INTO lots (product_id,grant_id,arrived_on,expires_on,qty,store_id)
                VALUES (%s,'grant-b',CURRENT_DATE+30,CURRENT_DATE+90,2,%s)""",
                (product["product_id"], partner["id"]),
            )
