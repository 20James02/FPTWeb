# Triển khai PageFPT lên Vercel, Supabase và Cloudflare R2

Cập nhật 03/10/2026 cho repository https://github.com/20James02/FPTWeb. Hướng dẫn dựa trên mã hiện tại và tài liệu chính thức đã đối chiếu; chưa thực hiện hoặc xác nhận deployment cloud. Dùng Python 3.12/FastAPI/Jinja2, không cần chuyển framework.

## 1. Phạm vi triển khai hiện tại

- Vercel chạy API và HTML Admin, giữ UI/API cùng origin để cookie và CSRF hoạt động.
- Supabase cung cấp PostgreSQL, Auth, queue, Vault và lịch gọi worker.
- R2 lưu file; không chạy Python hoặc thay thế database.
- `src/pagefpt/application.py` vẫn chỉ mount các trang client ở development/test. Với staging/production, `/admin/login` và API có thể hoạt động nhưng `/`, `/internet`, các landing preview chưa được mở. Không đổi ENV thành development để công khai các trang này; cần hoàn thiện nội dung/claim mẫu, binding và kiểm thử rồi mở router client có chủ đích.
- Không dùng `tests.e2e.integrated_server:app` hoặc tài khoản QA để deploy. Entrypoint thật là `app.py`, export `app`.

Đợt đầu nên dùng Supabase/buckets/project Vercel riêng cho staging. Có thể dùng một project Vercel có domain ổn định, đặt `PAGEFPT_ENVIRONMENT=staging` trong nhóm Environment Variables **Production** của Vercel. “Production” của Vercel là loại deployment; `PAGEFPT_ENVIRONMENT` là chế độ ứng dụng, hai khái niệm riêng. Preview không dùng database/keys production.

## 2. Chuẩn bị repository và CLI

Nếu đã có workspace này thì dùng thư mục hiện tại. Nếu cài ở máy mới:

```bash
git clone https://github.com/20James02/FPTWeb.git
cd FPTWeb
```

