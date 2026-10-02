"""100k synthetic rows. Measure the real scoped list RPC and retain EXPLAIN evidence."""

import json
import sys
import time
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import psycopg
from conftest import db_schema
from psycopg.types.json import Jsonb

generator = db_schema.__wrapped__()
dsn = next(generator)
try:
    with psycopg.connect(dsn, autocommit=True) as db:
        actor, contact, branch = [str(uuid4()) for _ in range(3)]
        db.execute(
            "INSERT INTO private.memberships(user_id,branch_id,permissions) VALUES(%s,%s,ARRAY['lead.read','lead.all'])",
            [actor, branch],
        )
        db.execute(
            "INSERT INTO private.contacts(id,phone_hmac,phone_ciphertext,key_version) VALUES(%s,'synthetic','encrypted','v1')",
            [contact],
        )
        db.execute(
            "INSERT INTO private.leads(contact_id,branch_id,payload,pii_ciphertext,quote_status,created_at) SELECT %s,CASE WHEN i>90000 THEN %s::uuid ELSE md5((i/10000)::text)::uuid END,'{}','encrypted','needs_confirmation',now()-make_interval(secs=>i) FROM generate_series(1,100000) i",
            [contact, branch],
        )
        db.execute("ANALYZE private.leads")
        db.execute("SET ROLE service_role")
        samples = []
        for _ in range(10):
            started = time.perf_counter()
            result = db.execute(
                "SELECT api.dispatch(%s)", [Jsonb({"op": "lead_list", "actor": actor, "limit": 31})]
            ).fetchone()[0]
            samples.append(round((time.perf_counter() - started) * 1000, 3))
            assert len(result["items"]) == 31
        plan = db.execute(
            "EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT * FROM private.leads WHERE branch_id=%s ORDER BY created_at DESC,id DESC LIMIT 31",
            [branch],
        ).fetchone()[0]
        Path("docs/backend/query-plan-local.json").write_text(
            json.dumps(
                {"rows": 100000, "rpc_latency_ms": samples, "explain_scoped_index": plan}, indent=2
            )
            + "\n"
        )
        print(
            json.dumps(
                {
                    "rows": 100000,
                    "rpc_latency_ms": samples,
                    "index_used": plan[0]["Plan"]["Plans"][0].get("Index Name"),
                }
            )
        )
finally:
    generator.close()
