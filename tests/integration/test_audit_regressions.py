from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import psycopg
import pytest
from psycopg.types.json import Jsonb


def seed(db, count=120):
    contact = db.execute(
        "INSERT INTO private.contacts(phone_hmac,phone_ciphertext,key_version) VALUES(%s,'encrypted','v1') RETURNING id",
        [str(uuid4())],
    ).fetchone()[0]
    return [
        row[0]
        for row in db.execute(
            "INSERT INTO private.leads(contact_id,status,payload,pii_ciphertext,quote_status,sla_due_at) SELECT %s,'assigned','{}','encrypted','needs_confirmation',now()-make_interval(secs=>i) FROM generate_series(1,%s) i RETURNING id",
            [contact, count],
        ).fetchall()
    ]


def tick(dsn):
    with psycopg.connect(dsn) as db:
        db.execute("SET ROLE service_role")
        return db.execute("SELECT api.dispatch(%s)", [Jsonb({"op": "schedule_tick"})]).fetchone()[0]


@pytest.mark.asyncio
async def test_sla_batches_progress_and_changed_deadline(gateway):
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        ids = seed(db)
        counts = []
        for _ in range(4):
            tick(gateway.dsn)
            counts.append(
                db.execute(
                    "SELECT count(*) FROM private.audit WHERE action='sla.overdue'"
                ).fetchone()[0]
            )
        assert counts == [50, 100, 120, 120]
        db.execute(
            "UPDATE private.leads SET sla_due_at=sla_due_at-interval '1 hour' WHERE id=%s", [ids[0]]
        )
        tick(gateway.dsn)
        assert (
            db.execute(
                "SELECT count(*) FROM private.audit WHERE entity_id=%s AND action='sla.overdue'",
                [ids[0]],
            ).fetchone()[0]
            == 2
        )


@pytest.mark.asyncio
async def test_concurrent_sla_ticks_do_not_duplicate(gateway):
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        seed(db)
    with ThreadPoolExecutor(max_workers=3) as executor:
        list(executor.map(tick, [gateway.dsn] * 3))
    with psycopg.connect(gateway.dsn) as db:
        rows = db.execute(
            "SELECT entity_id,count(*) FROM private.audit WHERE action='sla.overdue' GROUP BY entity_id"
        ).fetchall()
        assert len(rows) == 120
        assert all(count == 1 for _, count in rows)


@pytest.mark.asyncio
async def test_scope_union_uses_combined_permissions_without_leaking(gateway):
    actor, branch, other, contact = [str(uuid4()) for _ in range(4)]
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        db.execute(
            "INSERT INTO private.memberships(user_id,branch_id,permissions) VALUES(%s,'00000000-0000-0000-0000-000000000000',ARRAY['lead.read']),(%s,%s,ARRAY['lead.all'])",
            [actor, actor, branch],
        )
        contact = db.execute(
            "INSERT INTO private.contacts(phone_hmac,phone_ciphertext,key_version) VALUES(%s,'encrypted','v1') RETURNING id",
            [contact],
        ).fetchone()[0]
        allowed = []
        for b, assignee in [(branch, None), (other, actor), (other, None), (None, None)]:
            lead = db.execute(
                "INSERT INTO private.leads(contact_id,branch_id,assignee_id,payload,pii_ciphertext,quote_status) VALUES(%s,%s,%s,'{}','encrypted','needs_confirmation') RETURNING id",
                [contact, b, assignee],
            ).fetchone()[0]
            if b == branch or assignee == actor:
                allowed.append(str(lead))
        db.execute("SET ROLE service_role")
        response = db.execute(
            "SELECT api.dispatch(%s)", [Jsonb({"op": "lead_list", "actor": actor})]
        ).fetchone()[0]
        assert {lead["id"] for lead in response["items"]} == set(allowed)
        assert all("pii_ciphertext" not in lead for lead in response["items"])