Cài Supabase CLI theo [hướng dẫn chính thức](https://supabase.com/docs/guides/local-development/cli/getting-started). Các lệnh bên dưới dùng CLI native tên `supabase`; nếu chạy qua Node 20+ thì thay bằng `npx supabase`. Node chỉ phục vụ CLI này, backend vẫn là Python. Repository đã có `supabase/config.toml`, không cần `supabase init` lại.

Trước khi dùng, xem help của bản CLI đang cài:

```bash
supabase --version
supabase --help
supabase login --help
supabase link --help
supabase migration list --help
supabase db push --help
```

## 3. Supabase: tạo database và áp migrations

1. Tạo project Supabase mới, chọn PostgreSQL thông thường; chọn Singapore nếu có để phù hợp Vercel `sin1`. Ghi lại project reference, Project URL và mật khẩu database trong nơi lưu bí mật.
2. Trong Database/Extensions, bật `pgmq`, `pg_net`, `pg_cron`; kiểm tra Vault/supabase_vault có sẵn. Project mới phải hỗ trợ các extension này trước khi bật worker.
3. Link đúng project và áp toàn bộ 12 migrations đang có, theo migration history:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase migration list
supabase db push --dry-run
supabase db push
supabase migration list
```

`YOUR_PROJECT_REF` là phần định danh project, không phải URL đầy đủ. CLI có thể yêu cầu mật khẩu database. Dry-run liệt kê migrations dự kiến, không chứng minh SQL đã chạy thành công. Với database có sẵn, đối chiếu history trước; không sửa history/repair hoặc chạy reset để bỏ qua lỗi. Không chạy các công cụ test/seed QA vào project thật. [Database migrations](https://supabase.com/docs/guides/deployment/database-migrations), [CLI db push](https://supabase.com/docs/reference/cli/supabase-db-push).

4. Trong Data API settings, bật Data API và thêm schema `api` vào **Exposed schemas**. Với project riêng này ưu tiên chỉ `api`; không expose `private`. `supabase/config.toml` không tự thay cấu hình hosted này khi db push.
5. Giữ grants/RLS từ migrations. Không sao chép mẫu GRANT ALL cho anon/authenticated từ ví dụ custom schema: RPC dự án dành cho backend service_role. [Custom schemas](https://supabase.com/docs/guides/api/using-custom-schemas).

Đọc kiểm chứng trong SQL Editor:

```sql
SELECT api.health('{}'::jsonb);
SELECT count(*) AS applied_migrations
FROM supabase_migrations.schema_migrations;
SELECT extname, extversion
FROM pg_extension
WHERE extname IN ('pgmq', 'pg_net', 'pg_cron', 'supabase_vault');
```

Project mới chỉ có migrations dự án thì count mong đợi là 12. Với project đã có migrations khác, đối chiếu danh sách thay vì chỉ count. SQL Editor chạy bằng quyền operator; API readiness và quyền service_role vẫn cần kiểm tra từ Vercel.

## 4. Supabase Auth: API keys, owner và MFA

### Keys và signing

Lấy tại Project settings/API keys hoặc Connect:

- Project URL: `https://YOUR_PROJECT_REF.supabase.co`.
- Secret key `sb_secret_...` → `PAGEFPT_SUPABASE_SECRET`. Adapter cũng hỗ trợ legacy service_role key, nhưng không dùng làm key Auth.
- Publishable key `sb_publishable_...` → `PAGEFPT_SUPABASE_AUTH_KEY`; legacy anon key cũng được adapter hỗ trợ.

Backend dùng PostgREST/RPC, nên không cần biến `DATABASE_URL` để chạy request trên Vercel. Mật khẩu database dùng cho CLI/operator, không phải API secret. [API keys](https://supabase.com/docs/guides/getting-started/api-keys).

Trong Auth/JWT signing keys, dùng khóa **ES256 hoặc RS256 đang active**. TokenVerifier hiện tại không chấp nhận HS256; chỉ tạo standby key mà chưa rotate chưa đủ. Project đang chạy ứng dụng khác cần đối chiếu việc rotate với các ứng dụng đó. [Signing keys](https://supabase.com/docs/guides/auth/signing-keys).

### Owner đầu tiên

1. Authentication → Users → tạo/invite tài khoản admin thật, hoàn tất xác nhận email và thiết lập mật khẩu.
2. Sao chép UUID của user.
3. Trong SQL Editor, thay UUID rồi chạy một lần:

```sql
INSERT INTO private.memberships
  (user_id, branch_id, permissions, active, capacity, display_name)
SELECT id, '00000000-0000-0000-0000-000000000000'::uuid,
       ARRAY['*']::text[], true, 20, 'Chủ hệ thống'
FROM auth.users
WHERE id = 'REPLACE_WITH_AUTH_USER_UUID'::uuid
ON CONFLICT (user_id, branch_id) DO NOTHING;
```

Zero UUID là scope toàn cục của dự án. Insert phải tạo 1 row cho tài khoản mới; 0 row có thể do UUID không tồn tại hoặc membership đã có. Các nhân viên sau đó quản lý trong Admin → Vận hành → Nhân sự, cấp quyền/chi nhánh cụ thể. Membership không tạo user trong Auth.

### Đăng ký TOTP

Bật TOTP enrollment/verification trong Auth → MFA. **Bật MFA cho project không tự đăng ký factor cho user.** Admin hiện có màn nhập mã nhưng chưa có màn enrollment. Với owner mới chưa có MFA, đăng ký qua Supabase SDK/REST: sign in → enroll TOTP → quét QR → challenge → verify. [TOTP](https://supabase.com/docs/guides/auth/auth-mfa/totp), [Auth REST contract](https://github.com/supabase/auth/blob/master/openapi.yaml).

Có thể dùng ví dụ Python cục bộ sau, lưu ngoài repository như `/tmp/setup_pagefpt_mfa.py`. Cần Python/httpx (`uv sync --locked`, rồi `uv run python /tmp/setup_pagefpt_mfa.py`). Script không dùng service-role key, không ghi password/token ra log; QR chứa secret đăng ký factor và được xóa sau bước verify. Chỉ dùng cho tài khoản mới chưa có MFA; nếu đã có factor verified, dùng mã authenticator hiện tại để đăng nhập Admin.

```python
from getpass import getpass
from pathlib import Path
from tempfile import NamedTemporaryFile
import webbrowser

import httpx

origin = input("Supabase Project URL: ").strip().rstrip("/")
key = input("Publishable key: ").strip()
email = input("Email owner: ").strip()
if not origin.startswith("https://") or key.startswith("sb_secret_"):
    raise SystemExit("Cần Project URL HTTPS và publishable/anon key.")

with httpx.Client(timeout=15, headers={"apikey": key}) as client:
    def call(path, body, token=None, params=None):
        response = client.post(
            origin + "/auth/v1/" + path, json=body, params=params,
            headers={"Authorization": "Bearer " + token} if token else {},
        )
        if not response.is_success:
            raise SystemExit(f"Auth từ chối thao tác, HTTP {response.status_code}")
        return response.json() if response.content else {}

    session = call("token", {"email": email, "password": getpass("Mật khẩu: ")},
                   params={"grant_type": "password"})
    if any(f.get("status") == "verified"
           for f in session.get("user", {}).get("factors", [])):
        raise SystemExit("User đã có MFA. Dùng authenticator hiện tại.")
    token = session["access_token"]
    factor = call("factors", {"factor_type": "totp", "friendly_name": "PageFPT owner"}, token)
    with NamedTemporaryFile(mode="w", suffix=".svg", prefix="pagefpt-mfa-",
                           encoding="utf-8", delete=False) as file:
        file.write(factor["totp"]["qr_code"])
        qr = Path(file.name)
    try:
        webbrowser.open(qr.as_uri())
        print("Quét QR trong authenticator. Nếu chưa mở được, mở file:", qr)
        challenge = call(f"factors/{factor['id']}/challenge", {}, token)
        verified = call(f"factors/{factor['id']}/verify",
                        {"challenge_id": challenge["id"], "code": getpass("Mã TOTP 6 số: ")},
                        token)
        print("Đã verify factor. Đăng nhập lại ở /admin/login bằng mã authenticator.")
        try:
            call("logout", {}, verified["access_token"], params={"scope": "local"})
        except (httpx.HTTPError, SystemExit):
            print("Factor đã verify; logout phiên thiết lập chưa được xác nhận.")
    finally:
        qr.unlink(missing_ok=True)
```

Ví dụ đã kiểm tra cú pháp và đối chiếu REST contract; chưa chạy trên tài khoản hosted của bạn. Nếu dừng trước verify thì factor có thể còn unverified; kiểm tra factor và dọn đúng factor đó trước khi enroll lại, không xóa factor verified đang dùng.

### Telegram recovery

Recovery dùng mã 6 số gửi vào chat riêng đã xác minh; không gửi email/link. Từ 15/10/2026, cấu hình PAGEFPT_TELEGRAM_RECOVERY_CHAT_ID server-only để mọi tài khoản Admin/nhân viên hợp lệ gửi mã về cùng bot nhận chung. Không cần thêm email nhân viên mới; PAGEFPT_TELEGRAM_RECOVERY_ACCOUNTS chỉ dành cho cấu hình cũ khi chưa có chat chung. Không dùng nhóm nhận lead làm kênh nhận mã. Áp dụng các migration recovery hiện có; xem docs/backend/password-recovery.md. Giữ MFA đã có, hạn 5 phút, tối đa 5 lần sai, gửi lại sau 60 giây. Không thay SMTP/template để phục vụ luồng này.


## 5. Cloudflare R2

Tạo hai bucket riêng cho môi trường:

| Bucket ví dụ | Quyền truy cập | Nội dung |
|---|---|---|
| `pagefpt-staging-private` | Private, tắt public access/r2.dev | Upload quarantine, CSV export |
| `pagefpt-staging-public` | Public qua custom domain | Ảnh WebP đã finalize |

R2 → Manage R2 API Tokens → tạo token **Object Read & Write** cho đúng hai bucket. Lưu Access Key ID và Secret Access Key. Lấy S3 endpoint của account, thường là `https://ACCOUNT_ID.r2.cloudflarestorage.com`; endpoint theo jurisdiction khác thì dùng giá trị dashboard cung cấp.

Public bucket: Settings → Custom Domains → gắn hostname như `media.tenmiencuaban.vn`. Domain cần là zone trong cùng tài khoản Cloudflare. Chờ Active; `PAGEFPT_MEDIA_DOMAIN` là origin HTTPS này, không kèm tên bucket hay `/images`. Production dùng custom domain; r2.dev dành cho thử nghiệm. [Public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/).

Private bucket: Settings → CORS policy; điền **origin Vercel/domain thực**:

```json
[
  {
    "AllowedOrigins": ["https://YOUR_VERCEL_OR_CUSTOM_HOST"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 300
  }
]
```

Không thêm đường dẫn hoặc trailing slash vào origin. Thêm từng staging origin được dùng; không dùng wildcard cho mọi preview. Signed PUT dùng S3 endpoint, còn ảnh public dùng media domain. [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/), [presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).

Lifecycle private: `quarantine/` xóa sau 1 ngày, `exports/` sau 7 ngày. Không đặt rule này lên ảnh public. Xem `deploy/r2-policy.md` cho hạn URL/upload và cleanup.

## 6. Vercel: import repository

1. Vercel → Add New → Project → import GitHub `20James02/FPTWeb`.
2. Root Directory là root repository `./`, không chọn `src/pagefpt`.
3. Framework dùng FastAPI/auto-detection; giữ install/build mặc định của Python, không nhập npm build hay output `.next`.
4. Repository đã có `app.py`, `pyproject.toml` với `tool.vercel.entrypoint = "app:app"`, Python `>=3.12,<3.13`, `uv.lock`, `vercel.json` (`sin1`, maxDuration30). Giữ các file này.
5. Thêm các biến ở phần tiếp theo trước khi Deploy. Chế độ staging/production validate URL Supabase và 4 key ngay lúc khởi tạo app; thiếu biến có thể làm build/import hoặc startup thất bại.
6. Xác định domain ổn định, cập nhật `PAGEFPT_PUBLIC_ORIGIN`, Auth Site URL và CORS R2 cho khớp, rồi redeploy. Thay env trên dashboard không sửa deployment đã chạy trước đó.

Vercel hỗ trợ entrypoint/pyproject và static FastAPI. Với repo này backend/UI Admin ở cùng deployment; không cần chạy lệnh uvicorn làm Start Command. [FastAPI](https://vercel.com/docs/frameworks/backend/fastapi), [Python runtime](https://vercel.com/docs/functions/runtimes/python).

## 7. Environment Variables trên Vercel

Các ví dụ tên domain/bucket phải thay bằng giá trị thật. Secrets nhập dashboard, không commit vào GitHub. Dùng scope riêng cho staging/production.

| Tên biến | Giá trị |
|---|---|
| `PAGEFPT_ENVIRONMENT` | `staging` cho pilot; `production` cho môi trường thật |
| `PAGEFPT_SUPABASE_URL` | Project URL HTTPS |
| `PAGEFPT_SUPABASE_SECRET` | Secret key của đúng project, server-only |
| `PAGEFPT_SUPABASE_AUTH_KEY` | Publishable/anon key của cùng project |
| `PAGEFPT_ENCRYPTION_KEY` | Khóa riêng số 1 |
| `PAGEFPT_MATCHING_KEY` | Khóa riêng số 2 |
| `PAGEFPT_TOKEN_KEY` | Khóa riêng số 3 |
| `PAGEFPT_JOB_SECRET` | Khóa riêng số 4, cùng giá trị sẽ lưu Vault |
| `PAGEFPT_PUBLIC_ORIGIN` | `https://YOUR_VERCEL_OR_CUSTOM_HOST`, không slash cuối |
| `PAGEFPT_ALLOWED_ORIGINS` | `[]` khi UI/API cùng origin |
| `PAGEFPT_TRUSTED_VERCEL_PROXY` | `true` khi thực sự chạy sau Vercel |
| `PAGEFPT_R2_ENDPOINT` | S3 API endpoint từ R2 |
| `PAGEFPT_R2_ACCESS_KEY` | Access Key ID R2 |
| `PAGEFPT_R2_SECRET_KEY` | Secret Access Key R2 |
| `PAGEFPT_R2_BUCKET` | Tên private bucket |
| `PAGEFPT_R2_PUBLIC_BUCKET` | Tên public bucket |
| `PAGEFPT_MEDIA_DOMAIN` | `https://media.tenmiencuaban.vn` |
| `PAGEFPT_INTEGRATIONS_ENABLED` | `false` đến khi gateway quảng cáo được cấu hình/kiểm thử |

Tạo từng key trong 4 key ứng dụng bằng lệnh dưới, chạy 4 lần và lưu riêng. Mỗi key ít nhất 32 ký tự; không dùng cùng một giá trị cho cả 4 key. Không sinh lại encryption/matching key tùy tiện khi đã có dữ liệu vì có thể mất khả năng giải mã/đối sánh.

```bash
python3 -c 'import secrets; print(secrets.token_urlsafe(48))'
```

Giữ mặc định nếu chưa cần: `PAGEFPT_ADMIN_SESSION_HOURS=12`, `PAGEFPT_ENCRYPTION_KEY_VERSION=v1`, `PAGEFPT_ENCRYPTION_PREVIOUS_KEYS={}`. Chưa dùng GeoIP thì để `PAGEFPT_GEOIP_PATH` trống; UI cần hiện unknown, không đoán vị trí chắc chắn.

Turnstile nếu bật: `PAGEFPT_TURNSTILE_SECRET`, `PAGEFPT_TURNSTILE_HOSTNAMES` là JSON array hostname; client phải được gắn site key/widget đúng. Gateway notification/conversion cần HTTPS URL và signing secret riêng. Record integration enabled trong Admin không tự cung cấp OAuth/token hoặc kết nối vendor.

## 8. Worker: Supabase gọi Vercel

Sau khi Vercel có `/health/ready` và domain ổn định:

1. Trong Supabase Vault, tạo secret tên `pagefpt_job_secret`, giá trị **trùng** `PAGEFPT_JOB_SECRET` trên Vercel. Sao chép UUID của secret, không đưa giá trị vào file SQL/Git. [Vault](https://supabase.com/docs/guides/database/vault).
2. Mở `deploy/supabase-runtime.sql`, thay `REPLACE_WITH_HTTPS_ORIGIN` bằng origin Vercel thật và zero UUID của `vault_secret_id` bằng UUID vừa lấy. Dán bản đã thay vào SQL Editor của đúng môi trường rồi chạy.
3. Migrations đã tạo trigger wake; script này cấu hình origin/secret và cron `pagefpt-recover` mỗi phút. Đường gọi: `/internal/jobs/process` và `/internal/jobs/recover`; code kiểm X-Job-Secret hoặc Bearer của worker. Không cần thêm Vercel Cron khi dùng scheduler này.
4. Origin worker phải truy cập được từ pg_net. Deployment Protection của Vercel có thể chặn domain preview/staging trước khi request vào FastAPI; header worker hiện chưa có protection-bypass. Dùng domain ổn định có cấu hình access phù hợp và giữ authentication của ứng dụng cho Admin/internal routes.

Đọc kiểm tra bằng SQL Editor:

```sql
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname = 'pagefpt-recover';

SELECT id, queue, kind, state, attempt, next_attempt_at
FROM private.jobs
ORDER BY created_at DESC
LIMIT 20;

SELECT code, created_at
FROM private.wake_failures
ORDER BY id DESC
LIMIT 20;
```

Wake không thay thế durable queue/cron recovery. Kiểm response pg_net và trạng thái job; HTTP200 của trang login không chứng minh worker đã chạy. Không SELECT toàn bộ Vault decrypted secrets để lấy log kiểm tra.

## 9. Nhập dữ liệu và nghiệm thu

1. `/health/live` → `{"status":"alive"}`; `/health/ready` → `{"status":"ready"}`. Ready chỉ xác nhận RPC DB gọi được.
2. `/admin/login` → đăng nhập owner thật, nhập mã TOTP → `/api/v1/admin/me` có `aal2` và membership đúng.
3. Admin gói/giá → nhập địa bàn từ nguồn bundled/API, gán chi nhánh → tạo gói → nhập giá/ưu đãi có nguồn → publish. Database mới không tự có giá thương mại; không dùng giá test.
4. Gửi một lead staging → đọc CRM và kiểm quote/khu vực đúng → chờ job xử lý, kiểm SLA/score/assignment; thử retry cùng Idempotency-Key không tạo bản ghi trùng.
5. Upload ảnh từ Admin content → signed PUT ở private/quarantine → finalize → ảnh public ở media domain.
6. Yêu cầu export → job complete → tải CSV metadata qua signed URL; chưa complete không hiện “xuất xong”.
7. Sai quyền/MFA/CSRF hoặc phiên bị thu hồi phải bị từ chối; kiểm restore/backup và mobile thiết bị trước khi nhận khách thật.
8. Chỉ công khai client sau khi đã hoàn thiện và kiểm thử production router. 404 trang chủ hiện tại là gate của source, không sửa bằng cách tạo rewrite mọi URL về admin/app.

## 10. Chẩn đoán nhanh

| Triệu chứng | Kiểm tra |
|---|---|
| Build/startup lỗi Supabase configuration/keys | Đủ env đúng scope Vercel, key độc lập, redeploy |
| `ModuleNotFoundError: pagefpt` | Root Directory `./`, pyproject/uv.lock được giữ, package được cài; không chọn thư mục con hoặc thay install command tùy tiện |
| `/health/ready`503 | SupabaseURL/secret, DataAPI expose api, migrations/RPC/grants, project hoạt động |
| Login503 | Publishable Auth key đã cấu hình, Auth endpoint hoạt động |
| Login401 dù password đúng | Token đang HS256, JWKS/signing key chưa active, factor/code sai |
| Login403 | UUID/member active/permissions; Auth user tồn tại chưa đủ để có quyền Admin |
| API403 MFA_REQUIRED | Factor chưa enroll+verify hoặc phiên vẫn aal1; logout/login lại với authenticator |
| Upload503 | R2 endpoint/keys/private/public bucket/media domain thiếu |
| Upload lỗi CORS/403 | Origin thực, PUT/Content-Type, key đúng bucket, signed URL chưa hết hạn |
| Ảnh finalize xong nhưng404 | Media domain trỏ đúng public bucket, domain Active, prefix/key đúng |
| Jobs luôn pending | Vault UUID/secret trùng, cron active, pg_net, origin worker và Vercel Deployment Protection |
| Client `/`404 còn Admin200 | Router client còn gate development/test; deployment API/Admin không phải deployment client hoàn chỉnh |

## 11. Trạng thái bàn giao

Tài liệu/commands/fields đã đối chiếu mã dự án. Ví dụ MFA kiểm tra cú pháp; chưa xác nhận Auth/SMTP, migrations, R2CORS/upload/export, Vercel deployment hoặc cron trên tài khoản của bạn. Nội dung này hướng dẫn operator thực hiện, không phải báo cáo đã deploy thành công.
