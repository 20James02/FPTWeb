from uuid import uuid4


async def test_three_field_consultation_is_preserved_for_authorized_admin(admin):
    payload = {
        "name": "QA Khách kiểm thử",
        "phone": "0901234567",
        "installation_address": "QA Số 12, đường thử nghiệm, phường thử nghiệm, tỉnh thử nghiệm",
        "consent_version": "2026-09-v1",
    }
    submitted = await admin.post(
        "/api/v1/leads", json=payload, headers={"Idempotency-Key": str(uuid4())}
    )
    assert submitted.status_code == 201, submitted.text
    items = (await admin.get("/api/v1/admin/leads")).json()["items"]
    assert len(items) == 1
    assert items[0]["payload"].get("plan_id") is None
    assert items[0]["labels"]["plan"] is None
    revealed = await admin.post(f"/api/v1/admin/leads/{items[0]['id']}/reveal")
    assert revealed.status_code == 200, revealed.text
    data = revealed.json()
    assert data["name"] == payload["name"]
    assert data["phone"] == "+84901234567"
    assert data["installation_address"] == payload["installation_address"]


async def test_selected_package_is_identified_in_admin_list_and_detail(admin):
    plan_payload = {
        "name": "QA Gói được khách chọn",
        "service": "internet",
        "code": "qa-selected-package",
    }
    created = await admin.post("/api/v1/admin/plans", json=plan_payload)
    assert created.status_code == 201, created.text
    plan = created.json()
    published = await admin.post(
        f"/api/v1/admin/plans/{plan['id']}/publish",
        json={"expected_version": plan["version"]},
    )
    assert published.status_code == 200, published.text
    submitted = await admin.post(
        "/api/v1/leads",
        json={
            "name": "QA Khách chọn gói",
            "phone": "0901234567",
            "installation_address": "QA Địa chỉ nhập văn bản",
            "plan_id": plan["id"],
            "consent_version": "2026-09-v1",
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert submitted.status_code == 201, submitted.text
    items = (await admin.get("/api/v1/admin/leads")).json()["items"]
    assert len(items) == 1
    detail = await admin.get(f"/api/v1/admin/leads/{items[0]['id']}")
    assert detail.status_code == 200, detail.text
    for lead in [items[0], detail.json()]:
        assert lead["payload"]["plan_id"] == plan["id"]
        assert lead["labels"]["plan"] == plan_payload["name"]
