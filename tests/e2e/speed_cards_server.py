"""Disposable published data with long copy and one verified image for card layout QA."""

import json
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg.types.json import Jsonb

from tests.e2e.server import _dsn
from tests.e2e.speedtest_server import app, fixture

app.state.settings.media_domain = "https://media.example.test"
with psycopg.connect(_dsn) as db:
    image = str(uuid4())
    db.execute(
        "INSERT INTO private.resources(id,kind,payload) VALUES(%s,'media',%s)",
        [
            image,
            Jsonb(
                {
                    "state": "ready",
                    "width": 600,
                    "height": 400,
                    "object_key": "images/" + "a" * 64 + ".webp",
                    "url": "https://media.example.test/images/" + "a" * 64 + ".webp",
                }
            ),
        ],
    )
    for p in fixture["plans"]:
        p["description"] = "Mô tả QA đầy đủ, đọc trong popup. <script>không thực thi</script>"
        p["equipment"] = [
            "Modem đã công bố",
            "Thiết bị có mô tả dài để kiểm tra khả năng xuống dòng và thao tác",
            "Phụ kiện theo báo giá",
        ]
        p["card_labels"] = {
            "badge": "Nhãn riêng cấu hình từ Admin",
            "speed": "Băng thông",
            "equipment": "Thiết bị theo gói",
            "register": "Đăng ký tư vấn gói này",
            "details": "Xem chi tiết gói",
        }
        if p["speed_mbps"] == 500:
            p["name"] = (
                "Gói cho gia đình có tên dài với nhiều nhu cầu kết nối Internet và giải trí " * 2
            )
        if p["speed_mbps"] == 1000:
            p["image_id"] = image
            p["image_url"] = "https://media.example.test/images/" + "a" * 64 + ".webp"
            p["image_width"] = 600
            p["image_height"] = 400
        payload = {k: v for k, v in p.items() if k != "id"}
        db.execute(
            "UPDATE private.resources SET payload=%s,published_payload=%s WHERE id=%s",
            [Jsonb(payload), Jsonb(payload), p["id"]],
        )
Path(".local/qa/speedtest-fixture.json").write_text(json.dumps(fixture))
