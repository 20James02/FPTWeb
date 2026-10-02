from datetime import UTC, datetime, timedelta
from uuid import uuid4

import psycopg
import pytest

ZERO = "00000000-0000-0000-0000-000000000000"


async def resource(admin, kind, payload):
    response = await admin.post("/api/v1/admin/" + kind, json=payload)
    assert response.status_code == 201, response.text
    row = response.json()
    response = await admin.post(
        f"/api/v1/admin/{kind}/{row['id']}/publish", json={"expected_version": row["version"]}
    )
    assert response.status_code == 200, response.text
    return response.json()


async def setup(admin):
    province = await resource(
        admin, "regions", {"name": "QA Province", "code": "qa-p", "branch_id": ZERO}
    )
    ward = await resource(
        admin,
        "regions",
        {
            "name": "QA Ward",
            "code": "qa-w",
            "branch_id": ZERO,
            "level": "ward",
            "parent_id": province["id"],
        },
    )
    plan = await resource(
        admin,
        "plans",
        {
            "name": "QA Package",
            "code": "qa-package",
            "service": "internet",
            "applicable_region_ids": [province["id"]],
        },
    )
    return province, ward, plan


def price(plan, scope, amount):
    return {
        "plan_id": plan["id"],
        "scope_id": scope["id"],
        "scope_kind": "region",
        "billing_months": 6,
        "monthly_vnd": amount,
        "source": "Synthetic QA only",
        "start": (datetime.now(UTC) - timedelta(days=1)).isoformat(),
    }


