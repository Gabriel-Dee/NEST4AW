"""Create synthetic role-testing accounts without replacing existing users or inventory.

Run: python -m seed.accounts --initialize
Passwords come from ACCOUNT_SEED_PASSWORD or a hidden interactive prompt, never a CLI argument.
"""

import argparse
import getpass
import json
import os
import re

import psycopg
from psycopg.rows import dict_row
from pydantic import ValidationError

from app.auth import password_hash
from app.clients import enroll
from app.config import settings
from app.schemas import ClientCreate
from seed.load import ROOT, initialize

STAFF = (
    ("admin", "admin"),
    ("doctor", "doctor"),
    ("staff", "warehouse_staff"),
    ("partner", "community_partner"),
)


def account_plan(domain="epic.com"):
    domain = domain.strip().lower()
    if len(domain) > 200 or not re.fullmatch(
        r"(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}", domain
    ):
        raise ValueError("supply an email domain such as epic.com, without @")
    people = json.loads((ROOT / "docs/golden.json").read_text())["personas"]
    plan = [{"email": f"{name}@{domain}", "role": role, "persona": None} for name, role in STAFF]
    for person in people:
        plan.append({"email": f"{person['key']}@{domain}", "role": "client", "persona": person})
    return plan


def create_accounts(conn, password, domain="epic.com"):
    if not isinstance(password, str) or not 12 <= len(password) <= 1024:
        raise ValueError("account seed password must contain 12–1024 characters")
    plan = account_plan(domain)
    # Same lock as regular seeding; all nine accounts commit or roll back together.
    conn.execute("SELECT pg_advisory_xact_lock(861105)")
    existing = {}
    for account in plan:
        email, role = account["email"], account["role"]
        row = conn.execute(
            "SELECT id,role,disabled FROM users WHERE lower(email)=%s FOR UPDATE", (email,)
        ).fetchone()
        if row:
            if row["role"] != role:
                raise ValueError(
                    f"{email} already has role {row['role']}; no accounts were changed"
                )
            if (
                role == "client"
                and not conn.execute(
                    "SELECT id FROM clients WHERE user_id=%s", (row["id"],)
                ).fetchone()
            ):
                raise ValueError(
                    f"{email} has no patient profile; repair that enrollment before rerunning"
                )
            existing[email] = row
    output = []
    for account in plan:
        email, role = account["email"], account["role"]
        if email in existing:
            output.append(
                {
                    "email": email,
                    "role": role,
                    "result": "unchanged",
                    "disabled": existing[email]["disabled"],
                }
            )
        elif role == "client":
            body = ClientCreate(
                **{
                    k: v for k, v in account["persona"].items() if k not in ("key", "tier", "email")
                },
                email=email,
                password=password,
            )
            created = enroll(conn, body)
            output.append(
                {
                    "email": email,
                    "role": role,
                    "result": "created",
                    "client_id": str(created["id"]),
                    "tier_id": created["tier_id"],
                    "card_token": created["token"],
                }
            )
        else:
            conn.execute(
                "INSERT INTO users(email,password_hash,role) VALUES(%s,%s,%s)",
                (email, password_hash.hash(password), role),
            )
            output.append({"email": email, "role": role, "result": "created"})
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--domain", default="epic.com")
    parser.add_argument(
        "--initialize",
        action="store_true",
        help="Apply the existing schema/reference seed if empty; never drop data",
    )
    args = parser.parse_args()
    try:
        account_plan(args.domain)
        password = os.getenv("ACCOUNT_SEED_PASSWORD")
        if password is None:
            password = getpass.getpass("Choose a test-account password (at least 12 characters): ")
            if password != getpass.getpass("Confirm password: "):
                raise ValueError("passwords do not match")
        if not 12 <= len(password) <= 1024:
            raise ValueError("account seed password must contain 12–1024 characters")
        with psycopg.connect(settings().database_url, row_factory=dict_row) as conn:
            if args.initialize:
                initialize(conn)
            elif (
                conn.execute("SELECT to_regclass('public.users') AS table_name").fetchone()[
                    "table_name"
                ]
                is None
            ):
                raise ValueError("schema is missing; run with --initialize")
            result = create_accounts(conn, password, args.domain)
    except ValidationError:
        parser.exit(
            1,
            "Account seed stopped: check DATABASE_URL, JWT_SECRET, PHI_KEY, HMAC_KEY, and profile input; existing data was not reset.\n",
        )
    except (ValueError, EOFError) as exc:
        parser.exit(1, f"Account seed stopped: {exc}\n")
    except psycopg.Error:
        parser.exit(
            1,
            "Account seed failed; transaction rolled back. Check PostgreSQL credentials and schema.\n",
        )
    # Raw floor-card secrets are issued only here, after the transaction commits.
    for row in result:
        print(json.dumps(row))
    print(
        "New accounts use the password you supplied. Existing passwords/roles/status are unchanged."
    )
    print(
        "Patient card tokens above are issued once; store on test cards or reissue through staff tools."
    )


if __name__ == "__main__":
    main()
