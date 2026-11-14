import json
import os
from datetime import date, timedelta

from app.auth import hasher
from app.db import DOCS, apply_schema, connect, env, load_dotenv
from app.phi import issue_card
from app.tier import flags_from_icd

BINS = {
    "banana": ("A", "1", "A1"),
    "orange_juice": ("A", "1", "A2"),
    "progresso": ("B", "2", "B1"),
    "mcdougall": ("B", "2", "B2"),
    "sugar_free_cookies": ("C", "1", "C1"),
    "peanut_bar": ("C", "1", "C2"),
}
PHONES = {
    "maria": "555-0101",
    "james": "555-0102",
    "asha": "555-0103",
    "luis": "555-0104",
    "helen": "555-0105",
}
STAFF = (
    ("admin@demo.local", "admin"),
    ("doctor@demo.local", "doctor"),
    ("staff@demo.local", "warehouse_staff"),
    ("partner@demo.local", "community_partner"),
)


def insert_user(conn, email, role, password):
    return conn.execute(
        """
        INSERT INTO users (email, password_hash, role)
        VALUES (%s, %s, %s)
        RETURNING id
        """,
        (email.lower(), hasher().hash(password), role),
    ).fetchone()["id"]


def load_products(conn, foods):
    today = date.today()
    for food in foods:
        row = conn.execute(
            """
            INSERT INTO products (
              barcode, internal_code, name, serving_text, serving_g,
              sodium_mg, potassium_mg, phosphorus_mg, added_sugar_g, carb_g, fiber_g, gi,
              ingredients, category, is_drink, is_juice, allergen_tags,
              fdc_id, net_weight_g, source, source_url, added_sugar_assumed
            ) VALUES (
              %s, %s, %s, %s, %s,
              %s, %s, %s, %s, %s, %s, %s,
              %s, %s, %s, %s, %s,
              %s, %s, %s, %s, %s
            )
            RETURNING id
            """,
            (
                food["barcode"],
                food["internal_code"],
                food["name"],
                food["serving_text"],
                food["serving_g"],
                food["sodium_mg"],
                food["potassium_mg"],
                food["phosphorus_mg"],
                food["added_sugar_g"],
                food["carb_g"],
                food["fiber_g"],
                food["gi"],
                food["ingredients"],
                food["category"],
                food["is_drink"],
                food["is_juice"],
                food["allergen_tags"],
                food["fdc_id"],
                food["serving_g"],
                food["source"],
                food["source_url"],
                food["added_sugar_assumed"],
            ),
        ).fetchone()
        aisle, shelf, code = BINS[food["key"]]
        bin_row = conn.execute(
            """
            INSERT INTO bins (aisle, shelf, bin_code, product_id)
            VALUES (%s, %s, %s, %s) RETURNING id
            """,
            (aisle, shelf, code, row["id"]),
        ).fetchone()
        grant = "grant-a" if food["category"] == "produce" else "grant-b"
        for arrived, expires, qty in (
            (today - timedelta(days=40), today - timedelta(days=1), 5),
            (today - timedelta(days=10), today + timedelta(days=3), 1),
            (today - timedelta(days=1), today + timedelta(days=60), 1),
        ):
            conn.execute(
                """
                INSERT INTO lots (product_id, bin_id, grant_id, arrived_on, expires_on, qty)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (row["id"], bin_row["id"], grant, arrived, expires, qty),
            )


def insert_client(conn, persona, password, phone):
    flags = flags_from_icd(persona["icd10"])
    user_id = insert_user(conn, persona["email"], "client", password)
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
        ) RETURNING id
        """,
        (
            user_id,
            persona["legal_name"],
            env("PHI_KEY"),
            phone,
            env("PHI_KEY"),
            persona["legal_name"],
            env("HMAC_KEY"),
            flags.dm,
            flags.htn,
            flags.ckd34,
            persona["k_limit_ordered"],
            persona["household_size"],
            flags.tier_id,
        ),
    ).fetchone()
    for code in persona["icd10"]:
        conn.execute(
            "INSERT INTO conditions (client_id, icd10) VALUES (%s, %s)",
            (client["id"], code),
        )
    for code in persona["allergens"]:
        conn.execute(
            "INSERT INTO client_allergens (client_id, code) VALUES (%s, %s)",
            (client["id"], code),
        )
    return persona["email"], issue_card(conn, client["id"])


def main():
    load_dotenv()
    password = os.environ.get("SEED_PASSWORD", "nest-local-demo")
    golden = json.loads((DOCS / "golden.json").read_text())
    with connect() as conn:
        conn.execute("DROP SCHEMA public CASCADE")
        conn.execute("CREATE SCHEMA public")
        apply_schema(conn)
        for email, role in STAFF:
            insert_user(conn, email, role, password)
        cards = [
            insert_client(conn, persona, password, PHONES[persona["key"]])
            for persona in golden["personas"]
        ]
        load_products(conn, golden["foods"])
    print(f"password={password}")
    for email, token in cards:
        print(f"card {email} {token}")
    if not os.environ.get("FDC_API_KEY", "").strip():
        print("catalog pull skipped, FDC_API_KEY unset")


if __name__ == "__main__":
    main()
