import pytest


@pytest.mark.asyncio
async def test_admin_upload_speed_is_optional_published_and_rendered_without_guessing(admin):
    plans = []
    for index, upload in enumerate([None, 150]):
        response = await admin.post(
            "/api/v1/admin/plans",
            json={
                "name": f"Reference card {index}",
                "code": f"reference-card-{index}",
                "service": "internet",
                "speed_mbps": 300,
                "upload_speed_mbps": upload,
                "equipment": ["Modem Wi-Fi 6", "Nội dung do Admin thiết lập"],
            },
        )
        assert response.status_code == 201, response.text
        plan = response.json()
        plans.append(plan)
        published = await admin.post(
            f"/api/v1/admin/plans/{plan['id']}/publish",
            json={"expected_version": plan["version"]},
        )
        assert published.status_code == 200
    catalog = (await admin.get("/api/v1/catalog")).json()["items"]
    assert next(p for p in catalog if p["id"] == plans[1]["id"])["upload_speed_mbps"] == 150
    page = await admin.get("/")
    for plan in plans:
        card = page.text.split(f'id="card-3d-{plan["id"]}"', 1)[1].split(
            'class="plan-card-actions"', 1
        )[0]
        assert 'class="plan-speed-panel"' in card
        assert "300 Mbps" in card
        assert ("150 Mbps" if plan == plans[1] else "Chưa cập nhật") in card
        assert 'class="plan-benefits-scroll"' in card
        assert "Modem Wi-Fi 6" in card
    invalid = await admin.post(
        "/api/v1/admin/plans",
        json={
            "name": "Invalid",
            "code": "invalid-upload",
            "service": "internet",
            "upload_speed_mbps": 0,
        },
    )
    assert invalid.status_code == 422
