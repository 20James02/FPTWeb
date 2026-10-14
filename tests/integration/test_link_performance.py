from urllib.parse import parse_qs, urlparse
from uuid import uuid4

import psycopg


async def make_link(admin, **changes):
    body = {
        "title": "Camera video A",
        "slug": "camera-video-a",
        "target": "/",
        "platform": "facebook",
        "utm_medium": "social",
        "utm_campaign": "camera_oct",
        "utm_content": "video_a",
        "content_note": "Hook camera gia đình",
        "active": True,
    }
    body.update(changes)
    response = await admin.post("/api/v1/admin/link-performance", json=body)
    assert response.status_code == 201, response.text
    return response.json()


async def source(admin, link):
    response = await admin.get("/r/" + link["slug"], follow_redirects=False)
    assert response.status_code == 302, response.text
    return parse_qs(urlparse(response.headers["location"]).query)["pf_link_source"][0]


async def report_row(admin, id):
    response = await admin.get("/api/v1/admin/link-performance/report")
    assert response.status_code == 200, response.text
    return next(row for row in response.json()["items"] if row["id"] == id)


async def test_link_metadata_author_and_version_are_server_owned(admin):
    link = await make_link(admin)
    assert link["created_by"]
    assert link["creator_name"]
    assert link["version"] == 1
    saved = await admin.put(
        "/api/v1/admin/link-performance/" + link["id"],
        json={**link["payload"], "expected_version": 1, "content_note": "Updated content"},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["created_by"] == link["created_by"]
    assert saved.json()["created_at"] == link["created_at"]
    stale = await admin.put(
        "/api/v1/admin/link-performance/" + link["id"],
        json={**link["payload"], "expected_version": 1},
    )
    assert stale.status_code == 409
    forbidden = await admin.post(
        "/api/v1/admin/link-performance", json={**link["payload"], "created_by": str(uuid4())}
    )
    assert forbidden.status_code == 422


async def test_clicks_exclude_head_and_separate_link_preview_bots(admin):
    link = await make_link(admin)
    assert (await admin.head("/r/" + link["slug"])).status_code == 302
    await source(admin, link)
    assert (
        await admin.get(
            "/r/" + link["slug"],
            headers={"User-Agent": "facebookexternalhit/1.1"},
            follow_redirects=False,
        )
    ).status_code == 302
    row = await report_row(admin, link["id"])
    assert row["raw_clicks"] == 2
    assert row["bot_clicks"] == 1
    assert row["clicks"] == 1
    assert row["average_engagement_ms"] is None
    assert row["ranking"]["state"] == "insufficient"


async def test_form_retry_and_staff_close_are_counted_from_database(admin, gateway):
    link = await make_link(admin)
    token = await source(admin, link)
    key = uuid4().hex
    body = {"phone": "0981234567", "consent_version": "qa", "link_source_token": token}
    first = await admin.post("/api/v1/leads", headers={"Idempotency-Key": key}, json=body)
    assert first.status_code == 201, first.text
    again = await admin.post("/api/v1/leads", headers={"Idempotency-Key": key}, json=body)
    assert again.status_code == 200, again.text
    with psycopg.connect(gateway.dsn) as db:
        id = str(
            db.execute(
                "SELECT id FROM private.leads WHERE receipt=%s", [first.json()["receipt"]]
            ).fetchone()[0]
        )
        db.execute("UPDATE private.leads SET status='closed' WHERE id=%s", [id])
    row = await report_row(admin, link["id"])
    assert row["forms"] == 1
    assert row["closed"] == 1
    assert row["installed"] == 0
    with psycopg.connect(gateway.dsn) as db:
        db.execute("UPDATE private.leads SET status='installed' WHERE id=%s", [id])
    row = await report_row(admin, link["id"])
    assert row["closed"] == 1 and row["installed"] == 1
    with psycopg.connect(gateway.dsn) as db:
        db.execute("UPDATE private.leads SET status='rejected' WHERE id=%s", [id])
    row = await report_row(admin, link["id"])
    assert row["closed"] == 0 and row["installed"] == 0
    assert row["forms"] == 1


async def test_forged_source_does_not_drop_form_or_inflate_link(admin):
    link = await make_link(admin)
    response = await admin.post(
        "/api/v1/leads",
        headers={"Idempotency-Key": uuid4().hex},
        json={"phone": "0981234567", "consent_version": "qa", "link_source_token": "forged"},
    )
    assert response.status_code == 201, response.text
    assert (await report_row(admin, link["id"]))["forms"] == 0


async def test_consent_gates_measurement_and_revoke_removes_journey(admin, gateway):
    link = await make_link(admin)
    src = await source(admin, link)
    session = (
        await admin.post(
            "/api/v1/sessions",
            json={"analytics": False, "marketing": False, "consent_version": "qa"},
        )
    ).json()["session_token"]
    body = {"source_token": src, "session_token": session}
    blocked = await admin.post("/api/v1/link-tracking/visit", json=body)
    assert blocked.status_code == 403, blocked.text
    await admin.put(
        "/api/v1/consent",
        json={
            "session_token": session,
            "analytics": True,
            "marketing": False,
            "consent_version": "qa",
        },
    )
    visit = await admin.post("/api/v1/link-tracking/visit", json=body)
    assert visit.status_code == 201, visit.text
    data = visit.json()
    assert (await report_row(admin, link["id"]))["average_engagement_ms"] is None
    page_id = str(uuid4())
    event = {
        "visit_token": data["visit_token"],
        "session_token": session,
        "page_id": page_id,
        "sequence": 1,
        "total_ms": 10000,
    }
    with psycopg.connect(gateway.dsn) as db:
        db.execute(
            "UPDATE private.link_visits SET checkpoint_at=now()-interval '15 seconds' WHERE id=%s",
            [data["id"]],
        )
    assert (await admin.post("/api/v1/link-tracking/engagement", json=event)).status_code == 200
    assert (await admin.post("/api/v1/link-tracking/engagement", json=event)).status_code == 200
    row = await report_row(admin, link["id"])
    assert row["measured_visits"] == 1
    assert row["average_engagement_ms"] == 10000
    await admin.put(
        "/api/v1/consent",
        json={
            "session_token": session,
            "analytics": False,
            "marketing": False,
            "consent_version": "qa",
        },
    )
    assert (
        await admin.post(
            "/api/v1/link-tracking/engagement", json={**event, "sequence": 2, "total_ms": 20000}
        )
    ).status_code == 403
    with psycopg.connect(gateway.dsn) as db:
        assert (
            db.execute(
                "SELECT count(*) FROM private.link_visits WHERE id=%s", [data["id"]]
            ).fetchone()[0]
            == 0
        )


async def test_private_registry_and_report_cannot_be_read_by_guest(client, admin, gateway):
    await make_link(admin)
    assert (
        await client.get("/api/v1/admin/link-performance/report", headers={"Authorization": ""})
    ).status_code == 401
    with psycopg.connect(gateway.dsn) as db:
        for role in ["anon", "authenticated"]:
            assert not db.execute(
                "SELECT has_table_privilege(%s,'private.marketing_links','SELECT')", [role]
            ).fetchone()[0]


async def test_legacy_voucher_links_are_in_registry_without_fabricated_clicks(admin):
    from tests.integration.test_vouchers import create

    voucher = await create(admin)
    response = await admin.post(
        "/api/v1/admin/vouchers/" + voucher["id"] + "/links",
        json={"slug": "legacy-share", "channel": "zalo", "content_note": "Zalo post"},
    )
    assert response.status_code == 201, response.text
    registry = await admin.get("/api/v1/admin/link-performance")
    assert registry.status_code == 200, registry.text
    row = next(r for r in registry.json()["items"] if r["slug"] == "legacy-share")
    assert row["kind"] == "voucher"
    assert row["created_by"]
    assert row["payload"]["content_note"] == "Zalo post"
    assert (await report_row(admin, row["id"]))["raw_clicks"] == 0
    redirected = await admin.get("/s/legacy-share", follow_redirects=False)
    assert redirected.status_code == 302
    assert (await report_row(admin, row["id"]))["clicks"] == 1


async def test_edit_voucher_note_preserves_existing_custom_channel(admin):
    from tests.integration.test_vouchers import create

    voucher = await create(admin)
    await admin.post(
        "/api/v1/admin/vouchers/" + voucher["id"] + "/links",
        json={"slug": "partner-link", "channel": "partner-a"},
    )
    rows = (await admin.get("/api/v1/admin/link-performance")).json()["items"]
    row = next(x for x in rows if x["slug"] == "partner-link")
    result = await admin.put(
        "/api/v1/admin/link-performance/" + row["id"],
        json={**row["payload"], "content_note": "Partner note", "expected_version": row["version"]},
    )
    assert result.status_code == 200, result.text
    assert result.json()["payload"]["platform"] == "partner-a"


async def test_new_content_requires_known_platform(admin):
    response = await admin.post(
        "/api/v1/admin/link-performance",
        json={"title": "Invalid platform", "slug": "bad-platform", "platform": "made-up"},
    )
    assert response.status_code == 422


async def linked_lead(admin, gateway, link, **extra):
    proof = await source(admin, link)
    response = await admin.post(
        "/api/v1/leads",
        headers={"Idempotency-Key": uuid4().hex},
        json={"phone": "0981234567", "consent_version": "qa", "link_source_token": proof, **extra},
    )
    assert response.status_code == 201, response.text
    with psycopg.connect(gateway.dsn) as db:
        return str(
            db.execute(
                "SELECT id FROM private.leads WHERE receipt=%s", [response.json()["receipt"]]
            ).fetchone()[0]
        )


async def test_close_and_cancel_use_real_staff_transition_actor(admin, gateway):
    link = await make_link(admin)
    lid = await linked_lead(admin, gateway, link)
    actor = (await admin.get("/api/v1/admin/me")).json()["id"]
    with psycopg.connect(gateway.dsn) as db:
        db.execute("UPDATE private.leads SET status='qualified' WHERE id=%s", [lid])
    version = (await admin.get("/api/v1/admin/leads/" + lid)).json()["version"]
    closed = await admin.post(
        "/api/v1/admin/leads/" + lid + "/transitions",
        json={"expected_version": version, "status": "closed"},
    )
    assert closed.status_code == 200, closed.text
    data = (await admin.get("/api/v1/admin/link-performance/report?link_id=" + link["id"])).json()
    assert data["items"][0]["closed"] == 1
    assert data["closers"][0]["closer_id"] == actor
    assert data["closers"][0]["closed"] == 1
    cancelled = await admin.post(
        "/api/v1/admin/leads/" + lid + "/transitions",
        json={
            "expected_version": closed.json()["version"],
            "status": "rejected",
            "reason": "QA cancellation",
        },
    )
    assert cancelled.status_code == 200, cancelled.text
    assert (await report_row(admin, link["id"]))["closed"] == 0


async def test_privacy_erasure_keeps_only_anonymous_totals(admin, gateway):
    link = await make_link(admin)
    lid = await linked_lead(admin, gateway, link)
    with psycopg.connect(gateway.dsn) as db:
        db.execute("UPDATE private.leads SET status='closed' WHERE id=%s", [lid])
    requested = await admin.post(
        "/api/v1/admin/privacy/requests",
        json={"lead_id": lid, "action": "delete", "reason": "QA erasure"},
    )
    assert requested.status_code == 201, requested.text
    done = await admin.post("/api/v1/admin/privacy/requests/" + requested.json()["id"] + "/execute")
    assert done.status_code == 200, done.text
    row = await report_row(admin, link["id"])
    assert row["forms"] == 1 and row["closed"] == 1 and row["erased"] == 1
    with psycopg.connect(gateway.dsn) as db:
        assert (
            db.execute(
                "SELECT count(*) FROM private.link_results WHERE lead_id=%s", [lid]
            ).fetchone()[0]
            == 0
        )
    assert lid not in str(row)


async def test_report_sort_page_and_cohort_use_source_date(admin, gateway):
    from datetime import UTC, datetime, timedelta
    from types import SimpleNamespace

    from pagefpt.api.dependencies import crypto

    a = await make_link(admin)
    b = await make_link(admin, slug="second-source", title="Second")
    when = datetime.now(UTC) - timedelta(days=8)
    signed = crypto(SimpleNamespace(app=admin._transport.app)).sign(
        {
            "purpose": "link_source",
            "link_id": a["id"],
            "version": a["version"],
            "acquired_at": when.isoformat(),
            "exp": (datetime.now(UTC) + timedelta(days=1)).timestamp(),
        }
    )
    result = await admin.post(
        "/api/v1/leads",
        headers={"Idempotency-Key": uuid4().hex},
        json={"phone": "0981234567", "consent_version": "qa", "link_source_token": signed},
    )
    assert result.status_code == 201, result.text
    sorted_data = (
        await admin.get("/api/v1/admin/link-performance/report?order=forms&direction=desc&limit=1")
    ).json()
    assert sorted_data["total_count"] == 2 and sorted_data["items"][0]["id"] == a["id"]
    reverse = (
        await admin.get("/api/v1/admin/link-performance/report?order=forms&direction=asc&limit=1")
    ).json()
    assert reverse["items"][0]["id"] == b["id"]
    with psycopg.connect(gateway.dsn) as db:
        day = db.execute(
            "SELECT acquired_day FROM private.link_results WHERE link_id=%s", [a["id"]]
        ).fetchone()[0]
        assert (datetime.now(UTC).date() - day).days in [7, 8]
    today = datetime.now(UTC).date().isoformat()
    current = (
        await admin.get("/api/v1/admin/link-performance/report?start=" + today + "&end=" + today)
    ).json()
    assert current["totals"]["forms"] == 0


async def test_reordered_and_multi_page_checkpoints_cannot_exceed_elapsed_time(admin, gateway):
    link = await make_link(admin)
    proof = await source(admin, link)
    session = (
        await admin.post(
            "/api/v1/sessions",
            json={"analytics": True, "marketing": False, "consent_version": "qa"},
        )
    ).json()["session_token"]
    visit = (
        await admin.post(
            "/api/v1/link-tracking/visit", json={"source_token": proof, "session_token": session}
        )
    ).json()
    with psycopg.connect(gateway.dsn) as db:
        db.execute(
            "UPDATE private.link_visits SET checkpoint_at=now()-interval '3 seconds' WHERE id=%s",
            [visit["id"]],
        )
    page_id = str(uuid4())
    packet = {
        "session_token": session,
        "visit_token": visit["visit_token"],
        "page_id": page_id,
        "sequence": 2,
        "total_ms": 100000,
    }
    first = await admin.post("/api/v1/link-tracking/engagement", json=packet)
    assert first.status_code == 200, first.text
    assert 2900 <= first.json()["accepted_ms"] < 4000
    late = await admin.post(
        "/api/v1/link-tracking/engagement", json={**packet, "sequence": 1, "total_ms": 200000}
    )
    assert late.json()["replayed"] and late.json()["accepted_ms"] == 0
    concurrent = await admin.post(
        "/api/v1/link-tracking/engagement", json={**packet, "page_id": str(uuid4())}
    )
    assert concurrent.json()["accepted_ms"] < 1000


async def test_expired_or_invalid_journey_does_not_discard_valid_link_source(admin, gateway):
    link = await make_link(admin)
    await linked_lead(admin, gateway, link, link_visit_token="expired-or-forged-journey")
    assert (await report_row(admin, link["id"]))["forms"] == 1


async def test_source_fields_cannot_change_after_clicks(admin):
    link = await make_link(admin)
    await source(admin, link)
    result = await admin.put(
        "/api/v1/admin/link-performance/" + link["id"],
        json={**link["payload"], "expected_version": link["version"], "platform": "google"},
    )
    assert result.status_code == 422, result.text
    assert result.json()["code"] == "LINK_SOURCE_IMMUTABLE"


async def test_content_unknown_platform_is_rejected_on_update(admin):
    link = await make_link(admin)
    result = await admin.put(
        "/api/v1/admin/link-performance/" + link["id"],
        json={**link["payload"], "expected_version": link["version"], "platform": "made-up"},
    )
    assert result.status_code == 422, result.text


async def test_report_can_sort_metadata_and_statistical_rank(admin, gateway):
    from datetime import date, timedelta

    a = await make_link(admin, title="Zulu")
    b = await make_link(admin, slug="alpha-link", title="Alpha", platform="google")
    day = date.today() - timedelta(days=8)
    with psycopg.connect(gateway.dsn) as db:
        for link, converted, closed in [(a, 50, 20), (b, 5, 1)]:
            db.execute(
                "INSERT INTO private.link_daily(link_id,day,raw_clicks,forms,closed,measured_visits,measured_forms,measured_closed) VALUES(%s,%s,200,%s,%s,100,%s,%s)",
                [link["id"], day, converted, closed, converted, closed],
            )
    title = await admin.get("/api/v1/admin/link-performance/report?order=title&direction=asc")
    assert title.status_code == 200, title.text
    assert [r["id"] for r in title.json()["items"]] == [b["id"], a["id"]]
    ranked = await admin.get(
        "/api/v1/admin/link-performance/report?order=ranking_score&direction=desc"
    )
    assert ranked.status_code == 200, ranked.text
    assert [r["id"] for r in ranked.json()["items"]] == [a["id"], b["id"]]
    assert ranked.json()["items"][0]["ranking"]["state"] == "ready"
    row = ranked.json()["items"][0]
    assert abs(float(row["ranking_score"]) - row["ranking"]["score"]) < 0.001


async def test_parallel_duplicate_visit_creation_reuses_one_measured_journey(admin):
    import asyncio

    link = await make_link(admin)
    proof = await source(admin, link)
    session = (
        await admin.post(
            "/api/v1/sessions",
            json={"analytics": True, "marketing": False, "consent_version": "qa"},
        )
    ).json()["session_token"]
    body = {"source_token": proof, "session_token": session}
    responses = await asyncio.gather(
        *(admin.post("/api/v1/link-tracking/visit", json=body) for _ in range(3))
    )
    assert all(r.status_code == 201 for r in responses)
    assert len({r.json()["id"] for r in responses}) == 1
    assert (await report_row(admin, link["id"]))["measured_visits"] == 1


async def test_service_targets_match_real_public_routes(admin):
    valid = await admin.post(
        "/api/v1/admin/link-performance",
        json={
            "title": "Internet content",
            "slug": "internet-content",
            "target": "/san-pham/internet-gia-dinh",
            "platform": "seo",
        },
    )
    assert valid.status_code == 201, valid.text
    broken = await admin.post(
        "/api/v1/admin/link-performance",
        json={
            "title": "Broken target",
            "slug": "broken-target",
            "target": "/san-pham/internet",
            "platform": "seo",
        },
    )
    assert broken.status_code == 422, broken.text


async def test_staff_close_and_heartbeat_do_not_deadlock(admin, gateway):
    import asyncio

    link = await make_link(admin)
    proof = await source(admin, link)
    session = (
        await admin.post(
            "/api/v1/sessions",
            json={"analytics": True, "marketing": False, "consent_version": "qa"},
        )
    ).json()["session_token"]
    visit = (
        await admin.post(
            "/api/v1/link-tracking/visit", json={"source_token": proof, "session_token": session}
        )
    ).json()
    lid = await linked_lead(
        admin, gateway, link, session_token=session, link_visit_token=visit["visit_token"]
    )
    with psycopg.connect(gateway.dsn) as db:
        db.execute("UPDATE private.leads SET status='qualified' WHERE id=%s", [lid])
        db.execute(
            "CREATE FUNCTION private.link_test_barrier() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(771902); RETURN NEW; END $$"
        )
        db.execute(
            "CREATE TRIGGER link_test_barrier BEFORE UPDATE ON private.link_daily FOR EACH ROW WHEN(OLD.closed IS DISTINCT FROM NEW.closed) EXECUTE FUNCTION private.link_test_barrier()"
        )
    version = (await admin.get("/api/v1/admin/leads/" + lid)).json()["version"]
    tasks = []

    async def wait_for(sql):
        for _ in range(300):
            with psycopg.connect(gateway.dsn) as db:
                if db.execute(sql).fetchone()[0]:
                    return
            await asyncio.sleep(0.01)
        raise AssertionError("Concurrency barrier not reached")

    try:
        with psycopg.connect(gateway.dsn) as blocker:
            blocker.execute("SELECT pg_advisory_xact_lock(771902)")
            tasks.append(
                asyncio.create_task(
                    admin.post(
                        "/api/v1/admin/leads/" + lid + "/transitions",
                        json={"expected_version": version, "status": "closed"},
                    )
                )
            )
            await wait_for(
                "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=771902 AND NOT granted)"
            )
            tasks.append(
                asyncio.create_task(
                    admin.post(
                        "/api/v1/link-tracking/engagement",
                        json={
                            "session_token": session,
                            "visit_token": visit["visit_token"],
                            "page_id": str(uuid4()),
                            "sequence": 1,
                            "total_ms": 1000,
                        },
                    )
                )
            )
            await wait_for(
                "SELECT count(*)>=2 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT api.dispatch%'"
            )
            blocker.commit()
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        assert all(not isinstance(r, Exception) and r.status_code == 200 for r in responses), str(
            responses
        )
        assert (await report_row(admin, link["id"]))["closed"] == 1
    finally:
        await asyncio.gather(*tasks, return_exceptions=True)
        with psycopg.connect(gateway.dsn) as db:
            db.execute("DROP TRIGGER IF EXISTS link_test_barrier ON private.link_daily")
            db.execute("DROP FUNCTION private.link_test_barrier()")


async def test_voucher_platform_edit_does_not_relabel_historical_clicks(admin):
    from tests.integration.test_vouchers import create

    voucher = await create(admin)
    path = "/api/v1/admin/vouchers/" + voucher["id"] + "/links"
    await admin.post(path, json={"slug": "mixed-source", "channel": "facebook"})
    await admin.get("/s/mixed-source", follow_redirects=False)
    source_token = (await admin.get("/api/v1/link-tracking/context")).json()["source_token"]
    await admin.post(path, json={"slug": "mixed-source", "channel": "zalo"})
    await admin.get("/s/mixed-source", follow_redirects=False)
    accepted = await admin.post(
        "/api/v1/leads",
        headers={"Idempotency-Key": uuid4().hex},
        json={"phone": "0981234567", "consent_version": "qa", "link_source_token": source_token},
    )
    assert accepted.status_code == 201, accepted.text
    first = (await admin.get("/api/v1/admin/link-performance/report?platform=facebook")).json()
    second = (await admin.get("/api/v1/admin/link-performance/report?platform=zalo")).json()
    assert first["totals"]["clicks"] == 1 and first["totals"]["forms"] == 1
    assert second["totals"]["clicks"] == 1 and second["totals"]["forms"] == 0


async def test_late_consent_does_not_make_a_new_journey_look_mature(admin):
    from datetime import UTC, datetime, timedelta
    from types import SimpleNamespace

    from pagefpt.api.dependencies import crypto

    link = await make_link(admin)
    signed = crypto(SimpleNamespace(app=admin._transport.app)).sign(
        {
            "purpose": "link_source",
            "link_id": link["id"],
            "version": link["version"],
            "acquired_at": (datetime.now(UTC) - timedelta(days=8)).isoformat(),
            "exp": (datetime.now(UTC) + timedelta(days=1)).timestamp(),
        }
    )
    session = (
        await admin.post(
            "/api/v1/sessions",
            json={"analytics": True, "marketing": False, "consent_version": "qa"},
        )
    ).json()["session_token"]
    assert (
        await admin.post(
            "/api/v1/link-tracking/visit", json={"source_token": signed, "session_token": session}
        )
    ).status_code == 201
    row = await report_row(admin, link["id"])
    assert row["measured_visits"] == 1
    assert row["mature_visits"] == 0


async def test_voucher_edit_and_registry_toggle_do_not_deadlock(admin, gateway):
    import asyncio

    from tests.integration.test_vouchers import create

    voucher = await create(admin)
    body = {"slug": "concurrent-voucher", "channel": "facebook"}
    assert (
        await admin.post("/api/v1/admin/vouchers/" + voucher["id"] + "/links", json=body)
    ).status_code == 201
    row = next(
        x
        for x in (await admin.get("/api/v1/admin/link-performance")).json()["items"]
        if x["slug"] == body["slug"]
    )
    with psycopg.connect(gateway.dsn) as db:
        original = db.execute(
            "SELECT pg_get_functiondef('private.link_dispatch(jsonb)'::regprocedure)"
        ).fetchone()[0]
        boundary = (
            "SELECT * INTO m FROM private.marketing_links WHERE id=(c->>'id')::uuid FOR UPDATE;"
        )
        assert boundary in original
        db.execute(original.replace(boundary, boundary + " PERFORM pg_advisory_xact_lock(771903);"))

    async def wait_for(sql):
        for _ in range(300):
            with psycopg.connect(gateway.dsn) as db:
                if db.execute(sql).fetchone()[0]:
                    return
            await asyncio.sleep(0.01)
        raise AssertionError("Concurrency barrier not reached")

    tasks = []
    try:
        with psycopg.connect(gateway.dsn) as blocker:
            blocker.execute("SELECT pg_advisory_xact_lock(771903)")
            tasks.append(
                asyncio.create_task(
                    admin.put(
                        "/api/v1/admin/link-performance/" + row["id"],
                        json={
                            **row["payload"],
                            "active": False,
                            "expected_version": row["version"],
                        },
                    )
                )
            )
            await wait_for(
                "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=771903 AND NOT granted)"
            )
            tasks.append(
                asyncio.create_task(
                    admin.post(
                        "/api/v1/admin/vouchers/" + voucher["id"] + "/links",
                        json={**body, "content_note": "Concurrent edit"},
                    )
                )
            )
            await wait_for(
                "SELECT count(*)>=2 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT api.dispatch%'"
            )
            blocker.commit()
        result = await asyncio.gather(*tasks)
        assert [r.status_code for r in result] == [200, 201], [r.text for r in result]
    finally:
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        with psycopg.connect(gateway.dsn) as db:
            db.execute(original)


async def test_engagement_request_and_page_storage_are_bounded(admin, gateway):
    link = await make_link(admin)
    proof = await source(admin, link)
    session = (
        await admin.post(
            "/api/v1/sessions",
            json={"analytics": True, "marketing": False, "consent_version": "qa"},
        )
    ).json()["session_token"]
    visit = (
        await admin.post(
            "/api/v1/link-tracking/visit", json={"source_token": proof, "session_token": session}
        )
    ).json()
    body = {
        "session_token": session,
        "visit_token": visit["visit_token"],
        "page_id": str(uuid4()),
        "sequence": 1,
        "total_ms": 0,
    }
    statuses = []
    for i in range(30):
        statuses.append(
            (
                await admin.post(
                    "/api/v1/link-tracking/engagement", json={**body, "sequence": i + 1}
                )
            ).status_code
        )
    assert 429 in statuses, "Burst writes must be rate limited"
    with psycopg.connect(gateway.dsn) as db:
        db.execute("DELETE FROM private.rate_buckets WHERE key LIKE 'link-engagement:%'")
        db.execute(
            "INSERT INTO private.link_visit_pages(visit_id,page_id,sequence,total_ms) SELECT %s,gen_random_uuid(),1,0 FROM generate_series(1,128) ON CONFLICT DO NOTHING",
            [visit["id"]],
        )
    over = await admin.post(
        "/api/v1/link-tracking/engagement", json={**body, "page_id": str(uuid4())}
    )
    assert over.status_code == 429, over.text


async def test_erased_closed_lead_does_not_lose_measured_success_on_resumed_visit(admin, gateway):
    link = await make_link(admin)
    proof = await source(admin, link)

    async def session():
        return (
            await admin.post(
                "/api/v1/sessions",
                json={"analytics": True, "marketing": False, "consent_version": "qa"},
            )
        ).json()["session_token"]

    a = await session()
    visit = (
        await admin.post(
            "/api/v1/link-tracking/visit", json={"source_token": proof, "session_token": a}
        )
    ).json()
    first = await linked_lead(
        admin, gateway, link, session_token=a, link_visit_token=visit["visit_token"]
    )
    with psycopg.connect(gateway.dsn) as db:
        db.execute("UPDATE private.leads SET status='closed' WHERE id=%s", [first])
    b = await session()
    resumed = (
        await admin.post(
            "/api/v1/link-tracking/visit",
            json={"source_token": proof, "session_token": b, "visit_token": visit["visit_token"]},
        )
    ).json()
    assert resumed["id"] == visit["id"]
    second = await linked_lead(
        admin,
        gateway,
        link,
        phone="0971234567",
        session_token=b,
        link_visit_token=resumed["visit_token"],
    )
    erase = await admin.post(
        "/api/v1/admin/privacy/requests",
        json={"lead_id": first, "action": "delete", "reason": "QA erasure"},
    )
    assert (
        await admin.post("/api/v1/admin/privacy/requests/" + erase.json()["id"] + "/execute")
    ).status_code == 200
    with psycopg.connect(gateway.dsn) as db:
        db.execute("UPDATE private.leads SET status='contacting' WHERE id=%s", [second])
    row = await report_row(admin, link["id"])
    assert row["forms"] == 2 and row["closed"] == 1 and row["erased"] == 1
    with psycopg.connect(gateway.dsn) as db:
        measured = db.execute(
            "SELECT sum(measured_forms),sum(measured_closed) FROM private.link_daily WHERE link_id=%s",
            [link["id"]],
        ).fetchone()
    assert measured == (1, 1)


async def test_new_source_revision_creates_separate_measured_cohort(admin, gateway):
    from tests.integration.test_vouchers import create

    voucher = await create(admin)
    body = {"slug": "revision-journey", "channel": "facebook"}
    await admin.post("/api/v1/admin/vouchers/" + voucher["id"] + "/links", json=body)

    async def voucher_source():
        redirected = await admin.get("/s/" + body["slug"], follow_redirects=False)
        assert redirected.status_code == 302
        return (await admin.get("/api/v1/link-tracking/context")).json()["source_token"]

    first_source = await voucher_source()
    session = (
        await admin.post(
            "/api/v1/sessions",
            json={"analytics": True, "marketing": False, "consent_version": "qa"},
        )
    ).json()["session_token"]
    first = (
        await admin.post(
            "/api/v1/link-tracking/visit",
            json={"source_token": first_source, "session_token": session},
        )
    ).json()
    await admin.post(
        "/api/v1/admin/vouchers/" + voucher["id"] + "/links", json={**body, "channel": "zalo"}
    )
    new_source = await voucher_source()
    second = (
        await admin.post(
            "/api/v1/link-tracking/visit",
            json={
                "source_token": new_source,
                "session_token": session,
                "visit_token": first["visit_token"],
            },
        )
    ).json()
    assert second["id"] != first["id"], (
        "A new channel revision must have a separate measured cohort"
    )
    saved = await admin.post(
        "/api/v1/leads",
        headers={"Idempotency-Key": uuid4().hex},
        json={
            "phone": "0981234567",
            "consent_version": "qa",
            "link_source_token": new_source,
            "session_token": session,
            "link_visit_token": first["visit_token"],
        },
    )
    assert saved.status_code == 201, saved.text
    with psycopg.connect(gateway.dsn) as db:
        result = db.execute(
            "SELECT r.visit_id FROM private.link_results r JOIN private.leads l ON l.id=r.lead_id WHERE l.receipt=%s",
            [saved.json()["receipt"]],
        ).fetchone()
    assert result[0] is None, (
        "Optional mismatched old journey must not attribute new form to old platform"
    )
