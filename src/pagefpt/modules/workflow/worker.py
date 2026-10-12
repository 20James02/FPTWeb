import asyncio
import json
import random
import time
from datetime import UTC, datetime

from pagefpt.core.errors import DomainError
from pagefpt.modules.intelligence.nlp import extract_needs
from pagefpt.modules.intelligence.phone import phone_signals
from pagefpt.modules.intelligence.scoring import RISK, score_lead


class Worker:
    def __init__(
        self,
        db,
        crypt,
        geoip=None,
        storage=None,
        notifications=None,
        conversions=None,
        telegram=None,
    ):
        self.db, self.crypt, self.geoip = db, crypt, geoip
        self.storage = storage
        self.notifications = notifications
        self.conversions = conversions
        self.telegram = telegram

    async def handle(self, job):
        if job["kind"] in {"admin_notice", "telegram_recovery"}:
            from pagefpt.modules.integrations.base import DeliveryResult, DeliveryState

            operation = (
                "telegram_recovery" if job["kind"] == "telegram_recovery" else "admin_notice"
            )
            command = await self.db.rpc(
                "dispatch",
                {"command": {"op": operation + "_prepare", "id": job["id"], "fence": job["fence"]}},
            )
            if command["status"] != "ready":
                return {"delivery_status": command["status"]}
            notice = command["notice"]
            if operation == "telegram_recovery":
                notice["code"] = self.crypt.decrypt(notice.pop("code_ciphertext"))
            result = (
                await self.telegram.deliver(notice)
                if self.telegram
                else DeliveryResult(DeliveryState.DISABLED, "INTEGRATION_DISABLED")
            )
            await self.db.rpc(
                "dispatch",
                {
                    "command": {
                        "op": operation + "_finish",
                        "id": job["id"],
                        "fence": job["fence"],
                        "state": result.state.value,
                        "result": {"code": result.code, "provider_id": result.provider_id},
                    }
                },
            )
            if result.state == DeliveryState.RETRY:
                raise DomainError(result.code, 503, fields={"retry_after": result.retry_after})
            return {"delivery_status": result.state.value, "code": result.code}
        if job["kind"] == "publish_page":
            return await self.db.rpc(
                "dispatch",
                {
                    "command": {
                        "op": "scheduled_publish",
                        "kind": "page",
                        "id": job["entity_id"],
                        **job["job_command"],
                    }
                },
            )
        if job["kind"] == "enrich_local":
            result = await self.db.rpc(
                "dispatch", {"command": {"op": "internal_lead", "id": job["entity_id"]}}
            )
            pii = json.loads(self.crypt.decrypt(result["pii_ciphertext"]))
            evidence: dict = {"phone_valid": True, "fit": {}, "events": result.get("events", [])}
            risk_evidence = result["payload"].get("risk_evidence", {})
            if isinstance(risk_evidence, dict):
                evidence.update(
                    {k: v for k, v in risk_evidence.items() if k in RISK and type(v) is bool}
                )
                evidence["risk_source"] = result["payload"].get("risk_source")
            if result["payload"].get("plan_id"):
                evidence["events"].append({"name": "select_plan", "at": result["created_at"]})
            for observation in result.get("observations", []):
                if observation.get("expires_at") and datetime.fromisoformat(
                    observation["expires_at"]
                ) <= datetime.now(UTC):
                    continue
                if (
                    observation["field"] in {"otp", "contacted", "needs_confirmed"}
                    and observation["status"] == "confirmed"
                ):
                    evidence[observation["field"]] = observation["value"]
                if (
                    observation["field"] in {"need", "region", "infrastructure"}
                    and observation["status"] == "confirmed"
                ):
                    evidence["fit"][observation["field"]] = {True: "yes", False: "no"}.get(
                        observation["value"], observation["value"]
                    )
            scores = score_lead(evidence, datetime.now(UTC))
            scores["evidence_version"] = result["evidence_version"]
            ip = result["payload"].get("ip_ciphertext")
            geo = (
                self.geoip.lookup(self.crypt.decrypt(ip))
                if self.geoip and ip
                else {"status": "unknown", "source": "geoip"}
            )
            return {
                "scores": scores,
                "evidence_version": result["evidence_version"],
                "needs": extract_needs(pii.get("notes", "")),
                "geoip": geo,
                "phone_signals": phone_signals(pii["phone"]),
            }
        if job["kind"] == "auto_assign":
            from pagefpt.modules.workflow.sla import compute_sla

            due = compute_sla(
                datetime.now(UTC),
                {"weekdays": [0, 1, 2, 3, 4, 5], "start": "08:00", "end": "18:00"},
            )
            return await self.db.rpc(
                "dispatch",
                {
                    "command": {
                        "op": "internal_assign",
                        "id": job["entity_id"],
                        "sla_due_at": due.isoformat(),
                    }
                },
            )
        if job["kind"] == "notify":
            command = await self.db.rpc(
                "dispatch", {"command": {"op": "delivery_prepare", "id": job["entity_id"]}}
            )
            if command["status"] == "deferred":
                raise DomainError(
                    "SCHEDULE_DEFERRED", 503, fields={"retry_at": command["retry_at"]}
                )
            if command["status"] != "ready":
                return {"delivery_status": command["status"]}
            from pagefpt.modules.integrations.base import DeliveryResult, DeliveryState

            if not (
                await self.db.rpc(
                    "dispatch",
                    {"command": {"op": "integration_allowed", "platform": "notification"}},
                )
            )["allowed"]:
                notification_adapter = None
            else:
                notification_adapter = self.notifications
            result = (
                await notification_adapter.deliver(
                    {
                        "event_id": command["event_id"],
                        "channel": command["channel"],
                        "purpose": command["purpose"],
                        "phone": self.crypt.decrypt(command["phone_ciphertext"]),
                    }
                )
                if notification_adapter
                else DeliveryResult(DeliveryState.DISABLED, "INTEGRATION_DISABLED")
            )
            await self.db.rpc(
                "dispatch",
                {
                    "command": {
                        "op": "delivery_finish",
                        "id": job["entity_id"],
                        "delivery_id": command["delivery_id"],
                        "state": result.state.value,
                        "result": {"code": result.code, "provider_id": result.provider_id},
                    }
                },
            )
            if result.state == DeliveryState.RETRY:
                raise DomainError(result.code, 503)
            return {"delivery_status": result.state.value, "code": result.code}
        if job["kind"] == "conversion":
            command = await self.db.rpc(
                "dispatch",
                {
                    "command": {
                        "op": "conversion_prepare",
                        "id": job["entity_id"],
                        "stage": job["job_command"].get("stage", "lead"),
                    }
                },
            )
            if command["status"] != "ready":
                return {"delivery_status": command["status"]}
            from pagefpt.modules.integrations.base import DeliveryResult, DeliveryState

            attribution = command["event"].get("attribution")
            last_touch = attribution.get("last_touch") if isinstance(attribution, dict) else None
            if isinstance(last_touch, dict) and command.get("click_id_ciphertext"):
                last_touch["click_id"] = self.crypt.decrypt(command["click_id_ciphertext"])
            platform = last_touch.get("platform", "") if isinstance(last_touch, dict) else ""
            enabled = await self.db.rpc(
                "dispatch", {"command": {"op": "integration_allowed", "platform": platform}}
            )
            result = (
                await self.conversions.deliver(command["event"])
                if self.conversions and enabled["allowed"]
                else DeliveryResult(DeliveryState.DISABLED, "INTEGRATION_DISABLED")
            )
            await self.db.rpc(
                "dispatch",
                {
                    "command": {
                        "op": "conversion_finish",
                        "delivery_id": command["delivery_id"],
                        "state": result.state.value,
                        "result": {"code": result.code, "provider_id": result.provider_id},
                    }
                },
            )
            if result.state == DeliveryState.RETRY:
                raise DomainError(result.code, 503)
            return {"delivery_status": result.state.value, "code": result.code}
        if job["kind"] == "export":
            from pagefpt.modules.governance.exports import export_csv

            data = await self.db.rpc(
                "dispatch", {"command": {"op": "internal_export", "id": job["entity_id"]}}
            )
            rows = data["rows"][:100]
            part = data["payload"]["part"]
            key = f"exports/{job['entity_id']}/{part}-{job['fence']}.csv"
            if self.storage is None:
                raise DomainError("STORAGE_UNCONFIGURED", 503)
            await self.storage.write(key, export_csv(rows), "text/csv")
            last = rows[-1] if rows else None
            return {
                "part_key": key,
                "has_more": len(data["rows"]) > 100,
                "before_at": last["created_at"] if last else None,
                "before_id": last["id"] if last else None,
                "part": part,
            }
        if job["kind"] == "erase_export":
            data = await self.db.rpc(
                "dispatch", {"command": {"op": "internal_erase_export", "id": job["entity_id"]}}
            )
            if self.storage is None:
                raise DomainError("STORAGE_UNCONFIGURED", 503)
            more = await self.storage.delete_prefix("exports/" + job["entity_id"] + "/")
            return {"erased": not more, "has_more": more}
        raise DomainError("UNSUPPORTED_JOB", 422)

    async def process(self, queue, max_messages=10, deadline_seconds=20):
        start = time.monotonic()
        result = await self.db.rpc(
            "claim_jobs", {"command": {"queue": queue, "limit": max_messages, "lease_seconds": 60}}
        )
        semaphore = asyncio.Semaphore(3)
        stats = {
            "claimed": len(result["jobs"]),
            "completed": 0,
            "retried": 0,
            "failed": 0,
            "deferred": 0,
        }

        async def execute(job):
            async with semaphore:
                try:
                    budget = deadline_seconds - (time.monotonic() - start) - 3
                    if budget <= 0:
                        raise TimeoutError
                    output = await asyncio.wait_for(self.handle(job), min(5, budget))
                    done = await self.db.rpc(
                        "complete_job",
                        {"command": {"id": job["id"], "fence": job["fence"], "result": output}},
                    )
                    if not done["completed"] and output.get("part_key") and self.storage:
                        await self.storage.delete(output["part_key"])
                    if done["completed"]:
                        stats["completed"] += 1
                except Exception as exc:
                    transient = not isinstance(exc, DomainError) or exc.status in {429, 503}
                    delay = random.uniform(0, min(300, 2 ** job["attempt"]))
                    if isinstance(exc, DomainError) and exc.fields.get("retry_after"):
                        delay = max(delay, min(86400, exc.fields["retry_after"]))
                    if isinstance(exc, DomainError) and exc.code == "SCHEDULE_DEFERRED":
                        delay = max(
                            1,
                            (
                                datetime.fromisoformat(exc.fields["retry_at"]) - datetime.now(UTC)
                            ).total_seconds(),
                        )
                    await self.db.rpc(
                        "fail_job",
                        {
                            "command": {
                                "id": job["id"],
                                "fence": job["fence"],
                                "delay": delay,
                                "permanent": not transient,
                                "code": exc.code if isinstance(exc, DomainError) else "JOB_ERROR",
                            }
                        },
                    )
                    if isinstance(exc, DomainError) and exc.code == "SCHEDULE_DEFERRED":
                        stats["deferred"] += 1
                    elif transient:
                        stats["retried"] += 1
                    else:
                        stats["failed"] += 1

        await asyncio.gather(*(execute(job) for job in result["jobs"]))
        return stats
