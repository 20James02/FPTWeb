from datetime import UTC, datetime, timedelta
from uuid import uuid4

import psycopg
import pytest
from psycopg.types.json import Jsonb

from tests.integration.test_worker_crm import lead


async def seed(admin, gateway, status="installed"):
    lead_id = await lead(admin, gateway)
    actor = (await admin.get("/api/v1/admin/me")).json()["id"]
    plan = str(uuid4())
    with psycopg.connect(gateway.dsn) as db:
        db.execute(
            "INSERT INTO private.resources(id,kind,status,payload) VALUES(%s,'plan','published',%s)",
            [plan, Jsonb({"name": "Gói chốt kiểm thử"})],
        )
        db.execute(
            "UPDATE private.leads SET status=%s,assignee_id=%s WHERE id=%s",
            [status, actor, lead_id],
        )
    return lead_id, plan, actor


async def save_deal(admin, lead_id, plan, months=6):
    r = await admin.put(
        f"/api/v1/admin/leads/{lead_id}/billing",
        json={
            "expected_version": 0,
            "plan_id": plan,
            "billing_months": months,
            "notes": "Khách chọn gói đã tư vấn",
        },
    )
    assert r.status_code == 200, r.text
    return r.json()["deal"]


async def schedule(admin, lead_id, deal_version=1, day=None, amount=1200000):
    body = {
        "expected_version": deal_version,
        "payment_id": str(uuid4()),
        "due_date": day or "2026-10-31",
        "amount_vnd": amount,
        "notes": "Nhắc thu theo thỏa thuận",
    }
    r = await admin.post(f"/api/v1/admin/leads/{lead_id}/payments", json=body)
    assert r.status_code == 201, r.text
    return r.json(), body


@pytest.mark.parametrize("months", [1, 6, 12])
async def test_deal_keeps_original_enquiry_and_encrypted_notes(admin, gateway, months):
    lid, plan, _ = await seed(admin, gateway)
    with psycopg.connect(gateway.dsn) as db:
        before = db.execute(
            "SELECT payload,quote,status,version FROM private.leads WHERE id=%s", [lid]
        ).fetchone()
    saved = await save_deal(admin, lid, plan, months)
    assert saved["billing_months"] == months and saved["plan_name"] == "Gói chốt kiểm thử"
    read = await admin.get(f"/api/v1/admin/leads/{lid}/billing")
    assert read.json()["deal"]["notes"] == "Khách chọn gói đã tư vấn"
    assert "ciphertext" not in read.text
    with psycopg.connect(gateway.dsn) as db:
        assert (
            db.execute(
                "SELECT payload,quote,status,version FROM private.leads WHERE id=%s", [lid]
            ).fetchone()
            == before
        )
        assert (
            "Khách chọn gói"
            not in db.execute("SELECT notes_ciphertext FROM private.lead_deals").fetchone()[0]
        )
        assert "Khách chọn gói" not in str(
            db.execute("SELECT payload FROM private.audit").fetchall()
        )
    stale = await admin.put(
        f"/api/v1/admin/leads/{lid}/billing",
        json={"expected_version": 0, "plan_id": plan, "billing_months": 12, "notes": "stale"},
    )
    assert stale.status_code == 409 and stale.json()["code"] == "VERSION_CONFLICT"


@pytest.mark.parametrize(
    "patch", [{"billing_months": 3}, {"billing_months": True}, {"plan_id": str(uuid4())}]
)
async def test_deal_rejects_unknown_plan_or_unsupported_term(admin, gateway, patch):
    lid, plan, _ = await seed(admin, gateway)
    r = await admin.put(
        f"/api/v1/admin/leads/{lid}/billing",
        json={"expected_version": 0, "plan_id": plan, "billing_months": 6, **patch},
    )
    assert r.status_code == 422


