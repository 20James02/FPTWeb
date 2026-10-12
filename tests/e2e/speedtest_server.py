"""Synthetic published catalog for client speed measurement browser checks."""

import json
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg.types.json import Jsonb

from tests.e2e.server import _dsn
from tests.e2e.server import app as app

fixture = {"province": str(uuid4()), "ward": str(uuid4()), "other": str(uuid4()), "plans": []}
with psycopg.connect(_dsn) as db:
    for name, speed, regions, service in [
        ("QA Global100", 100, [], "internet"),
        ("QA Province300", 300, [fixture["province"]], "internet"),
        ("QA Ward500", 500, [fixture["ward"]], "combo"),
        ("QA Global1000", 1000, [], "internet"),
        ("QA Other Region", 200, [fixture["other"]], "internet"),
        ("QA Camera", 300, [], "camera"),
    ]:
        id = str(uuid4())
        payload = {
            "name": name,
            "code": "qa-" + id[:8],
            "speed_mbps": speed,
            "service": service,
            "equipment": ["Thiết bị kiểm thử"],
            "applicable_region_ids": regions,
        }
        db.execute(
            "INSERT INTO private.resources(id,kind,status,payload,published_payload,published_version) VALUES(%s,'plan','published',%s,%s,1)",
            [id, Jsonb(payload), Jsonb(payload)],
        )
        fixture["plans"].append({"id": id, **payload})
Path(".local/qa/speedtest-fixture.json").write_text(json.dumps(fixture))
