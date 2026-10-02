import psycopg

ZERO = "00000000-0000-0000-0000-000000000000"


async def test_api_sync_and_idempotence_preserves_manual_changes(admin, gateway):
    preview = await admin.get("/api/v1/admin/locations/source")
    assert preview.status_code == 200
    assert len(preview.json()["provinces"]) == 34
    payload = {"branch_id": ZERO, "province_codes": [1], "source": "bundled"}
    first = await admin.post("/api/v1/admin/locations/sync", json=payload)
    assert first.status_code == 200, first.text
    assert first.json()["created"] == 127
    provinces = (await admin.get("/api/v1/admin/locations")).json()["items"]
    province = provinces[0]
    wards = (await admin.get(f"/api/v1/regions/{province['id']}/wards")).json()
    assert len(wards["items"]) == 100 and wards["next_cursor"]
    again = await admin.post("/api/v1/admin/locations/sync", json=payload)
    assert again.json()["created"] == 0 and again.json()["updated"] == 0
    assert again.json()["revision"] == first.json()["revision"]
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        db.execute(
            "UPDATE private.resources SET payload=jsonb_set(payload,'{name}','\"Tên tùy chỉnh\"'),version=version+1 WHERE id=%s",
            [province["id"]],
        )
    assert (await admin.post("/api/v1/admin/locations/sync", json=payload)).json()["skipped"] >= 1
    assert (await admin.get("/api/v1/admin/locations")).json()["items"][0]["payload"][
        "name"
    ] == "Tên tùy chỉnh"
    wrong = await admin.post(
        "/api/v1/admin/locations/sync",
        json={**payload, "branch_id": "00000000-0000-0000-0000-000000000001"},
    )
    assert wrong.status_code == 409
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT count(*) FROM private.resources").fetchone()[0] == 127


async def test_sync_requires_auth_and_known_codes(client, admin, gateway):
    saved = client.headers.pop("Authorization")
    denied = await client.post("/api/v1/admin/locations/sync", json={"branch_id": ZERO})
    assert denied.status_code == 401
    client.headers["Authorization"] = saved
    bad = await admin.post(
        "/api/v1/admin/locations/sync",
        json={"branch_id": ZERO, "province_codes": [99999], "source": "bundled"},
    )
    assert bad.status_code == 422


