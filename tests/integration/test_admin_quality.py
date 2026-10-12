from datetime import UTC, datetime
from uuid import uuid4

import psycopg
import pytest
from psycopg.types.json import Jsonb


@pytest.mark.asyncio
async def test_admin_html_requires_authenticated_actor(client):
    for path in [
        "/admin/dashboard",
        "/admin/leads",
        "/admin/pricing",
        "/admin/settings",
        "/admin/marketing",
        "/admin/operations",
        "/admin/content",
    ]:
        response = await client.get(path, follow_redirects=False)
        assert response.status_code == 303, (path, response.text[:100])
        assert response.headers["location"] == "/admin/login"


@pytest.mark.asyncio
async def test_operational_settings_version_and_scope(admin, gateway):
    current = await admin.get("/api/v1/admin/operations/settings")
    assert current.status_code == 200
    assert current.json()["version"] == 0
    payload = {
        "expected_version": 0,
        "sla_minutes": 30,
        "sound_alert": False,
        "shift": {"weekdays": [0, 1, 2, 3, 4, 5], "start": "08:00", "end": "18:00"},
    }
    saved = await admin.put("/api/v1/admin/operations/settings", json=payload)
    assert saved.status_code == 200, saved.text
    assert saved.json()["version"] == 1
    assert (await admin.get("/api/v1/admin/operations/settings")).json()["payload"][
        "sla_minutes"
    ] == 30
    assert (await admin.put("/api/v1/admin/operations/settings", json=payload)).status_code == 409
    me = (await admin.get("/api/v1/admin/me")).json()
    with psycopg.connect(gateway.dsn, autocommit=True) as conn:
        conn.execute(
            "UPDATE private.memberships SET permissions=ARRAY['lead.read'] WHERE user_id=%s",
            [me["id"]],
        )
    assert (
        await admin.put(
            "/api/v1/admin/operations/settings", json={**payload, "expected_version": 1}
        )
    ).status_code == 403


@pytest.mark.asyncio
async def test_lead_filters_named_dto_and_bound_cursor(admin, gateway):
    plan, region, branch = str(uuid4()), str(uuid4()), str(uuid4())
    with psycopg.connect(gateway.dsn, autocommit=True) as conn:
        conn.execute(
            "INSERT INTO private.resources(id,kind,payload,status) VALUES(%s,'plan',%s,'published')",
            [plan, Jsonb({"name": "Test internet"})],
        )
        conn.execute(
            "INSERT INTO private.resources(id,kind,branch_id,payload,status) VALUES(%s,'region',%s,%s,'published')",
            [region, branch, Jsonb({"name": "Test ward"})],
        )
        for index in range(3):
            contact = conn.execute(
                "INSERT INTO private.contacts(phone_hmac,phone_ciphertext,key_version) VALUES(%s,'encrypted','v1') RETURNING id",
                [str(uuid4())],
            ).fetchone()[0]
            conn.execute(
                "INSERT INTO private.leads(contact_id,branch_id,payload,pii_ciphertext,quote_status,status,sla_due_at) VALUES(%s,%s,%s,'encrypted','needs_confirmation',%s,now()-interval '1 hour')",
                [
                    contact,
                    branch,
                    Jsonb({"plan_id": plan, "region_id": region, "phone_masked": "***1234"}),
                    "assigned" if index < 2 else "installed",
                ],
            )
    response = await admin.get(
        "/api/v1/admin/leads", params={"q": "Test internet", "overdue": "true", "limit": 1}
    )
    assert response.status_code == 200, response.text
    value = response.json()
    assert len(value["items"]) == 1
    assert value["items"][0]["labels"]["plan"] == "Test internet"
    assert value["items"][0]["labels"]["region"] == "Test ward"
    assert "pii_ciphertext" not in value["items"][0]
    assert value["next_cursor"]
    second = await admin.get(
        "/api/v1/admin/leads",
        params={
            "q": "Test internet",
            "overdue": "true",
            "limit": 1,
            "cursor": value["next_cursor"],
        },
    )
    assert second.status_code == 200
    assert second.json()["items"][0]["id"] != value["items"][0]["id"]
    wrong = await admin.get(
        "/api/v1/admin/leads",
        params={"q": "changed", "overdue": "true", "limit": 1, "cursor": value["next_cursor"]},
    )
    assert wrong.status_code == 422
    empty = await admin.get("/api/v1/admin/leads", params={"q": "not a package"})
    assert empty.json()["items"] == []


@pytest.mark.asyncio
async def test_manual_daily_rebuild_includes_contacted(admin):
    response = await admin.post(
        "/api/v1/admin/reports/rebuild", json={"day": datetime.now(UTC).date().isoformat()}
    )
    assert response.status_code == 200
    assert response.json()["definition_version"] == "v2"


