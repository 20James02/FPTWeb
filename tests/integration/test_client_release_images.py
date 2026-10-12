from uuid import uuid4

import httpx
import psycopg
import pytest
from psycopg.types.json import Jsonb

from pagefpt.application import create_app
from pagefpt.core.config import Settings


@pytest.mark.parametrize("environment", ["staging", "production"])
async def test_deployed_client_routes_exist_without_demo_promotions(environment, gateway):
    settings = Settings(
        _env_file=None,
        environment=environment,
        supabase_url="https://test.supabase.co",
        supabase_secret="test-service-role",
        encryption_key="e" * 32,
        matching_key="m" * 32,
        token_key="t" * 32,
        job_secret="j" * 32,
    )
    app = create_app(settings, gateway)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="https://test"
        ) as browser:
            for path in ["/", "/san-pham/internet-gia-dinh", "/khuyen-mai", "/chinh-sach-bao-mat"]:
                response = await browser.get(path)
                assert response.status_code == 200, (path, response.text)
                assert "Tặng Tới 2 Tháng" not in response.text
                assert "tặng đến 2 tháng" not in response.text
            assert (await browser.get("/api/v1/admin/me")).status_code == 401


def ready_asset(gateway, state="ready"):
    asset_id = str(uuid4())
    with psycopg.connect(gateway.dsn) as db:
        db.execute(
            "INSERT INTO private.resources(id,kind,payload) VALUES(%s,'media',%s)",
            [
                asset_id,
                Jsonb(
                    {
                        "state": state,
                        "object_key": "images/" + "a" * 64 + ".webp",
                        "url": "https://media.example.test/images/" + "a" * 64 + ".webp",
                        "width": 1200,
                        "height": 800,
                    }
                ),
            ],
        )
    return asset_id


async def test_plan_image_uses_ready_asset_and_published_snapshot(admin, gateway):
    admin._transport.app.state.settings.media_domain = "https://media.example.test"
    asset_id = ready_asset(gateway)
    payload = {
        "name": "Gói có ảnh",
        "service": "internet",
        "code": "plan-image",
        "image_id": asset_id,
        "image_alt": "Ảnh gói <QA>",
    }
    created = await admin.post("/api/v1/admin/plans", json=payload)
    assert created.status_code == 201, created.text
    plan = created.json()
    assert plan["payload"]["image_url"].startswith("https://media.example.test/images/")
    assert plan["payload"]["image_width"] == 1200
    assert (await admin.get("/api/v1/catalog")).json()["items"] == []
    published = (
        await admin.post(
            f"/api/v1/admin/plans/{plan['id']}/publish", json={"expected_version": plan["version"]}
        )
    ).json()
    home = (await admin.get("/")).text
    assert 'alt="Ảnh gói &lt;QA&gt;"' in home
    assert f'src="{plan["payload"]["image_url"]}"' in home
    removed = await admin.put(
        f"/api/v1/admin/plans/{plan['id']}?expected_version={published['version']}",
        json={**payload, "image_id": None},
    )
    assert removed.status_code == 200, removed.text
    assert removed.json()["payload"].get("image_url") is None
    assert (await admin.get("/api/v1/catalog")).json()["items"][0]["image_id"] == asset_id
    assert (
        await admin.post(
            f"/api/v1/admin/plans/{plan['id']}/publish",
            json={"expected_version": removed.json()["version"]},
        )
    ).status_code == 200
    assert (await admin.get("/api/v1/catalog")).json()["items"][0].get("image_url") is None


@pytest.mark.parametrize("asset", ["quarantine", "missing"])
async def test_unvalidated_or_missing_plan_image_is_rejected(admin, gateway, asset):
    image_id = ready_asset(gateway, "quarantine") if asset == "quarantine" else str(uuid4())
    response = await admin.post(
        "/api/v1/admin/plans",
        json={
            "name": "Invalid image",
            "service": "internet",
            "code": "invalid-image",
            "image_id": image_id,
        },
    )
    assert response.status_code in {404, 422}, response.text
    assert response.json()["code"] == (
        "INVALID_PLAN_IMAGE" if asset == "quarantine" else "NOT_FOUND"
    )


async def test_plan_image_url_cannot_be_supplied_by_browser(admin):
    response = await admin.post(
        "/api/v1/admin/plans",
        json={
            "name": "Unsafe image",
            "service": "internet",
            "code": "unsafe-image",
            "image_url": "javascript:alert(1)",
        },
    )
    assert response.status_code == 422
    assert response.json()["fields"]["body.image_url"] == "extra_forbidden"


async def test_plan_update_does_not_accept_quarantined_image(admin, gateway):
    created = (
        await admin.post(
            "/api/v1/admin/plans",
            json={
                "name": "Original plan",
                "service": "internet",
                "code": "original-plan",
            },
        )
    ).json()
    response = await admin.put(
        f"/api/v1/admin/plans/{created['id']}?expected_version={created['version']}",
        json={**created["payload"], "image_id": ready_asset(gateway, "quarantine")},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "INVALID_PLAN_IMAGE"
    stored = (await admin.get(f"/api/v1/admin/plans/{created['id']}")).json()
    assert stored["version"] == created["version"]
    assert stored["payload"].get("image_id") is None


async def test_uploaded_image_is_finalized_to_webp_before_linking_plan(admin):
    import io

    from PIL import Image

    stream = io.BytesIO()
    Image.new("RGB", (600, 400), "orange").save(stream, "PNG")
    objects = {}

    class Storage:
        # Only external S3 I/O is replaced. Validation, SQL, permissions and routes are real.
        def require(self):
            return self

        async def sign_put(self, key, content_type):
            objects[key] = stream.getvalue()
            return "https://upload.example.test/" + key

        async def read(self, key):
            return objects[key]

        async def write(self, key, data, content_type, public=False):
            objects[key] = data

        async def delete(self, key):
            objects.pop(key, None)

    app = admin._transport.app
    app.state.storage = Storage()
    app.state.settings.media_domain = "https://media.example.test"
    intent = await admin.post(
        "/api/v1/admin/media/upload-intents",
        json={
            "filename": "goi-cuoc.png",
            "content_type": "image/png",
            "size_bytes": len(stream.getvalue()),
        },
    )
    assert intent.status_code == 201, intent.text
    finalized = await admin.post(f"/api/v1/admin/media/{intent.json()['id']}/finalize")
    assert finalized.status_code == 200, finalized.text
    image_id = finalized.json()["id"]
    library = (await admin.get("/api/v1/admin/workspace/media?limit=100")).json()["items"]
    media = next(row["payload"] for row in library if row["id"] == image_id)
    assert media["filename"] == "goi-cuoc.png"
    assert media["state"] == "ready"
    assert (media["width"], media["height"]) == (600, 400)
    assert Image.open(io.BytesIO(objects[media["object_key"]])).format == "WEBP"
    assert media["quarantine_key"] not in objects
    plan = await admin.post(
        "/api/v1/admin/plans",
        json={
            "name": "Uploaded plan",
            "code": "uploaded-plan",
            "service": "internet",
            "image_id": image_id,
        },
    )
    assert plan.status_code == 201, plan.text
    assert plan.json()["payload"]["image_url"] == finalized.json()["url"]
