"""Isolated SQL/Auth fixture for package-image and login browser checks."""

import io
from pathlib import Path

import psycopg
from PIL import Image
from psycopg.types.json import Jsonb

from tests.e2e.integrated_server import app
from tests.e2e.server import _dsn

app.state.settings.media_domain = "https://media.example.test"
stream = io.BytesIO()
Image.new("RGB", (600, 400), "orange").save(stream, "PNG")
fixture_image = stream.getvalue()
Path(".local/qa").mkdir(parents=True, exist_ok=True)
Path(".local/qa/package-upload.png").write_bytes(fixture_image)


class FixtureStorage:
    def require(self):
        return self

    async def sign_put(self, key, content_type):
        return "https://media.example.test/uploads/" + key

    async def read(self, key):
        return fixture_image

    async def write(self, key, data, content_type, public=False):
        pass

    async def delete(self, key):
        pass


app.state.storage = FixtureStorage()
with psycopg.connect(_dsn) as db:
    db.execute(
        "INSERT INTO private.resources(kind,payload) VALUES('media',%s)",
        [
            Jsonb(
                {
                    "filename": "qa-package.png",
                    "state": "ready",
                    "width": 1200,
                    "height": 800,
                    "object_key": "images/" + "a" * 64 + ".webp",
                    "url": "https://media.example.test/images/" + "a" * 64 + ".webp",
                }
            )
        ],
    )
