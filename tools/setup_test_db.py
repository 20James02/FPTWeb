"""Create test roles only; migrations/pgmq run inside fresh per-run test databases."""

import os

import psycopg

DSN = os.environ.get("PAGEFPT_TEST_DSN", "postgresql://postgres@/postgres?host=/tmp&port=55432")
with psycopg.connect(DSN, autocommit=True) as connection:
    for name, options in [("anon", ""), ("authenticated", ""), ("service_role", "BYPASSRLS")]:
        if not connection.execute("SELECT 1 FROM pg_roles WHERE rolname=%s", [name]).fetchone():
            connection.execute(f"CREATE ROLE {name} {options}")
    print("Test roles ready")
