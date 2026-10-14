import json
from datetime import UTC, datetime

from pagefpt.core.crypto import normalize_phone
from pagefpt.core.errors import DomainError


async def submit_lead(request, input, key, crypt, durable=False):
    if not 8 <= len(key) <= 100:
        raise DomainError("INVALID_IDEMPOTENCY_KEY", 422)
    now = datetime.now(UTC)
    phone = normalize_phone(input.phone)
    semantic = input.model_dump(mode="json")
    semantic["accessory_ids"] = sorted(semantic["accessory_ids"])
    semantic["phone"] = phone
    semantic.pop("challenge_token", None)
    digest = crypt.match(json.dumps(semantic, sort_keys=True, separators=(",", ":")), "request")

    async def replay():
        return await request.app.state.db.rpc(
            "dispatch", {"command": {"op": "lead_replay", "key": key, "digest": digest}}
        )

    if input.accessory_ids:
        previous = await replay()
        if previous.get("replayed"):
            return previous
    pii = {k: semantic.pop(k) for k in ("phone", "name", "installation_address", "notes")}
    for k in (
        "quote_token",
        "session_token",
        "attribution_token",
        "challenge_token",
        "website",
        "link_source_token",
        "link_visit_token",
    ):
        semantic.pop(k, None)
    quote_id, session_id = None, None
    for token, purpose in [(input.quote_token, "quote"), (input.session_token, "session")]:
        if token:
            try:
                claims = crypt.verify(token, purpose, now)
                if purpose == "quote":
                    quote_id = claims["id"]
                else:
                    session_id = claims["id"]
            except DomainError:
                pass  # Invalid quote never discards the customer's request.
    challenge_id = None
    if input.challenge_token:
        try:
            challenge = crypt.verify(input.challenge_token, "challenge", now)
            if challenge["session_id"] == session_id and challenge["phone_hmac"] == crypt.match(
                phone
            ):
                challenge_id = challenge["id"]
        except DomainError:
            pass
    buckets = [
        {
            "key": crypt.match(phone, "rate-phone"),
            "capacity": 3,
            "rate": 1 / 600,
            "mode": "challenge",
        }
    ]
    if session_id:
        buckets.append(
            {
                "key": crypt.match(session_id, "rate-session"),
                "capacity": 5,
                "rate": 1 / 120,
                "mode": "throttle",
            }
        )
    from pagefpt.api.client_address import trusted_client_ip

    raw_ip = trusted_client_ip(request)
    if raw_ip:
        buckets.append(
            {
                "key": crypt.match(raw_ip, "rate-ip"),
                "capacity": 60,
                "rate": 1 / 10,
                "mode": "throttle",
            }
        )
    from pagefpt.modules.vouchers.service import cookie_context, link_cookie

    if input.voucher_code is None and input.voucher_link is None:
        semantic["voucher_code"] = cookie_context(request).get("code")

    semantic["voucher_link"] = input.voucher_link or (
        link_cookie(request) if input.voucher_code != "" else None
    )
    semantic["phone_masked"] = "***" + phone[-4:]
    from pagefpt.modules.catalog.accessories import selection

    try:
        semantic["accessory_snapshot"] = await selection(
            request, input.plan_id, input.accessory_ids
        )
    except DomainError:
        # A concurrent first submission may have committed while the catalog changed.
        previous = await replay()
        if previous.get("replayed"):
            return previous
        raise
    semantic["risk_evidence"] = {"honeypot": bool(input.website)}
    semantic["risk_source"] = "intake-v1"
    semantic["session_id"] = session_id
    from pagefpt.modules.link_analytics.service import lead_source

    source = await lead_source(request, input, crypt, now)
    if source:
        semantic["link_attribution"] = source
    semantic["ip_ciphertext"] = crypt.encrypt(raw_ip) if raw_ip else None
    from pagefpt.modules.workflow.sla import compute_sla

    sla = compute_sla(now, {"weekdays": [0, 1, 2, 3, 4, 5], "start": "08:00", "end": "18:00"})
    result = await request.app.state.db.rpc(
        "submit_lead",
        {
            "command": {
                "key": key,
                "durable": durable,
                "sla_due_at": sla.isoformat(),
                "digest": digest,
                "phone_hmac": crypt.match(phone),
                "key_version": crypt.key_version,
                "phone_ciphertext": crypt.encrypt(phone),
                "pii_ciphertext": crypt.encrypt(json.dumps(pii, ensure_ascii=False)),
                "payload": semantic,
                "quote_id": quote_id,
                "session_id": session_id,
                "buckets": buckets,
                "honeypot": bool(input.website),
                "challenge_id": challenge_id,
                "notify_admin": request.app.state.settings.telegram_enabled,
            }
        },
    )
    return result