async def test_payment_retry_cas_and_duplicate_date(admin, gateway):
    lid, plan, _ = await seed(admin, gateway)
    await save_deal(admin, lid, plan)
    p, body = await schedule(admin, lid)
    repeat = await admin.post(f"/api/v1/admin/leads/{lid}/payments", json=body)
    assert repeat.status_code == 201 and repeat.json()["id"] == p["id"]
    changed = await admin.post(
        f"/api/v1/admin/leads/{lid}/payments", json={**body, "amount_vnd": 1}
    )
    assert changed.status_code == 409 and changed.json()["code"] == "IDEMPOTENCY_CONFLICT"
    dup = await admin.post(
        f"/api/v1/admin/leads/{lid}/payments",
        json={**body, "expected_version": 2, "payment_id": str(uuid4())},
    )
    assert dup.status_code == 409 and dup.json()["code"] == "PAYMENT_DATE_EXISTS"
    edited = await admin.patch(
        "/api/v1/admin/payments/" + p["id"],
        json={
            "expected_version": 1,
            "due_date": "2026-11-01",
            "amount_vnd": 1250000,
            "notes": "Đổi ngày",
            "status": "pending",
        },
    )
    assert edited.status_code == 200 and edited.json()["version"] == 2
    stale = await admin.patch(
        "/api/v1/admin/payments/" + p["id"], json={"expected_version": 1, "status": "cancelled"}
    )
    assert stale.status_code == 409
    cancelled = await admin.patch(
        "/api/v1/admin/payments/" + p["id"], json={"expected_version": 2, "status": "cancelled"}
    )
    assert cancelled.status_code == 200
    invalid = await admin.post(
        "/api/v1/admin/payments/" + p["id"] + "/collect",
        json={"expected_version": 3, "create_next": True},
    )
    assert invalid.status_code == 409


@pytest.mark.parametrize(
    "months,day,next_day",
    [
        (1, "2027-01-31", "2027-02-28"),
        (6, "2026-08-31", "2027-02-28"),
        (12, "2028-02-29", "2029-02-28"),
    ],
)
async def test_collection_next_cycle_is_atomic_and_does_not_drift(
    admin, gateway, months, day, next_day
):
    lid, plan, _ = await seed(admin, gateway)
    await save_deal(admin, lid, plan, months)
    p, _ = await schedule(admin, lid, day=day)
    body = {"expected_version": 1, "create_next": True}
    r = await admin.post("/api/v1/admin/payments/" + p["id"] + "/collect", json=body)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["payment"]["status"] == "paid" and data["next_payment"]["due_date"] == next_day
    assert data["next_payment"]["amount_vnd"] == 1200000
    again = await admin.post("/api/v1/admin/payments/" + p["id"] + "/collect", json=body)
    assert (
        again.status_code == 200
        and again.json()["next_payment"]["id"] == data["next_payment"]["id"]
    )
    if months == 1:
        nxt = await admin.post(
            "/api/v1/admin/payments/" + data["next_payment"]["id"] + "/collect", json=body
        )
        assert nxt.json()["next_payment"]["due_date"] == "2027-03-31"
    with psycopg.connect(gateway.dsn) as db:
        assert (
            db.execute(
                "SELECT count(*) FROM private.payments WHERE due_date=%s", [next_day]
            ).fetchone()[0]
            == 1
        )


async def test_collection_collision_rolls_back_paid_state(admin, gateway):
    lid, plan, _ = await seed(admin, gateway)
    await save_deal(admin, lid, plan, 1)
    p, _ = await schedule(admin, lid, day="2026-10-10")
    await schedule(admin, lid, deal_version=2, day="2026-11-10")
    r = await admin.post(
        "/api/v1/admin/payments/" + p["id"] + "/collect",
        json={"expected_version": 1, "create_next": True},
    )
    assert r.status_code == 409 and r.json()["code"] == "PAYMENT_DATE_EXISTS"
    data = (await admin.get(f"/api/v1/admin/leads/{lid}/payments")).json()["items"]
    assert next(x for x in data if x["id"] == p["id"])["status"] == "pending"


