from uuid import uuid4


async def test_cta_experiment_settings_variant_and_report(admin, gateway):
    r = await admin.post(
        "/api/v1/admin/experiments",
        json={
            "name": "QA CTA",
            "salt": "x" * 32,
            "variants": [
                {"name": "a", "weight": 5000, "cta_label": "Nhận tư vấn"},
                {"name": "b", "weight": 5000, "cta_label": "Chọn gói phù hợp"},
            ],
        },
    )
    assert r.status_code == 201, r.text
    exp = r.json()
    exp = (
        await admin.post(
            "/api/v1/admin/experiments/" + exp["id"] + "/publish",
            json={"expected_version": exp["version"]},
        )
    ).json()
    current = (await admin.get("/api/v1/system/display-settings")).json()
    save = await admin.post(
        "/api/v1/system/display-settings",
        json={"expected_version": current["version"], "hero_experiment_id": exp["id"]},
    )
    assert save.status_code == 200, save.text
    html = (await admin.get("/")).text
    assert "data-experiment-cta" in html and exp["id"] in html
    token = (
        await admin.post(
            "/api/v1/sessions",
            json={"analytics": True, "marketing": False, "consent_version": "qa"},
        )
    ).json()["session_token"]
    variant = (
        await admin.get(
            "/api/v1/experiments/" + exp["id"] + "/variant", params={"session_token": token}
        )
    ).json()
    assert variant["cta_label"] in {"Nhận tư vấn", "Chọn gói phù hợp"}
    event = {
        "id": str(uuid4()),
        "name": "experiment_exposure",
        "experiment_id": exp["id"],
        "variant": variant["variant"],
        "experiment_version": variant["experiment_version"],
    }
    assert (
        await admin.post(
            "/api/v1/events/batch", json={"session_token": token, "events": [event, event]}
        )
    ).status_code == 200
    report = await admin.get("/api/v1/admin/experiments/" + exp["id"] + "/results")
    assert report.status_code == 200, report.text
    assert sum(v["exposures"] for v in report.json()["variants"]) == 1
    assert (await admin.get("/admin/marketing")).status_code == 200
    assert "delivery-console" in (await admin.get("/admin/marketing")).text


async def test_experiment_exposure_requires_analytics_and_cannot_forge_variant(admin):
    r = await admin.post(
        "/api/v1/admin/experiments",
        json={
            "name": "QA",
            "salt": "y" * 32,
            "variants": [{"name": "a", "weight": 10000}, {"name": "b", "weight": 0}],
        },
    )
    assert r.status_code == 201, r.text
    exp = r.json()
    await admin.post(
        "/api/v1/admin/experiments/" + exp["id"] + "/publish",
        json={"expected_version": exp["version"]},
    )
    token = (
        await admin.post(
            "/api/v1/sessions",
            json={"analytics": False, "marketing": False, "consent_version": "qa"},
        )
    ).json()["session_token"]
    out = (
        await admin.get(
            "/api/v1/experiments/" + exp["id"] + "/variant", params={"session_token": token}
        )
    ).json()
    assert out["trackable"] is False
    event = {
        "id": str(uuid4()),
        "name": "experiment_exposure",
        "experiment_id": exp["id"],
        "variant": "forged",
        "experiment_version": 2,
    }
    token = (
        await admin.post(
            "/api/v1/sessions",
            json={"analytics": True, "marketing": False, "consent_version": "qa"},
        )
    ).json()["session_token"]
    assert (
        await admin.post("/api/v1/events/batch", json={"session_token": token, "events": [event]})
    ).status_code == 422
