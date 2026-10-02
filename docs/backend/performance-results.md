# Hiệu năng cục bộ

Kết quả gần nhất: `performance-final-local.json`, ASGI + PostgreSQL 16.2 portable, service_role, 5rps/60s và các burst riêng. 450 requests, 0 lỗi; sustained p95 74.062ms, p99 86.260ms; burst100 p95 512.684ms. Chưa đạt mốc 500ms cho burst100 trong lần này. Xem `verification.md` để hiểu giới hạn phép đo.

Các artifact trước: `performance-2026-10-01.json` (120s, 750 requests), `performance-local.json` (15 phút, phiên bản trước thay đổi cuối). `query-plan-local.json` kiểm tra 100.000 lead và scope RPC; `load-http-local.txt` kiểm tra Locust qua Uvicorn thực, 50 POST không lỗi. Các phép đo này không gồm Vercel cold start hay hosted PostgREST RTT.

Tái lập benchmark local bằng `uv run python tests/load/benchmark.py --duration 900 --output docs/backend/performance-local-new.json` và query plan bằng `uv run python tests/load/query_plans.py`. Dùng target disposable, integrations disabled. Harness tự tạo/xóa database test, không đưa phone/IP vào output thống kê.

Locust mặc định chỉ đọc catalog. Với server fixture local ở port8091, thử synthetic intake:

```bash
PAGEFPT_LOAD_WRITE=synthetic-authorized uv run locust -f tests/load/locustfile.py --host http://127.0.0.1:8091 --headless --users 50 --spawn-rate 10 --run-time 15m
```

`PAGEFPT_LOAD_RPS` mặc định5; throughput được chia theo target users. Chạy 100 concurrency/burst60s cần workload riêng với rate profile đã được duyệt và quota staging; không diễn giải một burst100 riêng lẻ thành 60 giây tải liên tục. Trước rollout, đo warm/cold, queue age, client RTT, DB pool/CPU, quota/cost và error budget; điều chỉnh dựa trên profile thay vì tăng timeout để che bottleneck.
