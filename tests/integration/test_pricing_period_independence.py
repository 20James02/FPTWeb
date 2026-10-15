from datetime import UTC, datetime, timedelta

from tests.integration.test_regional_pricing import setup


async def test_each_billing_period_keeps_its_coefficient_and_fees(admin):
    province, _, plan = await setup(admin)
    cases = [
        (1, "1", 300000, 500000, 0, 200000, 1000000),
        (6, "0.95", 100000, 200000, 1, 190000, 1440000),
        (12, "0.9", 0, 100000, 2, 180000, 2260000),
    ]
    inputs, drafts = {}, {}
    for months, coefficient, setup_fee, equipment_fee, gifts, _, _ in cases:
        payload = dict(
            plan_id=plan["id"],
            scope_kind="region",
            scope_id=province["id"],
            billing_months=months,
            monthly_vnd=200000,
            monthly_coefficient=coefficient,
            setup_vnd=setup_fee,
            equipment_vnd=equipment_fee,
            gift_months=gifts,
            start=(datetime.now(UTC) - timedelta(days=1)).isoformat(),
            source="QA synthetic",
        )
        response = await admin.post("/api/v1/admin/prices", json=payload)
        assert response.status_code == 201, response.text
        inputs[months], drafts[months] = payload, response.json()

    # Editing a coefficient must neither reset it nor modify another period.
    draft = drafts[6]
    edited = await admin.put(
        f"/api/v1/admin/prices/{draft['id']}?expected_version={draft['version']}",
        json={**inputs[6], "monthly_coefficient": "0.8"},
    )
    assert edited.status_code == 200, edited.text
    restored = await admin.put(
        f"/api/v1/admin/prices/{draft['id']}?expected_version={edited.json()['version']}",
        json=inputs[6],
    )
    assert restored.status_code == 200, restored.text
    drafts[6] = restored.json()
    for draft in drafts.values():
        published = await admin.post(
            f"/api/v1/admin/prices/{draft['id']}/publish",
            json={"expected_version": draft["version"]},
        )
        assert published.status_code == 200, published.text

    for months, coefficient, setup_fee, equipment_fee, gifts, monthly, total in cases:
        response = await admin.post(
            "/api/v1/quotes",
            json={
                "plan_id": plan["id"],
                "region_id": province["id"],
                "billing_months": months,
            },
        )
        assert response.status_code == 200, response.text
        quote = response.json()
        assert quote["status"] == "confirmed"
        assert quote["monthly_vnd"] == monthly
        assert quote["monthly_coefficient"] == coefficient
        assert quote["initial_total_vnd"] == total
        assert quote["line_items"]["setup_vnd"] == setup_fee
        assert quote["line_items"]["equipment_vnd"] == equipment_fee
        assert quote["service_months"] == months + gifts
        assert {
            (option["billing_months"], option["monthly_vnd"], option["initial_total_vnd"])
            for option in quote["billing_options"]
        } == {(1, 200000, 1000000), (6, 190000, 1440000), (12, 180000, 2260000)}