async def test_full_snapshot_bulk_import(admin, gateway):
    import time

    started = time.monotonic()
    response = await admin.post(
        "/api/v1/admin/locations/sync", json={"branch_id": ZERO, "source": "bundled"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["created"] == 3355
    print("Full 3355-location import seconds:", round(time.monotonic() - started, 3))
    tree = (await admin.get("/api/v1/regions/hierarchy")).json()
    assert sum(len(z["provinces"]) for z in tree.values()) == 34
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT count(*) FROM private.prices").fetchone()[0] == 0
        assert (
            db.execute(
                "SELECT count(*) FROM private.audit WHERE action='geography.synced'"
            ).fetchone()[0]
            == 1
        )


async def test_sync_enforces_mfa_and_branch_scope(admin, gateway):
    import jwt

    token = admin.headers["Authorization"][7:]
    actor = jwt.decode(token, options={"verify_signature": False})["sub"]
    verifier = admin._transport.app.state.verifier
    original = verifier.verify

    async def low_mfa(value):
        return {**await original(value), "aal": "aal1"}

    verifier.verify = low_mfa
    payload = {"branch_id": ZERO, "source": "bundled", "province_codes": [1]}
    assert (await admin.post("/api/v1/admin/locations/sync", json=payload)).status_code == 403
    verifier.verify = original
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        db.execute(
            "UPDATE private.memberships SET branch_id='00000000-0000-0000-0000-000000000005',permissions=ARRAY['catalog.write'] WHERE user_id=%s",
            [actor],
        )
    assert (await admin.post("/api/v1/admin/locations/sync", json=payload)).status_code == 403
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT count(*) FROM private.resources").fetchone()[0] == 0


async def test_snapshot_conflict_rolls_back_already_processed_provinces(admin, gateway):
    from pagefpt.modules.catalog.geography import location_id

    # Source sorted Hanoi first; existing HCM conflict occurs after Hanoi inserts.
    payload = {"branch_id": ZERO, "source": "bundled", "province_codes": [79]}
    assert (await admin.post("/api/v1/admin/locations/sync", json=payload)).status_code == 200
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        db.execute(
            "UPDATE private.resources SET branch_id='00000000-0000-0000-0000-000000000005' WHERE id=%s",
            [location_id("province", 79)],
        )
        before = db.execute("SELECT count(*) FROM private.resources").fetchone()[0]
        revision = db.execute("SELECT version FROM private.catalog_revision").fetchone()[0]
    response = await admin.post(
        "/api/v1/admin/locations/sync", json={**payload, "province_codes": [1, 79]}
    )
    assert response.status_code == 409
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT count(*) FROM private.resources").fetchone()[0] == before
        assert db.execute("SELECT version FROM private.catalog_revision").fetchone()[0] == revision


async def test_sync_preserves_retired_and_published_customization(admin, gateway):
    payload = {"branch_id": ZERO, "source": "bundled", "province_codes": [1]}
    first = (await admin.post("/api/v1/admin/locations/sync", json=payload)).json()
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        ward = db.execute(
            "SELECT id FROM private.resources WHERE payload->>'level'='ward' LIMIT 1"
        ).fetchone()[0]
        db.execute("UPDATE private.resources SET status='retired' WHERE id=%s", [ward])
        province = db.execute(
            "SELECT id FROM private.resources WHERE payload->>'level'='province'"
        ).fetchone()[0]
        db.execute(
            "UPDATE private.resources SET payload=jsonb_set(payload,'{zone_id}','\"mien_bac\"'),published_payload=jsonb_set(payload,'{zone_id}','\"mien_bac\"') WHERE id=%s",
            [province],
        )
    again = (await admin.post("/api/v1/admin/locations/sync", json=payload)).json()
    assert again["created"] == again["updated"] == 0 and again["skipped"] == 2
    assert again["revision"] == first["revision"]
    with psycopg.connect(gateway.dsn) as db:
        assert (
            db.execute("SELECT status FROM private.resources WHERE id=%s", [ward]).fetchone()[0]
            == "retired"
        )
        assert (
            db.execute(
                "SELECT payload->>'zone_id' FROM private.resources WHERE id=%s", [province]
            ).fetchone()[0]
            == "mien_bac"
        )


async def test_imported_ward_links_quote_and_lead_preserve_price_on_resync(admin, gateway):
    from datetime import UTC, datetime, timedelta
    from uuid import uuid4

    from pagefpt.modules.catalog.geography import location_id

    payload = {"branch_id": ZERO, "source": "bundled", "province_codes": [1]}
    assert (await admin.post("/api/v1/admin/locations/sync", json=payload)).status_code == 200
    plan = (
        await admin.post(
            "/api/v1/admin/plans",
            json={"name": "QA geography", "code": "qa-geography", "service": "internet"},
        )
    ).json()
    assert (
        await admin.post(
            f"/api/v1/admin/plans/{plan['id']}/publish", json={"expected_version": plan["version"]}
        )
    ).status_code == 200
    ward = location_id("ward", 4)
    price = {
        "plan_id": plan["id"],
        "scope_kind": "region",
        "scope_id": ward,
        "billing_months": 6,
        "monthly_vnd": 123456,
        "source": "Synthetic test only",
        "start": (datetime.now(UTC) - timedelta(days=1)).isoformat(),
    }
    assert (
        await admin.post("/api/v1/admin/prices/bulk", json={"rows": [price], "publish": True})
    ).status_code == 201
    assert (await admin.post("/api/v1/admin/locations/sync", json=payload)).json()["updated"] == 0
    quote = (
        await admin.post("/api/v1/quotes", json={"plan_id": plan["id"], "region_id": ward})
    ).json()
    assert quote["monthly_vnd"] == 123456 and quote["region_id"] == ward
    lead = await admin.post(
        "/api/v1/leads",
        json={
            "phone": "0901234567",
            "consent_version": "v1",
            "plan_id": plan["id"],
            "region_id": ward,
            "service_ids": ["internet"],
            "quote_token": quote["quote_token"],
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert lead.status_code == 201, lead.text
    with psycopg.connect(gateway.dsn) as db:
        stored = db.execute("SELECT quote FROM private.leads").fetchone()[0]
        assert stored["region_id"] == ward and stored["monthly_vnd"] == 123456


async def test_geography_provenance_private_permissions(gateway):
    import pytest

    for role in ["anon", "authenticated"]:
        for table in ["geography_mappings", "geography_syncs"]:
            with psycopg.connect(gateway.dsn) as db:
                db.execute("SET LOCAL ROLE " + role)
                with pytest.raises(psycopg.errors.InsufficientPrivilege):
                    db.execute("SELECT * FROM private." + table)
