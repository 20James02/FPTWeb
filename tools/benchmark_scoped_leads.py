"""Synthetic, disposable SQL benchmark; never use a hosted test DSN."""

import argparse
import json
import os
import statistics
import time
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg.types.json import Jsonb


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rows", type=int, choices=[100000, 1000000], default=100000)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if os.environ.get("PAGEFPT_TEST_DSN"):
        raise SystemExit("Unset PAGEFPT_TEST_DSN: this benchmark creates its own local database.")
    from tests.conftest import db_schema

    database = db_schema.__wrapped__()
    dsn = next(database)
    report = {"synthetic_only": True, "rows": args.rows, "scopes": {}}
    try:
        with psycopg.connect(dsn, autocommit=True) as db:
            branch, actor, global_actor, staff, contact = [str(uuid4()) for _ in range(5)]
            db.execute(
                "INSERT INTO private.memberships(user_id,branch_id,permissions) VALUES(%s,%s,ARRAY['lead.read','lead.all']),(%s,'00000000-0000-0000-0000-000000000000',ARRAY['*']),(%s,%s,ARRAY['lead.read'])",
                [actor, branch, global_actor, staff, branch],
            )
            db.execute(
                "INSERT INTO private.contacts(id,phone_hmac,phone_ciphertext,key_version) VALUES(%s,'synthetic','encrypted','v1')",
                [contact],
            )
            split = args.rows * 9 // 10
            for start in range(1, args.rows + 1, 10000):
                db.execute(
                    "INSERT INTO private.leads(contact_id,branch_id,assignee_id,status,payload,pii_ciphertext,quote_status,created_at,sla_due_at) SELECT %s,CASE WHEN i>%s THEN %s::uuid ELSE md5((i/10000)::text)::uuid END,CASE WHEN i>%s AND i %% 10=0 THEN %s::uuid ELSE NULL END,'assigned','{}','encrypted','needs_confirmation',now()-make_interval(secs=>i),now()-make_interval(secs=>i) FROM generate_series(%s::int,%s::int) i",
                    [contact, split, branch, split, staff, start, min(start + 9999, args.rows)],
                )
                if (start + 9999) % 100000 == 0:
                    print("Seeded", min(start + 9999, args.rows), flush=True)
            db.execute("ANALYZE private.leads")
            db.execute("SET ROLE service_role")
            for label, uid in [("branch", actor), ("global", global_actor), ("assigned", staff)]:
                samples = []
                for _ in range(10):
                    started = time.perf_counter()
                    result = db.execute(
                        "SELECT api.dispatch(%s)",
                        [Jsonb({"op": "lead_list", "actor": uid, "limit": 31})],
                    ).fetchone()[0]
                    samples.append(round((time.perf_counter() - started) * 1000, 3))
                    assert len(result["items"]) == 31, label
                    assert len({x["id"] for x in result["items"]}) == 31
                    if label == "branch":
                        assert all(x["branch_id"] == branch for x in result["items"])
                    if label == "assigned":
                        assert all(x["assignee_id"] == staff for x in result["items"])
                report["scopes"][label] = {
                    "samples_ms": samples,
                    "median_ms": statistics.median(samples),
                    "p95_ms": sorted(samples)[-1],
                    "scope_verified": True,
                }
                print(label, report["scopes"][label], flush=True)
    finally:
        database.close()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