@pytest.mark.asyncio
async def test_worker_keeps_review_status_and_risk_source(admin, gateway):
    response = await admin.post(
        "/api/v1/leads",
        json={
            "phone": "0901234567",
            "notes": "Không cần camera, chỉ cần internet",
            "consent_version": "v1",
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert response.status_code == 201
    await admin.post(
        "/internal/jobs/process", headers={"X-Job-Secret": "j" * 32}, json={"queue": "lead_local"}
    )
    with psycopg.connect(gateway.dsn) as db:
        observations = db.execute(
            "SELECT value,status,evidence_ref FROM private.observations WHERE source='notes_rule'"
        ).fetchall()
        camera = next(x for x in observations if x[0] == "camera")
        assert camera[1] == "needs_review"
        import json

        assert json.loads(camera[2])["polarity"] == "negative"
        scores = db.execute("SELECT scores FROM private.leads").fetchone()[0]
        assert scores["risk_status"] == "evaluated"
        assert scores["risk_checked_signals"] == ["honeypot"]


@pytest.mark.asyncio
async def test_workbench_scope_priority_and_bounded_results(admin, gateway):
    me = (await admin.get("/api/v1/admin/me")).json()["id"]
    branch, other = str(uuid4()), str(uuid4())
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        ids = seed(db, 12)
        db.execute(
            "UPDATE private.memberships SET branch_id=%s,permissions=ARRAY['lead.read','lead.all'] WHERE user_id=%s",
            [branch, me],
        )
        db.execute("UPDATE private.leads SET branch_id=%s", [branch])
        db.execute("UPDATE private.leads SET branch_id=%s WHERE id=%s", [other, ids[0]])
    response = await admin.get("/api/v1/admin/workbench", params={"limit": 5})
    assert response.status_code == 200, response.text
    group = response.json()["groups"][0]
    assert group["key"] == "overdue" and group["has_more"] is True
    assert len(group["items"]) == 5
    assert all(x["id"] != str(ids[0]) for x in group["items"])
    assert "pii_ciphertext" not in response.text
    times = [x["sla_due_at"] for x in group["items"]]
    assert times == sorted(times)
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        db.execute(
            "UPDATE private.memberships SET permissions=ARRAY['report.read'] WHERE user_id=%s", [me]
        )
    assert (await admin.get("/api/v1/admin/workbench")).status_code == 403


@pytest.mark.asyncio
async def test_legacy_sla_audit_does_not_checkpoint_changed_deadline(gateway):
    import re
    from pathlib import Path

    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        lead_id = seed(db, 1)[0]
        db.execute(
            "INSERT INTO private.audit(entity_id,action,created_at) VALUES(%s,'sla.overdue',now()-interval '1 day')",
            [lead_id],
        )
        migration = Path("supabase/migrations/20261010060000_audit_scaling.sql").read_text()
        backfill = re.search(r"UPDATE private.leads l SET sla_alerted_due_at=.*?;", migration, re.S)
        assert backfill
        db.execute(backfill[0])
        assert (
            db.execute(
                "SELECT sla_alerted_due_at FROM private.leads WHERE id=%s", [lead_id]
            ).fetchone()[0]
            is None
        )
        tick(gateway.dsn)
        assert (
            db.execute(
                "SELECT count(*) FROM private.audit WHERE entity_id=%s AND action='sla.overdue'",
                [lead_id],
            ).fetchone()[0]
            == 2
        )


@pytest.mark.asyncio
async def test_unreachable_lead_remains_in_overdue_workbench_and_list(admin, gateway):
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        lead_id = seed(db, 1)[0]
        db.execute("UPDATE private.leads SET status='unreachable' WHERE id=%s", [lead_id])
    response = await admin.get("/api/v1/admin/workbench")
    assert response.status_code == 200
    assert any(x["id"] == str(lead_id) for x in response.json()["groups"][0]["items"])
    response = await admin.get("/api/v1/admin/leads", params={"overdue": "true"})
    assert any(x["id"] == str(lead_id) for x in response.json()["items"])


@pytest.mark.asyncio
async def test_worker_preserves_postposed_negation(admin, gateway):
    response = await admin.post(
        "/api/v1/leads",
        json={
            "phone": "0901234567",
            "notes": "Cần camera. Camera không cần nữa",
            "consent_version": "v1",
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert response.status_code == 201
    await admin.post(
        "/internal/jobs/process", headers={"X-Job-Secret": "j" * 32}, json={"queue": "lead_local"}
    )
    with psycopg.connect(gateway.dsn) as db:
        cameras = db.execute(
            "SELECT status FROM private.observations WHERE source='notes_rule' AND value='\"camera\"'::jsonb"
        ).fetchall()
        assert len(cameras) == 2
        assert all(x[0] == "needs_review" for x in cameras)
