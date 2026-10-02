from uuid import uuid4

import psycopg
import pytest
from psycopg.types.json import Jsonb


@pytest.mark.asyncio
async def test_branch_editor_cannot_change_global_resource(admin, gateway):
    page = await admin.post(
        "/api/v1/admin/pages", json={"title": "Global", "slug": "global-test", "blocks": []}
    )
    actor, branch = str(uuid4()), str(uuid4())
    with psycopg.connect(gateway.dsn) as db:
        db.execute(
            "INSERT INTO private.memberships(user_id,branch_id,permissions) VALUES(%s,%s,ARRAY['content.write'])",
            [actor, branch],
        )
    from pagefpt.core.errors import DomainError

    with pytest.raises(DomainError) as result:
        await gateway.rpc(
            "dispatch",
            {
                "command": {
                    "op": "resource_update",
                    "actor": actor,
                    "kind": "page",
                    "id": page.json()["id"],
                    "expected_version": 1,
                    "payload": {"title": "Override", "slug": "global-test", "blocks": []},
                }
            },
        )
    assert result.value.status == 403


@pytest.mark.asyncio
async def test_auto_assignment_replay_preserves_staff(admin, gateway):
    branch, contact, id = [str(uuid4()) for _ in range(3)]
    with psycopg.connect(gateway.dsn) as db:
        for _ in range(2):
            db.execute(
                "INSERT INTO private.memberships(user_id,branch_id,permissions,shift) VALUES(%s,%s,ARRAY['lead.read','lead.write'],%s)",
                [
                    str(uuid4()),
                    branch,
                    Jsonb({"weekdays": list(range(7)), "start": "00:00", "end": "23:59"}),
                ],
            )
        db.execute(
            "INSERT INTO private.contacts(id,phone_hmac,phone_ciphertext,key_version) VALUES(%s,'h','encrypted','v1')",
            [contact],
        )
        db.execute(
            "INSERT INTO private.leads(id,contact_id,branch_id,payload,pii_ciphertext,quote_status) VALUES(%s,%s,%s,'{}','encrypted','needs_confirmation')",
            [id, contact, branch],
        )
    command = {"command": {"op": "internal_assign", "id": id}}
    first = await gateway.rpc("dispatch", command)
    second = await gateway.rpc("dispatch", command)
    assert first["assignee_id"] == second["assignee_id"]
    assert first["version"] == second["version"]


@pytest.mark.asyncio
async def test_export_cannot_complete_after_privacy_erase(admin, gateway):
    await admin.post(
        "/api/v1/leads",
        json={"phone": "0901234567", "consent_version": "v1"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    with psycopg.connect(gateway.dsn) as db:
        id = str(db.execute("SELECT id FROM private.leads").fetchone()[0])
        actor = str(db.execute("SELECT user_id FROM private.memberships LIMIT 1").fetchone()[0])
    export = await gateway.rpc("dispatch", {"command": {"op": "export_create", "actor": actor}})
    job = (await gateway.rpc("claim_jobs", {"command": {"queue": "maintenance", "limit": 1}}))[
        "jobs"
    ][0]
    request = await admin.post(
        "/api/v1/admin/privacy/requests",
        json={"lead_id": id, "action": "delete", "reason": "synthetic"},
    )
    assert (
        await admin.post(f"/api/v1/admin/privacy/requests/{request.json()['id']}/execute")
    ).status_code == 200
    result = await gateway.rpc(
        "complete_job",
        {
            "command": {
                "id": job["id"],
                "fence": job["fence"],
                "result": {
                    "part_key": f"exports/{export['id']}/0-{job['fence']}.csv",
                    "part": 0,
                    "has_more": False,
                },
            }
        },
    )
    assert not result["completed"]
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute(
            "SELECT next_attempt_at>now()+interval '60 seconds' FROM private.jobs WHERE kind='erase_export'"
        ).fetchone()[0]
