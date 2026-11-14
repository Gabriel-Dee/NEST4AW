import os
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs"


def load_dotenv() -> None:
    path = Path(__file__).resolve().parents[1] / ".env"
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is not set")
    return value


def connect(url: str | None = None):
    return psycopg.connect(url or env("DATABASE_URL"), autocommit=True, row_factory=dict_row)


def get_conn():
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


def sql_statements(text: str) -> list[str]:
    lines = []
    for line in text.splitlines():
        if "--" in line:
            line = line[: line.index("--")]
        lines.append(line)
    return [part.strip() for part in "\n".join(lines).split(";") if part.strip()]


def run_script(conn, path: Path) -> None:
    for statement in sql_statements(path.read_text()):
        conn.execute(statement)


def apply_schema(conn) -> None:
    run_script(conn, DOCS / "schema.sql")
    run_script(conn, DOCS / "seed_reference.sql")