async def test_due_inbox_dedup_read_reassignment_and_paid(admin, gateway):
    lid, plan, actor = await seed(admin, gateway)
    await save_deal(admin, lid, plan)
    today = (datetime.now(UTC) + timedelta(hours=7)).date().isoformat()
    p, _ = await schedule(admin, lid, day=today)
    # Existing recovery hook must create durable due notices even with no tab open.
    await gateway.rpc("dispatch", {"command": {"op": "schedule_tick"}})
    for _ in range(2):
        inbox = await admin.get("/api/v1/admin/notifications")
        assert inbox.status_code == 200, inbox.text
        assert inbox.json()["unread_count"] == 1 and len(inbox.json()["items"]) == 1
    n = inbox.json()["items"][0]
    assert n["lead_id"] == lid and n["amount_vnd"] == 1200000
    assert "notes" not in inbox.text and "phone" not in inbox.text
    assert (await admin.post("/api/v1/admin/notifications/" + n["id"] + "/read")).status_code == 200
    assert (await admin.get("/api/v1/admin/notifications")).json()["unread_count"] == 0
    replacement = str(uuid4())
    with psycopg.connect(gateway.dsn) as db:
        db.execute(
            "INSERT INTO private.memberships(user_id,branch_id,permissions) VALUES(%s,'00000000-0000-0000-0000-000000000000',ARRAY['lead.read','lead.write'])",
            [replacement],
        )
        db.execute("UPDATE private.leads SET assignee_id=%s WHERE id=%s", [replacement, lid])
    assert (await admin.get("/api/v1/admin/notifications")).json()["items"] == []
    new = await gateway.rpc(
        "dispatch", {"command": {"op": "payment_notifications", "actor": replacement, "limit": 30}}
    )
    assert len(new["items"]) == 1 and new["unread_count"] == 1
    await admin.post(
        "/api/v1/admin/payments/" + p["id"] + "/collect",
        json={"expected_version": 1, "create_next": False},
    )
    assert (
        await gateway.rpc(
            "dispatch",
            {"command": {"op": "payment_notifications", "actor": replacement, "limit": 30}},
        )
    )["items"] == []


async def test_payment_revision_resets_ack_and_future_is_not_due(admin, gateway):
    lid, plan, _ = await seed(admin, gateway)
    await save_deal(admin, lid, plan)
    today = (datetime.now(UTC) + timedelta(hours=7)).date()
    p, _ = await schedule(admin, lid, day=(today + timedelta(days=1)).isoformat())
    assert (await admin.get("/api/v1/admin/notifications")).json()["items"] == []
    r = await admin.patch(
        "/api/v1/admin/payments/" + p["id"],
        json={"expected_version": 1, "due_date": today.isoformat(), "status": "pending"},
    )
    assert r.status_code == 200
    notice = (await admin.get("/api/v1/admin/notifications")).json()["items"][0]
    await admin.post("/api/v1/admin/notifications/" + notice["id"] + "/read")
    await admin.patch(
        "/api/v1/admin/payments/" + p["id"],
        json={"expected_version": 2, "amount_vnd": 1000000, "status": "pending"},
    )
    assert (await admin.get("/api/v1/admin/notifications")).json()["unread_count"] == 1


