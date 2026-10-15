"""Disposable PostgreSQL-backed browser fixture. Never run with customer data."""

from contextlib import asynccontextmanager
from uuid import uuid4

import psycopg
from psycopg.types.json import Jsonb

from pagefpt.application import create_app
from pagefpt.core.config import Settings
from tests.conftest import LocalGateway, db_schema

_generator = db_schema.__wrapped__()
_dsn = next(_generator)
with psycopg.connect(_dsn, autocommit=True) as connection:
    connection.execute("SELECT private.measurement_bootstrap('test')")
    fixture_branch = str(uuid4())
    region_payload = {
        "name": "Khu vực kiểm thử",
        "code": "synthetic",
        "zone_id": "mien_nam",
        "branch_id": fixture_branch,
    }
    connection.execute(
        "INSERT INTO private.resources(kind,branch_id,status,payload,published_payload,published_version) VALUES('region',%s,'published',%s,%s,1)",
        [fixture_branch, Jsonb(region_payload), Jsonb(region_payload)],
    )
app = create_app(
    Settings(
        environment="test",
        _env_file=None,
        encryption_key="e" * 32,
        matching_key="m" * 32,
        token_key="t" * 32,
        job_secret="j" * 32,
        integrations_enabled=False,
        notification_url="",
        conversion_url="",
    ),
    LocalGateway(_dsn),
)
_original = app.router.lifespan_context


@asynccontextmanager
async def lifespan(instance):
    try:
        async with _original(instance):
            yield
    finally:
        _generator.close()


app.router.lifespan_context = lifespan
