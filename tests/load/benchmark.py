"""Synthetic local PostgreSQL/ASGI benchmark, never contacts customers.
Explicitly excludes Vercel cold start, browser RTT and hosted PostgREST costs.
"""

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import httpx
from conftest import LocalGateway, db_schema

from pagefpt.application import create_app
from pagefpt.core.config import Settings


def percentile(samples, q):
    return round(sorted(samples)[min(len(samples) - 1, int((len(samples) - 1) * q))], 3)


async def run(duration, output):
    generator = db_schema.__wrapped__()
    dsn = next(generator)
    settings = Settings(
        environment="test",
        encryption_key="e" * 32,
        matching_key="m" * 32,
        token_key="t" * 32,
        job_secret="j" * 32,
    )
    app = create_app(settings, LocalGateway(dsn))
    samples, errors = [], {}
    count = 0
    semaphore = asyncio.Semaphore(100)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://synthetic"
    ) as client:

        async def request():
            nonlocal count
            count += 1
            phone = f"090{count:07d}"
            async with semaphore:
                started = time.perf_counter()
                response = await client.post(
                    "/api/v1/leads",
                    json={"phone": phone, "consent_version": "benchmark-v1"},
                    headers={"Idempotency-Key": str(uuid4())},
                )
                samples.append((time.perf_counter() - started) * 1000)
                if response.status_code != 201:
                    errors[response.status_code] = errors.get(response.status_code, 0) + 1

        await asyncio.gather(*(request() for _ in range(50)))
        burst50 = list(samples)
        started = time.monotonic()
        pending = set()
        last_report = started
        for index in range(int(duration * 5)):
            delay = started + index / 5 - time.monotonic()
            if delay > 0:
                await asyncio.sleep(delay)
            task = asyncio.create_task(request())
            pending.add(task)
            task.add_done_callback(pending.discard)
            if time.monotonic() - last_report >= 30:
                print(
                    json.dumps(
                        {
                            "elapsed_s": int(time.monotonic() - started),
                            "submitted": count,
                            "errors": errors,
                        }
                    ),
                    flush=True,
                )
                last_report = time.monotonic()
        await asyncio.gather(*pending)
        sustained = list(samples[len(burst50) :])
        samples.clear()
        await asyncio.gather(*(request() for _ in range(100)))
        result = {
            "environment": "local ASGI + PostgreSQL16 Unix socket + service_role; no hosted network or worker load",
            "duration_s": duration,
            "rate_rps": 5,
            "requests": count,
            "errors": errors,
            "burst50": {
                "p50_ms": percentile(burst50, 0.5),
                "p95_ms": percentile(burst50, 0.95),
                "p99_ms": percentile(burst50, 0.99),
            },
            "sustained": {
                "p50_ms": percentile(sustained, 0.5),
                "p95_ms": percentile(sustained, 0.95),
                "p99_ms": percentile(sustained, 0.99),
            },
            "burst100": {
                "p50_ms": percentile(samples, 0.5),
                "p95_ms": percentile(samples, 0.95),
                "p99_ms": percentile(samples, 0.99),
            },
        }
        Path(output).write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result), flush=True)
    generator.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--duration", type=int, default=900)
    parser.add_argument("--output", default="docs/backend/performance-local.json")
    args = parser.parse_args()
    asyncio.run(run(args.duration, args.output))
