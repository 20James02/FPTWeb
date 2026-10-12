import os
from pathlib import Path

import httpx
import psycopg
import pytest
from psycopg.types.json import Jsonb

DSN = os.environ.get("PAGEFPT_TEST_DSN", "")


def local_server_dsn():
    global DSN
    if not DSN:
        import tempfile

        import pgserver

        server = pgserver.get_server(
            Path(tempfile.gettempdir()) / "pagefpt-test-postgres", cleanup_mode="stop"
        )
        DSN = server.get_uri()
    with psycopg.connect(DSN, autocommit=True) as connection:
        for role, options in [("anon", ""), ("authenticated", ""), ("service_role", "BYPASSRLS")]:
            if not connection.execute("SELECT 1 FROM pg_roles WHERE rolname=%s", [role]).fetchone():
                connection.execute(f"CREATE ROLE {role} {options}")
    return DSN


class LocalGateway:
    """Runs the production RPC SQL on PostgreSQL; no in-memory persistence."""

    def __init__(self, dsn=None):
        self.dsn = dsn or local_server_dsn()

    async def rpc(self, name, payload, actor_token=None):
        from pagefpt.core.errors import DomainError

        # Only static identifiers emitted by application code can select an RPC.
        if name not in {
            "health",
            "dispatch",
            "submit_lead",
            "claim_jobs",
            "complete_job",
            "fail_job",
        }:
            raise AssertionError(name)
        async with await psycopg.AsyncConnection.connect(self.dsn) as connection:
            await connection.execute("SET ROLE service_role")
            result = await connection.execute(
                f"SELECT api.{name}(%s)", [Jsonb(payload.get("command", payload))]
            )
            row = await result.fetchone()
            value = row[0]
        if isinstance(value, dict) and value.get("error"):
            raise DomainError(value["error"], value.get("status", 400))
        return value

    async def close(self):
        pass


@pytest.fixture(scope="session")
def db_schema():
    from uuid import uuid4

    from psycopg import sql
    from psycopg.conninfo import make_conninfo

    local_server_dsn()
    name = "pagefpt_test_" + uuid4().hex
    with psycopg.connect(DSN, autocommit=True) as admin_db:
        admin_db.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
    dsn = make_conninfo(DSN, dbname=name)
    try:
        with psycopg.connect(dsn, autocommit=True) as conn:
            conn.execute(
                "CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$"
            )
            conn.execute(Path("tools/vendor/pgmq.sql").read_text())
            conn.execute(
                "CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$"
            )
            for migration in sorted(Path("supabase/migrations").glob("*.sql")):
                content = migration.read_text()
                assert content.strip().endswith("COMMIT;"), (
                    "Incomplete migration: " + migration.name
                )
                conn.execute(content)
        yield dsn
    finally:
        with psycopg.connect(DSN, autocommit=True) as admin_db:
            admin_db.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(name)))


@pytest.fixture
async def gateway(db_schema):
    with psycopg.connect(db_schema, autocommit=True) as conn:
        tables = conn.execute(
            "SELECT tablename FROM pg_tables WHERE schemaname='private'"
        ).fetchall()
        if tables:
            conn.execute("TRUNCATE " + ",".join("private." + t[0] for t in tables) + " CASCADE")
        # Restore singleton configuration rows after per-test data isolation.
        conn.execute("INSERT INTO private.catalog_revision DEFAULT VALUES")
        conn.execute("INSERT INTO private.export_epoch DEFAULT VALUES")
        for queue in ["lead_local", "lead_external", "conversions", "notifications", "maintenance"]:
            if conn.execute("SELECT 1 FROM pgmq.meta WHERE queue_name=%s", [queue]).fetchone():
                conn.execute("SELECT pgmq.purge_queue(%s)", [queue])
    return LocalGateway(db_schema)


@pytest.fixture
async def client(gateway):
    from pagefpt.application import create_app
    from pagefpt.core.config import Settings

    settings = Settings(
        _env_file=None,
        environment="test",
        encryption_key="e" * 32,
        matching_key="m" * 32,
        token_key="t" * 32,
        job_secret="j" * 32,
    )
    app = create_app(settings, gateway)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


@pytest.fixture
async def admin(client, gateway):
    from datetime import UTC, datetime, timedelta
    from uuid import uuid4

    import jwt
    from cryptography.hazmat.primitives.asymmetric import ec

    key = ec.generate_private_key(ec.SECP256R1())
    jwk = __import__("json").loads(jwt.algorithms.ECAlgorithm.to_jwk(key.public_key()))
    jwk.update(kid="test-key", alg="ES256")
    verifier = client._transport.app.state.verifier
    verifier.url = "https://test.supabase.co"
    verifier.keys = {"test-key": jwk}
    verifier.expires = __import__("time").monotonic() + 3600
    uid = str(uuid4())
    with psycopg.connect(gateway.dsn, autocommit=True) as conn:
        conn.execute(
            "INSERT INTO private.memberships(user_id,branch_id,permissions) VALUES(%s,'00000000-0000-0000-0000-000000000000',ARRAY['*'])",
            [uid],
        )
    token = jwt.encode(
        {
            "sub": uid,
            "iss": "https://test.supabase.co/auth/v1",
            "aud": "authenticated",
            "iat": datetime.now(UTC),
            "exp": datetime.now(UTC) + timedelta(hours=1),
            "aal": "aal2",
        },
        key,
        algorithm="ES256",
        headers={"kid": "test-key"},
    )
    client.headers["Authorization"] = "Bearer " + token
    return client
