"""Staging harness. Read-only unless explicitly enabled with synthetic-write flag.

Disable all integrations in the disposable target before enabling writes.
"""

import os
import secrets
from urllib.parse import urlparse
from uuid import uuid4

from locust import HttpUser, constant_throughput, task


class PageFPTUser(HttpUser):
    def on_start(self):
        rate = float(os.environ.get("PAGEFPT_LOAD_RPS", "5"))
        users = max(1, self.environment.runner.target_user_count)
        if rate <= 0 or rate > 100:
            raise ValueError("Load rate must be between 0 and 100 RPS")
        self.wait_time = constant_throughput(rate / users).__get__(self, type(self))
        self.synthetic_write = os.environ.get("PAGEFPT_LOAD_WRITE") == "synthetic-authorized"
        hostname = urlparse(self.host).hostname or ""
        if self.synthetic_write and not (
            hostname in {"127.0.0.1", "localhost"} or "staging" in hostname
        ):
            raise ValueError("Synthetic writes require a disposable local/staging hostname")

    @task
    def visit(self):
        if not self.synthetic_write:
            self.client.get("/api/v1/catalog", name="catalog")
            return
        body = {
            "phone": "090" + f"{secrets.randbelow(10_000_000):07d}",
            "consent_version": "synthetic-load-v1",
        }
        with self.client.post(
            "/api/v1/leads",
            json=body,
            headers={"Idempotency-Key": str(uuid4())},
            name="synthetic lead",
            catch_response=True,
        ) as response:
            if response.status_code != 201:
                response.failure(f"Intake status {response.status_code}")
            elif not response.json().get("receipt"):
                response.failure("Missing committed receipt")
