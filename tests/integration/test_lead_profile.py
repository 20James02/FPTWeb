import json
from uuid import uuid4

import psycopg

from tests.integration.test_accessories import product, setup
from tests.integration.test_worker_crm import lead


async def seed_profile(admin, gateway):
    plan, region = await setup(admin, gateway)
    device = await product(admin, plan, "monthly", 30000)
    lid = await lead(admin, gateway)
    actor = (await admin.get("/api/v1/admin/me")).json()["id"]
    with psycopg.connect(gateway.dsn) as db:
        db.execute("UPDATE private.leads SET assignee_id=%s WHERE id=%s", [actor, lid])
        db.execute(
            "UPDATE private.memberships SET permissions=ARRAY['lead.read','lead.write','lead.pii'] WHERE user_id=%s",
            [actor],
        )
    return lid, plan, device


async def test_assigned_staff_confirms_address_edits_encrypted_profile_and_keeps_phone(
    admin, gateway
):
    lid, plan, device = await seed_profile(admin, gateway)
    read = await admin.get(f"/api/v1/admin/leads/{lid}/profile")
    assert read.status_code == 200, read.text
    before = read.json()
    locations = await admin.get("/api/v1/admin/address-options")
    assert locations.status_code == 200
    province = locations.json()["items"][0]
    wards = await admin.get(
        "/api/v1/admin/address-options", params={"province_code": province["code"]}
    )
    ward = wards.json()["items"][0]
    patch = {
        "expected_version": before["lead"]["version"],
        "name": "QA edited customer",
        "installation_address": "QA house 1",
        "province_code": province["code"],
        "ward_code": ward["code"],
        "plan_id": plan["id"],
        "accessory_ids": [device["id"]],
    }
    saved = await admin.put(f"/api/v1/admin/leads/{lid}/profile", json=patch)
    assert saved.status_code == 200, saved.text
    after = (await admin.get(f"/api/v1/admin/leads/{lid}/profile")).json()
    assert after["pii"]["phone"] == before["pii"]["phone"]
    assert after["pii"]["name"] == "QA edited customer"
    assert after["pii"]["installation_address"] == "QA house 1"
    assert after["lead"]["payload"]["address_confirmation"]["ward_name"] == ward["name"]
    assert after["lead"]["payload"]["accessory_snapshot"][0]["price_vnd"] == 30000
    assert after["lead"]["quote_status"] == "needs_confirmation"
    assert (await admin.put(f"/api/v1/admin/leads/{lid}/profile", json=patch)).status_code == 409
    assert (
        await admin.put(f"/api/v1/admin/leads/{lid}/profile", json={**patch, "phone": "0982222222"})
    ).status_code == 422
    with psycopg.connect(gateway.dsn) as db:
        history = db.execute(
            "SELECT before_pii_ciphertext FROM private.lead_profile_history WHERE lead_id=%s", [lid]
        ).fetchone()
        assert history and before["pii"]["phone"] not in history[0]
        assert "QA edited customer" not in json.dumps(
            db.execute("SELECT payload FROM private.audit").fetchall()
        )
        for role in ["anon", "authenticated"]:
            assert not db.execute(
                "SELECT has_table_privilege(%s,'private.lead_profile_history','SELECT')", [role]
            ).fetchone()[0]


async def test_profile_denies_unassigned_or_revoked_staff_and_wrong_ward_parent(admin, gateway):
    lid, plan, _ = await seed_profile(admin, gateway)
    provinces = (await admin.get("/api/v1/admin/address-options")).json()["items"]
    ward = (
        await admin.get(
            "/api/v1/admin/address-options", params={"province_code": provinces[1]["code"]}
        )
    ).json()["items"][0]
    body = {
        "expected_version": 1,
        "name": "QA",
        "installation_address": "QA",
        "plan_id": plan["id"],
        "province_code": provinces[0]["code"],
        "ward_code": ward["code"],
    }
    assert (await admin.put(f"/api/v1/admin/leads/{lid}/profile", json=body)).status_code == 422
    with psycopg.connect(gateway.dsn) as db:
        db.execute("UPDATE private.leads SET assignee_id=%s WHERE id=%s", [str(uuid4()), lid])
    assert (await admin.get(f"/api/v1/admin/leads/{lid}/profile")).status_code == 403
    assert (await admin.put(f"/api/v1/admin/leads/{lid}/profile", json=body)).status_code == 403
