"""One durable delivery, with a fenced ledger and no external call on form submit."""

import json

from pagefpt.core.errors import DomainError
from pagefpt.modules.measurement.providers import Outcome, deliver


async def process(db, crypt, http, job):
    command = await db.rpc(
        "dispatch", {"command": {"op": "measurement_delivery_prepare", "id": job["entity_id"]}}
    )
    if command["status"] != "ready":
        return {"delivery_status": command["status"]}
    try:
        from pagefpt.modules.measurement.credentials import credentials_for

        secrets = await credentials_for(db, crypt, http, command["connection_id"])
        command["identifiers"] = (
            json.loads(crypt.decrypt(command["provider_ids_ciphertext"]))
            if command.get("provider_ids_ciphertext")
            else {}
        )
        command["client_context"] = (
            json.loads(crypt.decrypt(command["client_context_ciphertext"]))
            if command.get("client_context_ciphertext")
            else {}
        )
        command["click_id"] = (
            crypt.decrypt(command["click_id_ciphertext"])
            if command.get("click_id_ciphertext")
            else None
        )
        result = (
            await deliver(http, command, secrets)
            if http
            else Outcome("disabled", "CONNECTOR_UNCONFIGURED")
        )
    except DomainError as exc:
        result = Outcome("retry" if exc.status == 503 else "failed", exc.code)
    except (ValueError, TypeError):
        result = Outcome("failed", "PROVIDER_INPUT_UNAVAILABLE")
    await db.rpc(
        "dispatch",
        {
            "command": {
                "op": "measurement_delivery_finish",
                "id": job["entity_id"],
                "lease_token": command["lease_token"],
                "state": result.state,
                "code": result.code,
                "provider_id": result.provider_id,
            }
        },
    )
    if result.state == "retry":
        raise DomainError(result.code, 503)
    return {"delivery_status": result.state, "code": result.code}