@pytest.mark.asyncio
async def test_hierarchical_quotes_and_lead_snapshot(admin, gateway):
    province, ward, plan = await setup(admin)
    row = price(plan, province, 210000)
    response = await admin.post("/api/v1/admin/prices/bulk", json={"rows": [row], "publish": True})
    assert response.status_code == 201, response.text

    async def quote():
        response = await admin.post(
            "/api/v1/quotes", json={"plan_id": plan["id"], "region_id": ward["id"]}
        )
        assert response.status_code == 200, response.text
        return response.json()

    assert (await quote())["monthly_vnd"] == 210000
    response = await admin.post(
        "/api/v1/admin/prices/bulk", json={"rows": [price(plan, ward, 230000)], "publish": True}
    )
    assert response.status_code == 201, response.text
    q = await quote()
    assert q["monthly_vnd"] == 230000 and q["region_id"] == ward["id"]
    lead = await admin.post(
        "/api/v1/leads",
        json={
            "phone": "0901234567",
            "plan_id": plan["id"],
            "region_id": ward["id"],
            "service_ids": ["internet"],
            "consent_version": "v1",
            "quote_token": q["quote_token"],
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert lead.status_code == 201, lead.text
    with psycopg.connect(gateway.dsn) as db:
        snapshot = db.execute("SELECT quote FROM private.leads").fetchone()[0]
    assert snapshot["monthly_vnd"] == 230000 and snapshot["region_id"] == ward["id"]
    tree = (await admin.get("/api/v1/regions/hierarchy")).json()
    assert all(p["code"] != ward["id"] for z in tree.values() for p in z["provinces"])
    wards = (await admin.get(f"/api/v1/regions/{province['id']}/wards")).json()["items"]
    assert [w["id"] for w in wards] == [ward["id"]]


@pytest.mark.asyncio
async def test_unavailable_plan_and_invalid_parent(admin):
    province, ward, plan = await setup(admin)
    other = await resource(
        admin, "regions", {"name": "QA Other", "code": "qa-other", "branch_id": ZERO}
    )
    q = await admin.post("/api/v1/quotes", json={"plan_id": plan["id"], "region_id": other["id"]})
    assert q.status_code == 200 and q.json()["status"] == "not_available"
    for parent, branch in [
        (ward["id"], ZERO),
        (province["id"], str(uuid4())),
        (str(uuid4()), ZERO),
    ]:
        response = await admin.post(
            "/api/v1/admin/regions",
            json={
                "name": "Bad",
                "code": "bad",
                "branch_id": branch,
                "level": "ward",
                "parent_id": parent,
            },
        )
        assert response.status_code == 422, response.text
    response = await admin.post(
        f"/api/v1/admin/regions/{province['id']}/retire",
        json={"expected_version": province["version"]},
    )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_bulk_rollback_and_replace_version(admin, gateway):
    province, ward, plan = await setup(admin)
    rows = [price(plan, province, 200000), price(plan, ward, 220000)]
    response = await admin.post("/api/v1/admin/prices/bulk", json={"rows": rows, "publish": True})
    assert response.status_code == 201, response.text
    old = response.json()["items"][0]
    conflict = await admin.post(
        "/api/v1/admin/prices/bulk",
        json={
            "rows": [price(plan, {"id": str(uuid4())}, 1), price(plan, ward, 2)],
            "publish": True,
        },
    )
    assert conflict.status_code in (409, 422)
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT count(*) FROM private.prices").fetchone()[0] == 2
    replacement = {**rows[0], "monthly_vnd": 240000, "start": datetime.now(UTC).isoformat()}
    response = await admin.post(
        f"/api/v1/admin/prices/{old['id']}/replace?expected_version={old['version']}",
        json=replacement,
    )
    assert response.status_code == 201, response.text
    new = response.json()
    assert new["status"] == "published" and new["id"] != old["id"]
    response = await admin.post(
        f"/api/v1/admin/prices/{old['id']}/replace?expected_version={old['version']}",
        json=replacement,
    )
    assert response.status_code == 409
    with psycopg.connect(gateway.dsn) as db:
        history = db.execute(
            "SELECT upper(effective) FROM private.prices WHERE id=%s", [old["id"]]
        ).fetchone()[0]
    assert history == datetime.fromisoformat(replacement["start"])
    quote = (
        await admin.post(
            "/api/v1/quotes", json={"plan_id": plan["id"], "region_id": province["id"]}
        )
    ).json()
    assert quote["monthly_vnd"] == 240000


@pytest.mark.asyncio
async def test_locations_pagination_and_draft_visibility(admin):
    province, ward, _ = await setup(admin)
    await admin.post(
        "/api/v1/admin/regions",
        json={
            "name": "Draft Ward",
            "code": "draft-w",
            "branch_id": ZERO,
            "level": "ward",
            "parent_id": province["id"],
        },
    )
    first = (
        await admin.get(
            "/api/v1/admin/locations",
            params={"level": "ward", "parent_id": province["id"], "limit": 1},
        )
    ).json()
    assert len(first["items"]) == 1 and first["next_cursor"]
    second = (
        await admin.get(
            "/api/v1/admin/locations",
            params={
                "level": "ward",
                "parent_id": province["id"],
                "limit": 1,
                "before": first["next_cursor"],
            },
        )
    ).json()
    assert len(second["items"]) == 1 and second["items"][0]["id"] != first["items"][0]["id"]
    public = (await admin.get(f"/api/v1/regions/{province['id']}/wards")).json()
    assert [r["id"] for r in public["items"]] == [ward["id"]]


@pytest.mark.asyncio
async def test_location_controls_present_in_client_and_admin(admin):
    assert 'id="home-ward-select"' in (await admin.get("/")).text
    assert 'id="form-lead-ward"' in (await admin.get("/")).text
    assert 'id="lp-ward"' in (await admin.get("/khuyen-mai")).text
    text = (await admin.get("/admin/pricing")).text
    assert 'id="plan-dialog"' in text and 'id="price-location-picker"' in text
    assert "Scope ID (UUID)" not in text


@pytest.mark.asyncio
async def test_bulk_conflict_rolls_back_preceding_valid_row_and_revision(admin, gateway):
    province, ward, plan = await setup(admin)
    payload = price(plan, ward, 200000)
    assert (
        await admin.post("/api/v1/admin/prices/bulk", json={"rows": [payload], "publish": True})
    ).status_code == 201
    with psycopg.connect(gateway.dsn) as db:
        before = db.execute("SELECT version FROM private.catalog_revision").fetchone()[0]
        audits = db.execute("SELECT count(*) FROM private.audit").fetchone()[0]
    response = await admin.post(
        "/api/v1/admin/prices/bulk",
        json={"rows": [price(plan, province, 1), payload], "publish": True},
    )
    assert response.status_code == 409, response.text
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT count(*) FROM private.prices").fetchone()[0] == 1
        assert db.execute("SELECT version FROM private.catalog_revision").fetchone()[0] == before
        assert db.execute("SELECT count(*) FROM private.audit").fetchone()[0] == audits


@pytest.mark.asyncio
async def test_replacement_overlap_rolls_back_history_and_revision(admin, gateway):
    province, _, plan = await setup(admin)
    now = datetime.now(UTC)
    first = {**price(plan, province, 100), "end": (now + timedelta(hours=1)).isoformat()}
    second = {**first, "start": first["end"], "end": None}
    result = await admin.post("/api/v1/admin/prices/bulk", json={"rows": [first], "publish": True})
    old = result.json()["items"][0]
    assert (
        await admin.post("/api/v1/admin/prices/bulk", json={"rows": [second], "publish": True})
    ).status_code == 201
    response = await admin.post(
        f"/api/v1/admin/prices/{old['id']}/replace?expected_version={old['version']}",
        json={**first, "start": now.isoformat(), "end": None},
    )
    assert response.status_code == 409, response.text
    stored = (await admin.get("/api/v1/admin/prices/" + old["id"])).json()
    assert stored["version"] == old["version"] and datetime.fromisoformat(
        stored["end"]
    ) == datetime.fromisoformat(first["end"])


@pytest.mark.asyncio
async def test_scoped_permissions_bulk_and_location_listing(admin, gateway):
    province, ward, plan = await setup(admin)
    uid = (await admin.get("/api/v1/admin/me")).json()["id"]
    branch = str(uuid4())
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        db.execute(
            "UPDATE private.memberships SET branch_id=%s,permissions=ARRAY['catalog.write','pricing.write','pricing.publish'] WHERE user_id=%s",
            [branch, uid],
        )
    assert (await admin.get("/api/v1/admin/locations")).json()["items"] == []
    response = await admin.post(
        "/api/v1/admin/prices/bulk", json={"rows": [price(plan, ward, 1)], "publish": True}
    )
    assert response.status_code == 403
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT count(*) FROM private.prices").fetchone()[0] == 0


@pytest.mark.asyncio
async def test_public_catalog_returns_provinces_without_eager_wards(admin):
    province, ward, _ = await setup(admin)
    rows = (await admin.get("/api/v1/regions")).json()["items"]
    assert [r["id"] for r in rows] == [province["id"]]
    assert ward["id"] not in str(rows)


@pytest.mark.asyncio
async def test_price_list_resolves_scope_labels_in_one_read(admin):
    province, ward, plan = await setup(admin)
    response = await admin.post(
        "/api/v1/admin/prices/bulk", json={"rows": [price(plan, ward, 1)], "publish": True}
    )
    assert response.status_code == 201
    listed = (await admin.get("/api/v1/admin/prices")).json()["items"]
    assert listed[0]["scope_label"] == "QA Ward · QA Province"


@pytest.mark.asyncio
async def test_batch_publishing_requires_mfa_but_drafts_do_not(admin, monkeypatch):
    from unittest.mock import AsyncMock

    province, _, plan = await setup(admin)
    verifier = admin._transport.app.state.verifier
    claims = await verifier.verify(admin.headers["Authorization"][7:])
    claims["aal"] = "aal1"
    monkeypatch.setattr(verifier, "verify", AsyncMock(return_value=claims))
    rows = [price(plan, province, 1)]
    assert (
        await admin.post("/api/v1/admin/prices/bulk", json={"rows": rows, "publish": False})
    ).status_code == 201
    assert (
        await admin.post("/api/v1/admin/prices/bulk", json={"rows": rows, "publish": True})
    ).status_code == 403


@pytest.mark.asyncio
async def test_large_ward_catalog_is_complete_across_pages(admin, gateway):
    from psycopg.types.json import Jsonb

    province, existing, _ = await setup(admin)
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        for i in range(120):
            payload = {
                "name": f"QA Ward {i:03}",
                "code": f"qa-ward-{i}",
                "level": "ward",
                "parent_id": province["id"],
                "branch_id": ZERO,
            }
            db.execute(
                "INSERT INTO private.resources(kind,branch_id,status,payload,published_payload,published_version) VALUES('region',%s,'published',%s,%s,1)",
                [ZERO, Jsonb(payload), Jsonb(payload)],
            )
    first = (await admin.get(f"/api/v1/regions/{province['id']}/wards")).json()
    assert len(first["items"]) == 100 and first["next_cursor"]
    second = (
        await admin.get(
            f"/api/v1/regions/{province['id']}/wards", params={"before": first["next_cursor"]}
        )
    ).json()
    assert len(second["items"]) == 21 and second["next_cursor"] is None
    ids = [r["id"] for r in [*first["items"], *second["items"]]]
    assert len(set(ids)) == 121 and existing["id"] in ids and ids == sorted(ids, reverse=True)


@pytest.mark.asyncio
async def test_named_price_pages_preserve_cursor_order(admin, gateway):
    province, ward, plan = await setup(admin)
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        for i in range(33):
            db.execute(
                "INSERT INTO private.prices(plan_id,scope_id,scope_kind,billing_months,monthly_vnd,effective,source) VALUES(%s,%s,'region',6,%s,tstzrange(now(),NULL,'[)'),'QA synthetic')",
                [plan["id"], ward["id"] if i % 2 else province["id"], i],
            )
        expected = [
            str(r[0])
            for r in db.execute("SELECT id FROM private.prices ORDER BY id DESC").fetchall()
        ]
    received = []
    while True:
        params = {"limit": 7}
        if received:
            params["before"] = received[-1]
        rows = (await admin.get("/api/v1/admin/prices", params=params)).json()["items"]
        received.extend(r["id"] for r in rows)
        if len(rows) < 7:
            break
    assert received == expected
