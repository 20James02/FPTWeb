from datetime import UTC, datetime, timedelta
from uuid import uuid4

import psycopg
import pytest

from tests.integration.test_regional_pricing import setup


def matrix_rows(plan, region):
    start = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    return [
        {
            "price": dict(
                plan_id=plan["id"],
                scope_id=region["id"],
                scope_kind="region",
                billing_months=months,
                monthly_vnd=monthly,
                display_monthly_vnd=display,
                setup_vnd=setup_fee,
                equipment_vnd=device_fee,
                equipment=[equipment],
                gift_months=gifts,
                start=start,
                source="QA direct period prices",
            )
        }
        for months, monthly, display, setup_fee, device_fee, gifts, equipment in [
            (1, 220000, 220000, 300000, 400000, 0, "Modem 1"),
            (6, 210000, 180000, 100000, 200000, 1, "Modem 6"),
            (12, 200000, 170000, 0, 100000, 2, "Modem 12"),
        ]
    ]


async def test_matrix_saves_three_periods_and_quote_snapshot(admin, gateway):
    region, _, plan = await setup(admin)
    response = await admin.post(
        "/api/v1/admin/prices/matrix",
        json={
            "rows": matrix_rows(plan, region),
            "publish": True,
        },
    )
    assert response.status_code == 200, response.text
    saved = response.json()["items"]
    assert len(saved) == 3
    assert all(p["status"] == "published" and float(p["monthly_coefficient"]) == 1 for p in saved)
    for months, display, total, equipment in [
        (1, 220000, 920000, ["Modem 1"]),
        (6, 180000, 1560000, ["Modem 6"]),
        (12, 170000, 2500000, ["Modem 12"]),
    ]:
        q = (
            await admin.post(
                "/api/v1/quotes",
                json={
                    "plan_id": plan["id"],
                    "region_id": region["id"],
                    "billing_months": months,
                },
            )
        ).json()
        assert q["display_monthly_vnd"] == display
        assert q["initial_total_vnd"] == total
        assert q["equipment"] == equipment
        assert {o["billing_months"] for o in q["billing_options"]} == {1, 6, 12}
    lead = await admin.post(
        "/api/v1/leads",
        headers={"Idempotency-Key": str(uuid4())},
        json={
            "phone": "0901234567",
            "plan_id": plan["id"],
            "region_id": region["id"],
            "service_ids": ["internet"],
            "consent_version": "v1",
            "quote_token": q["quote_token"],
        },
    )
    assert lead.status_code == 201, lead.text
    with psycopg.connect(gateway.dsn) as db:
        snapshot = db.execute("SELECT quote FROM private.leads").fetchone()[0]
    assert snapshot["display_monthly_vnd"] == 170000
    assert snapshot["equipment"] == ["Modem 12"]


async def test_matrix_updates_drafts_then_replaces_published_atomically(admin, gateway):
    region, _, plan = await setup(admin)
    rows = matrix_rows(plan, region)
    response = await admin.post("/api/v1/admin/prices/matrix", json={"rows": rows})
    assert response.status_code == 200, response.text
    saved = response.json()["items"]
    for row, old in zip(rows, saved, strict=True):
        row.update(id=old["id"], expected_version=old["version"])
        row["price"]["monthly_vnd"] += 1000
    updated = await admin.post("/api/v1/admin/prices/matrix", json={"rows": rows, "publish": True})
    assert updated.status_code == 200, updated.text
    published = updated.json()["items"]
    replacement_start = datetime.now(UTC).isoformat()
    for row, old in zip(rows, published, strict=True):
        row.update(id=old["id"], expected_version=old["version"])
        row["price"].update(start=replacement_start, display_monthly_vnd=123456, equipment=[])
    replaced = await admin.post("/api/v1/admin/prices/matrix", json={"rows": rows, "publish": True})
    assert replaced.status_code == 200, replaced.text
    assert {p["id"] for p in replaced.json()["items"]}.isdisjoint(p["id"] for p in published)
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT count(*) FROM private.prices").fetchone()[0] == 6
        assert (
            db.execute(
                "SELECT count(*) FROM private.prices WHERE upper(effective)=%s", [replacement_start]
            ).fetchone()[0]
            == 3
        )
    q = (
        await admin.post("/api/v1/quotes", json={"plan_id": plan["id"], "region_id": region["id"]})
    ).json()
    assert q["equipment"] == []
    assert q["display_monthly_vnd"] == 123456


async def test_matrix_rolls_back_all_changes_on_stale_version(admin, gateway):
    region, _, plan = await setup(admin)
    rows = matrix_rows(plan, region)
    response = await admin.post("/api/v1/admin/prices/matrix", json={"rows": rows})
    assert response.status_code == 200, response.text
    saved = response.json()["items"]
    for row, old in zip(rows, saved, strict=True):
        row.update(id=old["id"], expected_version=old["version"])
        row["price"]["monthly_vnd"] = 999
    rows[-1]["expected_version"] += 1
    response = await admin.post("/api/v1/admin/prices/matrix", json={"rows": rows})
    assert response.status_code == 409, response.text
    with psycopg.connect(gateway.dsn) as db:
        assert (
            db.execute("SELECT count(*) FROM private.prices WHERE monthly_vnd=999").fetchone()[0]
            == 0
        )
        assert db.execute("SELECT count(*) FROM private.prices WHERE version<>1").fetchone()[0] == 0


