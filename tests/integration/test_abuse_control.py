import asyncio
from datetime import UTC, datetime
from uuid import uuid4

import pytest

from pagefpt.core.crypto import Crypto


@pytest.fixture
def crypt():
    return Crypto(
        encryption="0123456789abcdef0123456789abcdef",
        matching="0123456789abcdef0123456789abcdef",
        token="0123456789abcdef0123456789abcdef",
    )


async def setup_catalog(admin):
    branch = str(uuid4())
    region = (
        await admin.post(
            "/api/v1/admin/regions",
            json={"name": "Test region", "code": "test", "branch_id": branch},
        )
    ).json()
    plan = (
        await admin.post(
            "/api/v1/admin/plans",
            json={
                "name": "Test plan",
                "service": "internet",
                "code": "test",
                "description": "Synthetic fixture only",
            },
        )
    ).json()
    assert "id" in plan, plan
    for kind, item in [("regions", region), ("plans", plan)]:
        assert (
            await admin.post(
                f"/api/v1/admin/{kind}/{item['id']}/publish", json={"expected_version": 1}
            )
        ).status_code == 200
    return plan["id"], region["id"]


@pytest.mark.asyncio
async def test_abuse_rule_block_ip(admin, gateway, crypt):
    admin._transport.app.state.settings.trusted_vercel_proxy = True
    plan_id, region_id = await setup_catalog(admin)
    test_ip = "198.51.100.42"

    # 1. Normal submission with test IP succeeds
    payload = {
        "phone": "0912345678",
        "plan_id": plan_id,
        "region_id": region_id,
        "service_ids": ["internet"],
        "consent_version": "v1",
    }
    r = await admin.post(
        "/api/v1/leads",
        json=payload,
        headers={
            "Idempotency-Key": str(uuid4()),
            "X-Vercel-Forwarded-For": test_ip,
        },
    )
    assert r.status_code == 201

    # 2. Admin creates a rule to BLOCK this IP
    r_rule = await admin.post(
        "/api/v1/admin/abuse/rules",
        json={
            "target_type": "ip",
            "target_value": test_ip,
            "action": "block",
            "reason": "Suspicious bot activity",
            "duration_hours": 24,
        },
    )
    assert r_rule.status_code == 201
    rule_data = r_rule.json()
    assert rule_data["action"] == "block"
    rule_id = rule_data["id"]

    # 3. Next submission from this IP is immediately blocked with 403 CLIENT_BLOCKED
    r_blocked = await admin.post(
        "/api/v1/leads",
        json=payload,
        headers={
            "Idempotency-Key": str(uuid4()),
            "X-Vercel-Forwarded-For": test_ip,
        },
    )
    assert r_blocked.status_code == 403
    assert r_blocked.json()["code"] == "CLIENT_BLOCKED"

    # 4. Another IP still submits normally (zero impact on legitimate users)
    r_other = await admin.post(
        "/api/v1/leads",
        json=payload,
        headers={
            "Idempotency-Key": str(uuid4()),
            "X-Vercel-Forwarded-For": "203.0.113.88",
        },
    )
    assert r_other.status_code in (200, 201)

    # 5. Admin removes the rule (Unblock)
    r_del = await admin.delete(f"/api/v1/admin/abuse/rules/{rule_id}")
    assert r_del.status_code == 200

    # 6. First IP can now submit again
    r_unblocked = await admin.post(
        "/api/v1/leads",
        json=payload,
        headers={
            "Idempotency-Key": str(uuid4()),
            "X-Vercel-Forwarded-For": test_ip,
        },
    )
    assert r_unblocked.status_code in (200, 201)


@pytest.mark.asyncio
async def test_abuse_rule_challenge_and_shadow_ban(admin, gateway, crypt):
    plan_id, region_id = await setup_catalog(admin)
    test_phone = "0987654321"

    # 1. Admin creates a CHALLENGE rule for a specific phone number
    r_rule = await admin.post(
        "/api/v1/admin/abuse/rules",
        json={
            "target_type": "phone",
            "target_value": test_phone,
            "action": "challenge",
            "reason": "Spam pattern test",
            "duration_hours": 12,
        },
    )
    assert r_rule.status_code == 201
    rule_id = r_rule.json()["id"]

    # 2. Submission without challenge token fails with CHALLENGE_REQUIRED
    payload = {
        "phone": test_phone,
        "plan_id": plan_id,
        "region_id": region_id,
        "service_ids": ["internet"],
        "consent_version": "v1",
    }
    r = await admin.post(
        "/api/v1/leads",
        json=payload,
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert r.status_code == 403
    assert r.json()["code"] == "CHALLENGE_REQUIRED"

    # 3. Clean up the challenge rule
    await admin.delete(f"/api/v1/admin/abuse/rules/{rule_id}")

    # 4. Create SHADOW_BAN rule
    r_shadow = await admin.post(
        "/api/v1/admin/abuse/rules",
        json={
            "target_type": "phone",
            "target_value": test_phone,
            "action": "shadow_ban",
            "reason": "Silent junk sink",
            "duration_hours": 12,
        },
    )
    assert r_shadow.status_code == 201
    shadow_rule_id = r_shadow.json()["id"]

    # 5. Submission returns success (201) to client, avoiding alarming the bot
    r_silent = await admin.post(
        "/api/v1/leads",
        json=payload,
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert r_silent.status_code == 201
    data = r_silent.json()
    assert "receipt" in data

    await admin.delete(f"/api/v1/admin/abuse/rules/{shadow_rule_id}")


@pytest.mark.asyncio
async def test_admin_lead_1click_block(admin, gateway, crypt):
    admin._transport.app.state.settings.trusted_vercel_proxy = True
    plan_id, region_id = await setup_catalog(admin)
    test_ip = "198.51.100.99"

    # 1. Submit a lead with test_ip
    payload = {
        "phone": "0933445566",
        "plan_id": plan_id,
        "region_id": region_id,
        "service_ids": ["internet"],
        "consent_version": "v1",
    }
    r = await admin.post(
        "/api/v1/leads",
        json=payload,
        headers={
            "Idempotency-Key": str(uuid4()),
            "X-Vercel-Forwarded-For": test_ip,
        },
    )
    assert r.status_code == 201
    event_id = r.json()["event_id"]

    # Find the lead by listing leads with matching phone
    leads_res = await admin.get("/api/v1/admin/leads?q=5566")
    assert leads_res.status_code == 200
    leads = leads_res.json()["items"]
    assert len(leads) >= 1
    target_lead = leads[0]
    lead_id = target_lead["id"]

    # 2. Admin 1-Click Block from lead detail
    r_block = await admin.post(
        f"/api/v1/admin/leads/{lead_id}/block",
        json={
            "block_target": "ip",
            "action": "block",
            "reason": "1-click spam block test",
            "duration_hours": 24,
        },
    )
    assert r_block.status_code == 200, r_block.text
    res_data = r_block.json()
    assert res_data["blocked_target"] == "ip"
    rule_id = res_data["rule"]["id"]

    # 3. Subsequent submit from this IP is now blocked
    r_blocked = await admin.post(
        "/api/v1/leads",
        json=payload,
        headers={
            "Idempotency-Key": str(uuid4()),
            "X-Vercel-Forwarded-For": test_ip,
        },
    )
    assert r_blocked.status_code == 403
    assert r_blocked.json()["code"] == "CLIENT_BLOCKED"

    # Cleanup
    await admin.delete(f"/api/v1/admin/abuse/rules/{rule_id}")