async def test_billing_scope_note_redaction_and_private_grants(admin, gateway):
    lid, plan, actor = await seed(admin, gateway)
    await save_deal(admin, lid, plan)
    p, _ = await schedule(admin, lid)
    with psycopg.connect(gateway.dsn) as db:
        db.execute(
            "UPDATE private.memberships SET permissions=ARRAY['lead.read','lead.write'] WHERE user_id=%s",
            [actor],
        )
    read = await admin.get(f"/api/v1/admin/leads/{lid}/billing")
    assert read.status_code == 200 and read.json()["deal"]["notes"] is None
    assert read.json()["deal"]["notes_hidden"] is True and "ciphertext" not in read.text
    with psycopg.connect(gateway.dsn) as db:
        db.execute("UPDATE private.leads SET assignee_id=%s WHERE id=%s", [str(uuid4()), lid])
    assert (await admin.get(f"/api/v1/admin/leads/{lid}/billing")).status_code == 403
    assert (
        await admin.patch(
            "/api/v1/admin/payments/" + p["id"], json={"expected_version": 1, "status": "cancelled"}
        )
    ).status_code == 403
    with psycopg.connect(gateway.dsn) as db:
        assert (
            db.execute(
                "SELECT bool_and(relrowsecurity) FROM pg_class WHERE relnamespace='private'::regnamespace AND relname IN ('lead_deals','payments','payment_notices')"
            ).fetchone()[0]
            is True
        )
        for role in ["anon", "authenticated"]:
            assert not db.execute(
                "SELECT has_table_privilege(%s,'private.payments','SELECT')", [role]
            ).fetchone()[0]
        db.execute("DELETE FROM private.leads WHERE id=%s", [lid])
        assert db.execute("SELECT count(*) FROM private.payments").fetchone()[0] == 0
        assert db.execute("SELECT count(*) FROM private.lead_deals").fetchone()[0] == 0


@pytest.mark.parametrize("value", [0, -1, 1000000001, 1.5, True])
async def test_payment_amount_requires_positive_integer(admin, gateway, value):
    lid, plan, _ = await seed(admin, gateway)
    await save_deal(admin, lid, plan)
    r = await admin.post(
        f"/api/v1/admin/leads/{lid}/payments",
        json={
            "expected_version": 1,
            "payment_id": str(uuid4()),
            "due_date": "2026-10-10",
            "amount_vnd": value,
        },
    )
    assert r.status_code == 422


async def test_simultaneous_create_and_collect_are_single_effect(admin, gateway):
    import asyncio

    lid, plan, _ = await seed(admin, gateway)
    await save_deal(admin, lid, plan, 1)
    body = {
        "expected_version": 1,
        "payment_id": str(uuid4()),
        "due_date": "2027-01-31",
        "amount_vnd": 200000,
        "notes": "Same retry",
    }
    created = await asyncio.gather(
        *(admin.post(f"/api/v1/admin/leads/{lid}/payments", json=body) for _ in range(2))
    )
    assert [r.status_code for r in created] == [201, 201]
    pid = created[0].json()["id"]
    collected = await asyncio.gather(
        *(
            admin.post(
                f"/api/v1/admin/payments/{pid}/collect",
                json={"expected_version": 1, "create_next": True},
            )
            for _ in range(2)
        )
    )
    assert [r.status_code for r in collected] == [200, 200]
    assert collected[0].json()["next_payment"]["id"] == collected[1].json()["next_payment"]["id"]
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT count(*) FROM private.payments").fetchone()[0] == 2
        assert (
            db.execute(
                "SELECT count(*) FROM private.audit WHERE action='payment.collected'"
            ).fetchone()[0]
            == 1
        )


async def test_snapshot_history_and_payment_pagination(admin, gateway):
    lid, plan, _ = await seed(admin, gateway)
    await save_deal(admin, lid, plan, 6)
    first, _ = await schedule(admin, lid, day="2026-10-10")
    r = await admin.put(
        f"/api/v1/admin/leads/{lid}/billing",
        json={"expected_version": 2, "plan_id": plan, "billing_months": 12},
    )
    assert r.status_code == 200
    second, _ = await schedule(admin, lid, deal_version=3, day="2026-12-10")
    page = (await admin.get(f"/api/v1/admin/leads/{lid}/payments?limit=1")).json()
    assert len(page["items"]) == 1 and page["items"][0]["id"] == second["id"]
    older = (
        await admin.get(
            f"/api/v1/admin/leads/{lid}/payments",
            params={"limit": 1, "before": page["next_before"]},
        )
    ).json()
    assert older["items"][0]["id"] == first["id"] and older["items"][0]["billing_months"] == 6
    assert older["next_before"] is None
    assert (
        await admin.get(f"/api/v1/admin/leads/{lid}/payments?before={uuid4()}")
    ).status_code == 422