@pytest.mark.asyncio
async def test_system_status_does_not_claim_unconfigured_storage_ready(admin):
    response = await admin.get("/api/v1/admin/operations/status")
    assert response.status_code == 200
    body = response.json()
    assert body["storage"]["status"] == "unconfigured"
    assert body["database"]["status"] == "verified"
    assert body["checked_at"]
    assert "secret" not in str(body)


@pytest.mark.asyncio
async def test_sla_settings_apply_to_real_intake_and_business_calendar(admin, gateway):
    await admin.put(
        "/api/v1/admin/operations/settings",
        json={
            "expected_version": 0,
            "sla_minutes": 30,
            "sound_alert": True,
            "shift": {"weekdays": [0, 1, 2, 3, 4, 5, 6], "start": "00:00", "end": "23:59"},
        },
    )
    result = await admin.post(
        "/api/v1/leads",
        json={"phone": "0901234567", "consent_version": "v1"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert result.status_code == 201, result.text
    with psycopg.connect(gateway.dsn) as db:
        due, created = db.execute("SELECT sla_due_at,created_at FROM private.leads").fetchone()
        assert 1799 <= (due - created).total_seconds() <= 1801
        expected = db.execute(
            'SELECT private.business_sla(\'2026-10-02 17:55+07\', \'{"sla_minutes":30,"shift":{"weekdays":[0,1,2,3,4],"start":"08:00","end":"18:00"}}\'::jsonb)'
        ).fetchone()[0]
        assert (
            expected.astimezone(__import__("zoneinfo").ZoneInfo("Asia/Ho_Chi_Minh")).isoformat()
            == "2026-10-05T08:25:00+07:00"
        )


@pytest.mark.asyncio
async def test_manual_assignment_and_atomic_bulk_capacity(admin, gateway):
    from tests.integration.test_worker_crm import lead

    first = await lead(admin, gateway)
    second_result = await admin.post(
        "/api/v1/leads",
        json={"phone": "0901234568", "consent_version": "v1"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert second_result.status_code == 201, second_result.text
    with psycopg.connect(gateway.dsn) as db:
        second = str(db.execute("SELECT id FROM private.leads WHERE id<>%s", [first]).fetchone()[0])
    staff = str(uuid4())
    membership = {
        "user_id": staff,
        "branch_id": "00000000-0000-0000-0000-000000000000",
        "display_name": "Test agent",
        "permissions": ["lead.read", "lead.write"],
        "capacity": 1,
        "active": True,
        "shift": {"weekdays": [0, 1, 2, 3, 4, 5, 6], "start": "00:00", "end": "23:59"},
    }
    assert (await admin.put("/api/v1/admin/memberships", json=membership)).status_code == 200
    response = await admin.post(
        "/api/v1/admin/lead-assignments",
        json={
            "assignee_id": staff,
            "items": [{"id": first, "expected_version": 1}, {"id": second, "expected_version": 1}],
        },
    )
    assert response.status_code == 409, response.text
    with psycopg.connect(gateway.dsn) as db:
        assert (
            db.execute(
                "SELECT count(*) FROM private.leads WHERE assignee_id IS NOT NULL"
            ).fetchone()[0]
            == 0
        )
    saved = await admin.post(
        f"/api/v1/admin/leads/{first}/assignments",
        json={"expected_version": 1, "assignee_id": staff},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["labels"]["assignee"] == "Test agent"
    assert (
        await admin.post(
            f"/api/v1/admin/leads/{first}/assignments",
            json={"expected_version": 1, "assignee_id": staff},
        )
    ).status_code == 409


@pytest.mark.asyncio
async def test_report_summary_costs_and_scoped_workspace(admin, gateway):
    campaign = await admin.post(
        "/api/v1/admin/campaigns",
        json={"name": "Test campaign", "platform": "google", "utm_campaign": "qa_campaign"},
    )
    assert campaign.status_code == 201, campaign.text
    cost = await admin.post(
        "/api/v1/admin/costs",
        json={"campaign_id": campaign.json()["id"], "day": "2026-10-02", "cost_vnd": 100000},
    )
    assert cost.status_code == 201, cost.text
    summary = await admin.get(
        "/api/v1/admin/reports/summary", params={"start": "2026-10-02", "end": "2026-10-02"}
    )
    assert summary.status_code == 200, summary.text
    row = summary.json()["items"][0]
    assert row["cost_vnd"] == 100000
    assert row["cpl_vnd"] is None
    page = await admin.get("/api/v1/admin/workspace/campaign")
    assert page.status_code == 200, page.text
    assert page.json()["items"][0]["payload"]["name"] == "Test campaign"
    me = (await admin.get("/api/v1/admin/me")).json()
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        db.execute(
            "UPDATE private.memberships SET permissions=ARRAY['lead.read'] WHERE user_id=%s",
            [me["id"]],
        )
    assert (await admin.get("/api/v1/admin/workspace/campaign")).status_code == 403
    assert (await admin.get("/admin/reports")).status_code == 403
    assert (await admin.get("/admin/marketing")).status_code == 403


@pytest.mark.asyncio
async def test_forged_preview_cookie_never_authenticates(client):
    client.cookies.set("pagefpt_admin_session", "dev-session-admin-forged")
    response = await client.get("/api/v1/admin/me")
    assert response.status_code == 401, response.text
    login = await client.get("/admin/login")
    assert "Admin@123456" not in login.text
    response = await client.post(
        "/api/v1/auth/session",
        json={"email": "admin@fpt.vn", "password": "Admin@123456", "otp": ""},
    )
    assert response.status_code == 503
    assert "pagefpt_admin_session" not in response.cookies


@pytest.mark.asyncio
async def test_saved_views_owner_isolation_and_version(admin, gateway):
    response = await admin.post(
        "/api/v1/admin/lead-views",
        json={
            "name": "Overdue",
            "expected_version": 0,
            "filters": {"status": "assigned", "q": "internet", "overdue": True},
        },
    )
    assert response.status_code == 201, response.text
    saved = response.json()
    assert saved["version"] == 1
    assert (await admin.get("/api/v1/admin/lead-views")).json()["items"][0]["payload"][
        "name"
    ] == "Overdue"
    assert (
        await admin.put(
            "/api/v1/admin/lead-views/" + saved["id"],
            json={"name": "Changed", "expected_version": 0, "filters": {}},
        )
    ).status_code == 409
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        db.execute(
            "UPDATE private.saved_lead_views SET owner_id=%s WHERE id=%s",
            [str(uuid4()), saved["id"]],
        )
    assert (await admin.get("/api/v1/admin/lead-views")).json()["items"] == []
    assert (
        await admin.put(
            "/api/v1/admin/lead-views/" + saved["id"],
            json={"name": "Changed", "expected_version": 1, "filters": {}},
        )
    ).status_code == 404


@pytest.mark.asyncio
async def test_cost_requires_authorized_campaign_and_valid_day(admin, gateway):
    assert (
        await admin.post(
            "/api/v1/admin/costs",
            json={"campaign_id": str(uuid4()), "day": "2026-10-02", "cost_vnd": 100},
        )
    ).status_code == 422
    assert (
        await admin.post(
            "/api/v1/admin/costs",
            json={"campaign_id": str(uuid4()), "day": "2026-99-99", "cost_vnd": 100},
        )
    ).status_code == 422


@pytest.mark.asyncio
async def test_production_admin_routes_keep_auth_gate(admin):
    import httpx

    from pagefpt.application import create_app

    original = admin._transport.app
    settings = original.state.settings.model_copy(update={"environment": "production"})
    app = create_app(settings, original.state.db)
    app.state.verifier = original.state.verifier
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as guest:
        assert (await guest.get("/admin/dashboard")).status_code == 303
        response = await guest.get(
            "/admin/dashboard", headers={"Authorization": admin.headers["Authorization"]}
        )
        assert response.status_code == 200, response.text
        login = await guest.get("/admin/login")
        assert "Admin@123456" not in login.text
        home = await guest.get("/")
        assert home.status_code == 200
        assert "tặng đến 2 tháng" not in home.text


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "permissions,landing",
    [
        (["*"], "/admin/dashboard"),
        (["lead.read", "lead.write"], "/admin/workbench"),
        (["lead.read"], "/admin/workbench"),
        (["marketing.write"], "/admin/marketing"),
        (["content.write"], "/admin/content"),
        (["pricing.write"], "/admin/pricing"),
        (["workflow.manage"], "/admin/operations"),
        (["identity.manage"], "/admin/operations"),
        (["governance.audit"], "/admin/operations"),
        (["governance.export"], "/admin/operations"),
        (["governance.write"], "/admin/operations"),
        (["content.publish"], "/admin/settings"),
    ],
)
async def test_admin_entry_opens_permitted_workspace(admin, gateway, permissions, landing):
    actor_id = (await admin.get("/api/v1/admin/me")).json()["id"]
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        db.execute(
            "UPDATE private.memberships SET permissions=%s WHERE user_id=%s",
            [permissions, actor_id],
        )
    response = await admin.get("/admin", follow_redirects=False)
    assert response.status_code == 303
    assert response.headers["location"] == landing
    assert (await admin.get(landing)).status_code == 200


@pytest.mark.asyncio
async def test_admin_entry_without_workspace_permission_has_no_redirect_loop(admin, gateway):
    actor_id = (await admin.get("/api/v1/admin/me")).json()["id"]
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        db.execute(
            "UPDATE private.memberships SET permissions=ARRAY['lead.reveal'] WHERE user_id=%s",
            [actor_id],
        )
    response = await admin.get("/admin", follow_redirects=False)
    assert response.status_code == 303
    assert response.headers["location"] == "/admin/account"
    assert (await admin.get("/admin/account")).status_code == 200


@pytest.mark.asyncio
async def test_admin_entry_guest_and_login_redirect_use_authenticated_resolver(client):
    response = await client.get("/admin", follow_redirects=False)
    assert response.status_code == 303
    assert response.headers["location"] == "/admin/login"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status",
    [
        "contacting",
        "contacted",
        "qualified",
        "survey",
        "quoted",
        "closed",
        "unreachable",
        "no_infrastructure",
    ],
)
async def test_reassign_active_lead_preserves_progress_and_balances_capacity(
    admin, gateway, status
):
    from tests.integration.test_worker_crm import lead

    lead_id = await lead(admin, gateway)
    old = (await admin.get("/api/v1/admin/me")).json()["id"]
    staff = str(uuid4())
    with psycopg.connect(gateway.dsn) as db:
        db.execute(
            "UPDATE private.leads SET status=%s,assignee_id=%s,assignment_branch_id='00000000-0000-0000-0000-000000000000' WHERE id=%s",
            [status, old, lead_id],
        )
        db.execute("UPDATE private.memberships SET active_leads=1 WHERE user_id=%s", [old])
        db.execute(
            "INSERT INTO private.memberships(user_id,branch_id,permissions,capacity,display_name,shift) VALUES(%s,'00000000-0000-0000-0000-000000000000',ARRAY['lead.read','lead.write'],1,'Nhân viên nhận bàn giao','{\"weekdays\":[0,1,2,3,4,5,6],\"start\":\"00:00\",\"end\":\"23:59\"}')",
            [staff],
        )
        before = db.execute(
            "SELECT sla_due_at,payload FROM private.leads WHERE id=%s", [lead_id]
        ).fetchone()
    result = await admin.post(
        f"/api/v1/admin/leads/{lead_id}/assignments",
        json={"expected_version": 1, "assignee_id": staff},
    )
    assert result.status_code == 200, result.text
    assert result.json()["status"] == status and result.json()["assignee_id"] == staff
    # Re-selecting the same assignee while their capacity is full stays safe.
    same = await admin.post(
        f"/api/v1/admin/leads/{lead_id}/assignments",
        json={"expected_version": 2, "assignee_id": staff},
    )
    assert same.status_code == 200, same.text
    with psycopg.connect(gateway.dsn) as db:
        assert (
            db.execute(
                "SELECT active_leads FROM private.memberships WHERE user_id=%s", [old]
            ).fetchone()[0]
            == 0
        )
        assert (
            db.execute(
                "SELECT active_leads FROM private.memberships WHERE user_id=%s", [staff]
            ).fetchone()[0]
            == 1
        )
        assert (
            db.execute(
                "SELECT sla_due_at,payload FROM private.leads WHERE id=%s", [lead_id]
            ).fetchone()
            == before
        )
        assert (
            db.execute(
                "SELECT count(*) FROM private.audit WHERE entity_id=%s AND action='lead.assign'",
                [lead_id],
            ).fetchone()[0]
            == 2
        )


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["installed", "invalid", "rejected", "duplicate"])
async def test_reassignment_rejects_finished_lead_with_specific_error(admin, gateway, status):
    from tests.integration.test_worker_crm import lead

    lead_id = await lead(admin, gateway)
    actor = (await admin.get("/api/v1/admin/me")).json()["id"]
    with psycopg.connect(gateway.dsn) as db:
        db.execute("UPDATE private.leads SET status=%s WHERE id=%s", [status, lead_id])
    result = await admin.post(
        f"/api/v1/admin/leads/{lead_id}/assignments",
        json={"expected_version": 1, "assignee_id": actor},
    )
    assert result.status_code == 409
    assert result.json()["code"] == "ASSIGNMENT_NOT_ALLOWED"
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute(
            "SELECT status,assignee_id,version FROM private.leads WHERE id=%s", [lead_id]
        ).fetchone() == (status, None, 1)