async def test_matrix_create_conflict_rolls_back_earlier_rows(admin, gateway):
    region, _, plan = await setup(admin)
    rows = matrix_rows(plan, region)
    first = await admin.post(
        "/api/v1/admin/prices/matrix", json={"rows": [rows[-1]], "publish": True}
    )
    assert first.status_code == 200, first.text
    response = await admin.post("/api/v1/admin/prices/matrix", json={"rows": rows, "publish": True})
    assert response.status_code == 409, response.text
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT count(*) FROM private.prices").fetchone()[0] == 1


@pytest.mark.parametrize(
    "mutation", ["duplicate", "coefficient", "missing_version", "negative", "long_equipment"]
)
async def test_matrix_rejects_invalid_input(admin, mutation):
    region, _, plan = await setup(admin)
    rows = matrix_rows(plan, region)
    if mutation == "duplicate":
        rows.append(rows[0])
    elif mutation == "coefficient":
        rows[0]["price"]["monthly_coefficient"] = "0.95"
    elif mutation == "missing_version":
        rows[0]["id"] = str(uuid4())
    elif mutation == "negative":
        rows[0]["price"]["display_monthly_vnd"] = -1
    else:
        rows[0]["price"]["equipment"] = ["x" * 201]
    response = await admin.post("/api/v1/admin/prices/matrix", json={"rows": rows})
    assert response.status_code == 422, response.text


async def test_matrix_mfa_and_branch_scope_are_enforced(admin, gateway, monkeypatch):
    from unittest.mock import AsyncMock

    region, _, plan = await setup(admin)
    rows = matrix_rows(plan, region)
    verifier = admin._transport.app.state.verifier
    claims = await verifier.verify(admin.headers["Authorization"][7:])
    claims["aal"] = "aal1"
    monkeypatch.setattr(verifier, "verify", AsyncMock(return_value=claims))
    assert (
        await admin.post("/api/v1/admin/prices/matrix", json={"rows": rows, "publish": True})
    ).status_code == 403
    assert (await admin.post("/api/v1/admin/prices/matrix", json={"rows": rows})).status_code == 200
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        db.execute(
            "UPDATE private.memberships SET branch_id=%s, permissions=ARRAY['pricing.write']",
            [str(uuid4())],
        )
    assert (await admin.post("/api/v1/admin/prices/matrix", json={"rows": rows})).status_code == 403


async def test_matrix_read_handles_legacy_coefficients_and_restricts_access(admin, gateway):
    region, _, plan = await setup(admin)
    rows = matrix_rows(plan, region)
    legacy = {
        **rows[1]["price"],
        "monthly_coefficient": "0.95",
        "equipment": None,
        "display_monthly_vnd": None,
    }
    response = await admin.post("/api/v1/admin/prices", json=legacy)
    assert response.status_code == 201, response.text
    saved = response.json()
    fetched = await admin.get("/api/v1/admin/prices/matrix", params={"id": saved["id"]})
    assert fetched.status_code == 200, fetched.text
    assert fetched.json()["items"][0]["monthly_coefficient"] == 0.95
    assert fetched.json()["items"][0]["monthly_vnd"] == 210000
    rows[1].update(id=saved["id"], expected_version=saved["version"])
    rows[1]["price"]["monthly_vnd"] = 199500
    updated = await admin.post("/api/v1/admin/prices/matrix", json={"rows": [rows[1]]})
    assert updated.status_code == 200, updated.text
    assert updated.json()["items"][0]["monthly_coefficient"] == 1
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        for role in ["anon", "authenticated"]:
            assert not db.execute(
                "SELECT has_function_privilege(%s,'api.dispatch(jsonb)','EXECUTE')", [role]
            ).fetchone()[0]
            assert not db.execute(
                "SELECT has_function_privilege(%s,'private.price_matrix_write(jsonb)','EXECUTE')",
                [role],
            ).fetchone()[0]
        db.execute(
            "UPDATE private.memberships SET branch_id=%s, permissions=ARRAY['pricing.write']",
            [str(uuid4())],
        )
    assert (
        await admin.get("/api/v1/admin/prices/matrix", params={"id": saved["id"]})
    ).status_code == 403


async def test_matrix_replacement_rollback_preserves_entire_price_history(admin, gateway):
    region, _, plan = await setup(admin)
    rows = matrix_rows(plan, region)
    first = await admin.post("/api/v1/admin/prices/matrix", json={"rows": rows, "publish": True})
    assert first.status_code == 200, first.text
    for row, old in zip(rows, first.json()["items"], strict=True):
        row.update(id=old["id"], expected_version=old["version"])
        row["price"].update(start=datetime.now(UTC).isoformat(), monthly_vnd=99)
    rows[-1]["expected_version"] += 1
    response = await admin.post("/api/v1/admin/prices/matrix", json={"rows": rows, "publish": True})
    assert response.status_code == 409, response.text
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT count(*) FROM private.prices").fetchone()[0] == 3
        assert (
            db.execute(
                "SELECT count(*) FROM private.prices WHERE upper(effective) IS NOT NULL"
            ).fetchone()[0]
            == 0
        )


async def test_matrix_existing_price_identity_cannot_be_changed(admin):
    region, _, plan = await setup(admin)
    rows = matrix_rows(plan, region)
    first = await admin.post("/api/v1/admin/prices/matrix", json={"rows": [rows[0]]})
    assert first.status_code == 200, first.text
    old = first.json()["items"][0]
    rows[0].update(id=old["id"], expected_version=old["version"])
    rows[0]["price"]["billing_months"] = 12
    response = await admin.post("/api/v1/admin/prices/matrix", json={"rows": [rows[0]]})
    assert response.status_code == 409, response.text