async def test_financial_writes_require_mfa_and_notes_hidden_at_aal1(admin, gateway):
    import json
    import time

    import jwt
    from cryptography.hazmat.primitives.asymmetric import ec

    lid, plan, actor = await seed(admin, gateway)
    await save_deal(admin, lid, plan)
    key = ec.generate_private_key(ec.SECP256R1())
    jwk = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(key.public_key()))
    jwk.update(kid="billing-aal1", alg="ES256")
    admin._transport.app.state.verifier.keys["billing-aal1"] = jwk
    admin.headers["Authorization"] = "Bearer " + jwt.encode(
        {
            "sub": actor,
            "iss": "https://test.supabase.co/auth/v1",
            "aud": "authenticated",
            "iat": int(time.time()),
            "exp": int(time.time()) + 3600,
            "aal": "aal1",
        },
        key,
        algorithm="ES256",
        headers={"kid": "billing-aal1"},
    )
    read = await admin.get(f"/api/v1/admin/leads/{lid}/billing")
    assert read.status_code == 200 and read.json()["deal"]["notes_hidden"] is True
    r = await admin.put(
        f"/api/v1/admin/leads/{lid}/billing",
        json={"expected_version": 1, "plan_id": plan, "billing_months": 12},
    )
    assert r.status_code == 403
    assert (
        await admin.post(
            f"/api/v1/admin/leads/{lid}/payments",
            json={
                "expected_version": 1,
                "payment_id": str(uuid4()),
                "due_date": "2026-10-10",
                "amount_vnd": 100000,
            },
        )
    ).status_code == 403


@pytest.mark.parametrize("status", ["invalid", "duplicate", "rejected"])
async def test_cancelled_lead_blocks_billing_and_stops_notices(admin, gateway, status):
    lid, plan, _ = await seed(admin, gateway)
    await save_deal(admin, lid, plan)
    p, _ = await schedule(admin, lid, day="2020-01-01")
    assert (await admin.get("/api/v1/admin/notifications")).json()["unread_count"] == 1
    with psycopg.connect(gateway.dsn) as db:
        db.execute("UPDATE private.leads SET status=%s WHERE id=%s", [status, lid])
    assert (await admin.get("/api/v1/admin/notifications")).json()["items"] == []
    assert (
        await admin.post(
            "/api/v1/admin/payments/" + p["id"] + "/collect",
            json={"expected_version": 1, "create_next": False},
        )
    ).json()["code"] == "BILLING_NOT_ALLOWED"


async def test_editing_amount_on_clamped_month_keeps_billing_anchor(admin, gateway):
    lid, plan, _ = await seed(admin, gateway)
    await save_deal(admin, lid, plan, 1)
    p, _ = await schedule(admin, lid, day="2027-01-31")
    collected = await admin.post(
        "/api/v1/admin/payments/" + p["id"] + "/collect",
        json={"expected_version": 1, "create_next": True},
    )
    feb = collected.json()["next_payment"]
    edited = await admin.patch(
        "/api/v1/admin/payments/" + feb["id"],
        json={
            "expected_version": 1,
            "due_date": "2027-02-28",
            "amount_vnd": 210000,
            "notes": "Only amount changed",
            "status": "pending",
        },
    )
    assert edited.status_code == 200
    nxt = await admin.post(
        "/api/v1/admin/payments/" + feb["id"] + "/collect",
        json={"expected_version": 2, "create_next": True},
    )
    assert nxt.status_code == 200 and nxt.json()["next_payment"]["due_date"] == "2027-03-31"
