from uuid import uuid4

import psycopg
import pytest


def connection(**changes):
    return {
        "name": "GA website",
        "provider": "ga4",
        "environment": "test",
        "settings": {"measurement_id": "G-TEST123"},
        **changes,
    }


async def test_measurement_registry_requires_authentication(client):
    assert (await client.get("/api/v1/admin/measurement/connections")).status_code == 401


async def test_registry_roundtrip_version_and_no_secrets(admin, gateway):
    created = await admin.post("/api/v1/admin/measurement/connections", json=connection())
    assert created.status_code == 201, created.text
    row = created.json()
    assert row["version"] == 1 and not row["secret_configured"]
    secret = "synthetic-token-never-return-" + str(uuid4())
    response = await admin.post(
        f"/api/v1/admin/measurement/connections/{row['id']}/credentials",
        json={"expected_version": 1, "values": {"api_secret": secret}},
    )
    assert response.status_code == 200, response.text
    assert response.json()["version"] == 2
    listed = await admin.get("/api/v1/admin/measurement/connections")
    assert secret not in listed.text and "ciphertext" not in listed.text
    assert listed.json()["items"][0]["secret_configured"] is True
    with psycopg.connect(gateway.dsn) as db:
        cipher = db.execute("SELECT ciphertext FROM private.measurement_secrets").fetchone()[0]
        assert secret not in cipher
    conflict = await admin.put(
        f"/api/v1/admin/measurement/connections/{row['id']}",
        json={**connection(), "expected_version": 1},
    )
    assert conflict.status_code == 409


@pytest.mark.parametrize(
    "payload",
    [
        connection(settings={"measurement_id": "G-TEST123", "access_token": "bad"}),
        connection(settings={"measurement_id": "https://evil.test"}),
        connection(provider="other"),
        connection(name=" "),
        connection(settings={"measurement_id": "G-TEST123", "endpoint": "http://127.0.0.1"}),
    ],
)
async def test_registry_rejects_unsupported_settings(admin, payload):
    assert (
        await admin.post("/api/v1/admin/measurement/connections", json=payload)
    ).status_code == 422


async def test_registry_scope_enforced_in_sql_and_http(admin, gateway):
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        uid = db.execute("SELECT user_id FROM private.memberships").fetchone()[0]
        db.execute(
            "UPDATE private.memberships SET permissions=ARRAY['measurement.configure'], branch_id=%s",
            [uuid4()],
        )
    response = await admin.post("/api/v1/admin/measurement/connections", json=connection())
    assert response.status_code == 403
    from pagefpt.core.errors import DomainError

    with pytest.raises(DomainError) as error:
        await gateway.rpc(
            "dispatch", {"command": {"op": "measurement_connection_list", "actor": str(uid)}}
        )
    assert error.value.status == 403


async def test_registry_browser_roles_cannot_execute_or_read(gateway):
    with psycopg.connect(gateway.dsn) as db:
        for role in ("anon", "authenticated"):
            assert not db.execute(
                "SELECT has_table_privilege(%s,'private.measurement_secrets','SELECT')", [role]
            ).fetchone()[0]
            assert not db.execute(
                "SELECT has_function_privilege(%s,'private.measurement_dispatch(jsonb)','EXECUTE')",
                [role],
            ).fetchone()[0]
