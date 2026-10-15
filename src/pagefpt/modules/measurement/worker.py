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
        secrets = (
            json.loads(crypt.decrypt(command["secret_ciphertext"]))
            if command.get("secret_ciphertext")
            else {}
        )
        command["identifiers"] = (
            json.loads(crypt.decrypt(command["provider_ids_ciphertext"]))
            if command.get("provider_ids_ciphertext")
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
    except (DomainError, ValueError, TypeError):
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
