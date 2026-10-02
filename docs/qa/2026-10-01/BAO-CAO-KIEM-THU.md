# Báo cáo kiểm thử PageFPT — 01/10/2026

## Kết luận nghiệm thu

**Chưa đạt nghiệm thu frontend–backend toàn dự án.** Bộ kiểm thử Python hiện có đạt 106/106; kiểm thử trình duyệt rộng hơn phát hiện lỗi tích hợp và bảo mật mà các test render HTML chưa bắt được. Cần sửa các vấn đề dưới đây rồi chạy lại trước khi kết luận có thể phát hành giao diện hiện tại.

Đây là kiểm thử tại workspace `/mnt/DATA/Workspace/PageFPT`. Chưa kiểm thử một bản Vercel staging/production đang chạy. Không có URL staging hoặc cấu hình tài khoản Supabase/R2 thật để xác nhận luồng cloud.

## Môi trường và dữ liệu

- Python 3.12, FastAPI, pytest, PostgreSQL 16 cục bộ; tạo database riêng và áp dụng đủ 8 migration trong `supabase/migrations` cùng pgmq SQL vendored.
- Integration test gọi RPC SQL thật dưới role `service_role`; có kiểm tra riêng quyền `anon`/`authenticated`, thu hồi membership và scope chi nhánh. Kết quả này không thay thế kiểm tra cấu hình Supabase hosted.
- Chrome headless và Playwright chạy frontend thật với Jinja2, JavaScript hiện có và API thật qua HTTP loopback. Fixture chuẩn bị 35 lead, một gói và một khu vực tổng hợp; mọi giá trong fixture chỉ phục vụ kiểm thử.
- Fixture mô phỏng **HTTP của Supabase Auth**, dùng JWT ES256, kiểm tra MFA và luồng cookie/CSRF thật của ứng dụng. Không sửa backend production để thêm endpoint bỏ qua xác thực.
- Trình duyệt chặn tài nguyên HTTP ngoài loopback. Chưa đánh giá ảnh/font CDN thật, độ trễ mạng mobile, thiết bị iOS/Android vật lý, hoặc giao dịch với tài khoản quảng cáo/nhà cung cấp thật.
- Không gửi tin nhắn khách, conversion, xuất dữ liệu khách thật hoặc triển khai production. Probe HTML chỉ đặt biến đánh dấu trong browser, không lấy cookie/dữ liệu và không gửi ra ngoài.

## Kết quả xác nhận

| Kiểm tra | Kết quả | Bằng chứng |
|---|---|---|
| pytest: unit, SQL integration, provider contracts | 106 passed; không có failure/skip trong kết quả | [pytest.log](pytest.log), [JUnit](pytest.xml) |
| Ruff lint | Đạt | [ruff-check.log](ruff-check.log) |
| Ruff format | 122 file đã đúng format | [ruff-format.log](ruff-format.log) |
| mypy | 85 file source đạt | [mypy.log](mypy.log) |
| Kiến trúc import Python | 85 file source đạt | [architecture.log](architecture.log) |
| JavaScript syntax | 20 file, 0 lỗi | [js-syntax.json](js-syntax.json) |
| Browser API/analytics contracts | Đạt retry, conflict, receipt, auth, MFA, CSRF, consent | [browser-contracts.log](browser-contracts.log) |
| Mobile form 390×844 với touch | Đạt lưu lead, mã xác nhận, retry 503 cùng khóa, không báo thành công giả | [mobile-browser-check.json](mobile-browser-check.json), [log](mobile-initial.log) |
| Browser tích hợp client/admin | **25/27 đạt; 2 thất bại** | [browser-integration.json](browser-integration.json), [log](browser-final.log) |
| Ma trận responsive | **37/48 đạt; 11 tràn ngang** | `viewports` trong [browser-integration.json](browser-integration.json) |
| Diagnostic bổ sung | **2/5 đạt; 3 thất bại** | [diagnostics.json](diagnostics.json), [log](diagnostics.log) |
| Build sdist/wheel; isolated wheel smoke | Đạt import package, template, static asset, ASGI health | [build.log](build.log), [wheel.log](wheel.log) |
| Tải API cục bộ | Số đo và giới hạn bên dưới | [performance.json](performance.json) |

48 phép đo responsive nằm trong một case của bộ browser 27 case; không cộng 48 vào 27 như các case độc lập. Diagnostic bổ sung là bộ riêng. Các HTTP 401/403/409/503 cố ý trong test không tự động được tính là lỗi sản phẩm.

Test mobile form chỉ xác nhận các trạng thái form/confirmation đã đo. Kết quả đó không có nghĩa tất cả trang mobile không tràn ngang; ma trận responsive đã phát hiện các trạng thái khác bị tràn.

### Những luồng backend đã được kiểm chứng

- Giá theo khu vực/vùng, VAT, thời hạn, tổng chi phí; chống chồng thời gian khi publish; draft/publish/retire; snapshot giá cũ và kiểm soát phiên bản.
- Lưu lead nguyên tử cùng queue, chuẩn hóa số điện thoại, idempotency khi gửi đồng thời, replay và conflict; từ chối input sai hoặc trường ngoài schema.
- Claim/lease/fencing của worker, wake lặp, hoàn thành khi lease hết hạn, retry và delivery timeout không rõ kết quả; đồng bộ trạng thái CRM, assignment và capacity.
- Scoring: thiếu bằng chứng không coi là bằng chứng xấu; VPN không tự kết luận bot; đầu số chỉ ước tính nhà mạng ban đầu; ý định, decay và confidence có giới hạn.
- Cookie session, MFA AAL2, CSRF, logout, refresh lease; quyền chi nhánh, membership bị thu hồi, quyền private data và RPC của role browser.
- Consent/event dedup, withdrawal, cấu hình integration không lộ secret, preview không gửi conversion; CMS publish và URL không an toàn.
- Import preview/apply, báo cáo, privacy erase, export race với yêu cầu xóa dữ liệu, media validation và R2 signing qua adapter được mô phỏng.

Các bài SQL dùng gateway cục bộ, không đi qua hosted PostgREST. Hợp đồng header/PostgREST và nhà cung cấp có mock riêng. Không được suy ra mọi quyền/kết nối trên project Supabase đang triển khai đã đúng từ các kết quả này.

### Những luồng frontend đạt trong lần chạy cuối

Guest/wrong password bị từ chối; UI bắt buộc MFA trước khi có session; cookie HttpOnly và không lưu provider token vào localStorage; mutation thiếu CSRF bị chặn; CRM tải 30 lead rồi thêm đủ 35; filter trạng thái rỗng; detail/reveal theo quyền; note, assignment, chuyển trạng thái và conflict 409; recompute chỉ báo queued; chọn plan trong admin; tạo draft bằng nút UI, publish, báo giá public API; CSV preview/apply chỉ tạo draft; báo cáo và rebuild; settings có expected version; R2 chưa cấu hình trả 503; logout chặn API private. Các trang được duyệt không phát sinh uncaught JavaScript exception trong phạm vi tài nguyên đã tải.

Diagnostic riêng xác nhận nút lưu settings thực sự ghi giá trị UI. Case settings trong bộ 27 case kiểm tra API trực tiếp. Bộ test không bao phủ mọi thao tác ở từng màn hình hoặc mọi tổ hợp vai trò.

## Lỗi đã tái hiện và thứ tự sửa

### F-01 — P1: tên gói thực thi HTML trong trang quản trị giá

**Nguồn:** [pricing/index.html:238](/mnt/DATA/Workspace/PageFPT/src/pagefpt/templates/admin/pricing/index.html:238).

`loadPricesList()` lấy tên gói từ payload rồi chèn vào `tdPlan.innerHTML`. Diagnostic tạo một gói tổng hợp qua API admin với tên chứa thẻ `img` và event handler vô hại, tạo giá cho gói đó rồi tải bảng giá. Kết quả `stored_html_executed: true`: handler đã thực thi trong browser của admin.

Đây là stored XSS, cần ưu tiên sửa trước phát hành. Nội dung do người có quyền ghi danh mục nhập có thể chạy khi người khác xem bảng giá. Cookie HttpOnly không ngăn script cùng origin gửi request bằng phiên đang mở.

**Sửa:** tạo node bằng `createElement` và gán tên bằng `textContent`; xử lý các vị trí render dữ liệu động tương tự. Không dựa vào việc tên gói hiện tại nhìn bình thường. Chạy lại diagnostic và yêu cầu marker không thực thi, tên hiển thị như văn bản.

### F-02 — P1: chọn gói trên trang khách không liên kết bảng giá backend

**Nguồn:** [home.html:107](/mnt/DATA/Workspace/PageFPT/src/pagefpt/templates/client/home.html:107), [product_detail.html:56](/mnt/DATA/Workspace/PageFPT/src/pagefpt/templates/client/product_detail.html:56), [bottom_sheet.js:66](/mnt/DATA/Workspace/PageFPT/src/pagefpt/static/js/client/bottom_sheet.js:66).

Diagnostic bấm nút chọn gói thật trên trang chủ. Handler chỉ truyền tên và chuỗi giá viết sẵn; `selected_plan_id` vẫn `null`. Form chỉ gửi `plan_id` khi có UUID; hàm báo giá bỏ qua khi chưa có UUID. API báo giá đã vượt qua kiểm thử nhưng đường đi từ card sản phẩm tới API chưa được nối đúng.

Giá hiển thị trên các card và trang sản phẩm còn nằm trong HTML/dữ liệu preview; thay giá trong admin không chứng minh các chuỗi đó đổi theo. Gửi tư vấn chung có thể không chọn gói, nhưng bấm một gói cụ thể phải giữ đúng ID và snapshot báo giá của gói đó.

**Sửa:** render danh mục đã publish và gắn UUID thật cho CTA; dùng quote theo khu vực/kỳ thanh toán cho phần giá. Không có giá được duyệt thì hiển thị cần tư vấn. Test end-to-end từ đổi giá admin → chọn card → đổi khu vực → gửi form → đọc lead và snapshot; giữ khóa retry khi mất response.

### F-03 — P2: tạo lịch hẹn trả 422

**Nguồn:** [detail.html:739](/mnt/DATA/Workspace/PageFPT/src/pagefpt/templates/admin/leads/detail.html:739), [crm.js:351](/mnt/DATA/Workspace/PageFPT/src/pagefpt/static/js/admin/crm.js:351), [appointments.py:17](/mnt/DATA/Workspace/PageFPT/src/pagefpt/modules/leads/appointments.py:17).

Frontend gửi `kind: "appointment"`; schema backend chỉ nhận `callback`, `survey` hoặc `installation`. Browser ghi nhận POST 422; đọc lại danh sách vẫn có 0 lịch. Test backend lịch hẹn hiện có dùng enum đúng nên không bắt được sai khác ở JavaScript.

**Sửa:** đồng bộ cả caller và giá trị mặc định với enum backend, hoặc thêm lựa chọn loại lịch hợp lệ. Giữ `expected_version`, `due_at` có timezone; chỉ báo thành công sau khi API lưu và đọc lại được lịch.

### F-04 — P2: tràn ngang ở trang khách và admin mobile

Ma trận kiểm tra 8 trang × 6 độ rộng: 360, 375, 390, 430, 768, 1440px. Các phép đo không đạt:

| Độ rộng | `/` (scrollWidth) | `/admin/dashboard` | `/admin/settings` |
|---|---|---|---|
| 360 | 451 | 384 | 449 |
| 375 | 466 | 384 | 449 |
| 390 | 480 | Đạt | 449 |
| 430 | 519 | Đạt | 449 |
| 768 | 854 | Đạt | Đạt |

1440px và các trang còn lại đạt phép đo. Đây là kiểm tra chiều rộng viewport bằng Chrome; chưa phải chứng nhận tương thích thiết bị mobile thật.

Diagnostic xác định vùng poster/glow trên homepage, card dashboard và bảng `.leads-table` trong settings vượt viewport. Xem [home-mobile.png](home-mobile.png), [dashboard-mobile.png](dashboard-mobile.png), [settings-mobile.png](settings-mobile.png) và danh sách DOM `offenders` trong [diagnostics.json](diagnostics.json).

**Sửa:** xác định container gây tràn, giới hạn hiệu ứng trang trí; grid/flex item cần co được; bọc bảng trong vùng cuộn riêng. Chạy lại toàn ma trận và luồng form, tránh chỉ che overflow ở document khiến nội dung bị cắt.

### F-05 — P2: quên mật khẩu và gửi lại OTP còn là thao tác giao diện

**Nguồn:** [login.html:673](/mnt/DATA/Workspace/PageFPT/src/pagefpt/templates/admin/login.html:673), [login.html:700](/mnt/DATA/Workspace/PageFPT/src/pagefpt/templates/admin/login.html:700), [login.html:846](/mnt/DATA/Workspace/PageFPT/src/pagefpt/templates/admin/login.html:846).

Diagnostic chạy ba bước khôi phục với tài khoản và mật khẩu tổng hợp. UI chuyển bước và báo đã chuyển tới Supabase Auth, nhưng không phát sinh POST recovery nào (`password_recovery_post_paths: []`). Mã sáu ký tự được chấp nhận ở frontend mà không được provider xác minh. `resendOtpCode()` cũng chỉ hiển thị toast và đặt lại bộ đếm.

Không có bằng chứng mật khẩu thật đã đổi; đây là chức năng chưa kết nối, không phải bằng chứng vượt qua xác thực backend. Login/MFA chính đã vượt qua test với adapter Auth mô phỏng.

**Sửa:** tích hợp recovery/reset đúng luồng provider đã cấu hình, callback và trạng thái lỗi; phân biệt TOTP từ ứng dụng xác thực với mã được gửi qua kênh khác. Nếu chưa hỗ trợ thì không thông báo đã gửi/đổi thành công. Kiểm thử provider thất bại, token hết hạn, token dùng lại và tài khoản không tồn tại.

## Khoảng trống từ review mã nguồn, chưa coi là runtime test đạt

| Vấn đề | Bằng chứng nguồn | Việc cần làm |
|---|---|---|
| HTML preview chỉ được mount ở development/test | [application.py:83](/mnt/DATA/Workspace/PageFPT/src/pagefpt/application.py:83) | Xác định nơi phục vụ frontend production và origin gọi API. Không đổi production sang development để bật preview. Kiểm thử URL triển khai thật. |
| URL chính sách bảo mật render lại homepage | [client_routes.py:110](/mnt/DATA/Workspace/PageFPT/src/pagefpt/web/client_routes.py:110) | Tạo nội dung chính sách đúng hoạt động thực tế và nối link bên cạnh form. |
| Realtime frontend hiện dùng polling 5 giây; có thể mất filter/pagination khi refresh | [realtime.js:14](/mnt/DATA/Workspace/PageFPT/src/pagefpt/static/js/admin/realtime.js:14), [realtime.js:22](/mnt/DATA/Workspace/PageFPT/src/pagefpt/static/js/admin/realtime.js:22) | Giữ filter/cursor khi refetch; bổ sung subscription và đo thời gian admin thấy lead trên staging nếu cần mục tiêu khoảng 1 giây. Chưa đo hosted Realtime. |
| Nút export mới xếp hàng và hiện ID | [leads/index.html:229](/mnt/DATA/Workspace/PageFPT/src/pagefpt/templates/admin/leads/index.html:229) | Nối polling trạng thái và tải URL ký khi completed; xử lý failed/expired. Fixture chưa cấu hình R2 nên browser chỉ xác nhận thông báo lỗi 503. |
| Demo session development dùng actor chuỗi ngoài UUID | [authorization.py:27](/mnt/DATA/Workspace/PageFPT/src/pagefpt/api/authorization.py:27) | Dùng Auth/membership hợp lệ cho thử nghiệm CRM. Bộ browser này dùng actor UUID thật trong database tổng hợp; không xác nhận demo session chạy được toàn bộ RPC. |

## Hiệu năng và phạm vi chưa kiểm chứng

Benchmark mới chạy API intake với database tổng hợp: burst 50 request, 60 giây ở 5 request/giây, rồi burst 100; tổng 450 request. Các percentile và lỗi được ghi trực tiếp vào [performance.json](performance.json) và [performance.log](performance.log).

| Kịch bản | p50 | p95 | p99 |
|---|---|---|---|
| Burst 50 | 144,471 ms | 201,888 ms | 207,542 ms |
| Duy trì 5 request/giây | 47,338 ms | 63,687 ms | 83,191 ms |
| Burst 100 | 1.189,650 ms | 1.481,273 ms | 1.504,036 ms |

Không có HTTP lỗi trong 450 request. Kịch bản burst 100 vượt mục tiêu server p95 500 ms của kế hoạch trong môi trường đo này; cần profiling và đo lại với gateway/connection của staging trước khi nhận tải tương ứng. Không chỉ lấy percentile ở tải nhẹ để kết luận đáp ứng mọi mức tải.

Số đo chỉ gồm ASGI cục bộ + PostgreSQL qua Unix socket. Không có chi phí Vercel cold start, internet RTT, hosted PostgREST, worker enrichment đồng thời hoặc client tải tài nguyên. Vì vậy không dùng số đo này làm cam kết p95 hoặc realtime trên production. Chưa đo Core Web Vitals/Lighthouse trên bản triển khai thật.

Chưa kiểm chứng kết nối cloud Supabase Auth/JWKS, Data API schema exposure, RLS/Realtime configuration, queue wake/cron, R2 bucket CORS/lifecycle/presigned upload thực, domain/cookie/CORS của frontend deploy, webhook của provider, conversion ở tài khoản quảng cáo thật và khôi phục sau sự cố mạng trên staging. Không có kết quả deploy hoặc migration hosted nào trong báo cáo này.

## Tái chạy

Python:

```bash
.venv/bin/pytest -q --tb=short
.venv/bin/ruff check src tests tools
.venv/bin/ruff format --check src tests tools
.venv/bin/mypy src
.venv/bin/python tools/check_architecture.py
.venv/bin/python -m build --no-isolation
.venv/bin/python tools/verify_wheel.py
.venv/bin/python tests/load/benchmark.py --duration 60 --output docs/qa/2026-10-01/performance.json
```

Browser tích hợp: khởi động fixture dưới đây ở terminal riêng, rồi chạy script. Cần Node, Playwright và Chrome. `NODE_PATH` chỉ cần khi Playwright nằm trong runtime dùng chung, chưa cài trong project.

```bash
.venv/bin/python -m uvicorn tests.e2e.integrated_server:app --host 127.0.0.1 --port 8092 --no-access-log
node tests/e2e/integrated.cjs
node tests/e2e/diagnostics.cjs
node tests/contracts/browser_api.mjs
```

Chạy `integrated.cjs` trên fixture mới để có đúng 35 lead ban đầu. `diagnostics.cjs` tạo thêm dữ liệu probe nên chạy sau bộ chính. Hai script chỉ nhận origin HTTP loopback; đây không phải scanner để chạy với dữ liệu khách thật. Trước khi sửa lỗi, exit code 1 của các assertion tương ứng là kết quả dự kiến nhưng vẫn là nghiệm thu thất bại.

Test mobile cũ dùng fixture `tests.e2e.server:app` ở cổng 8091; chạy `node tests/e2e/mobile.cjs` trong khi fixture đó hoạt động. Script ghi kết quả vào `docs/backend`; bản sao của lượt kiểm tra này đã lưu trong thư mục QA.

## Thay đổi của lượt kiểm thử

- Thêm fixture và hai script browser: `tests/e2e/integrated_server.py`, `integrated.cjs`, `diagnostics.cjs`.
- Thêm báo cáo, JSON, log, JUnit và screenshot trong thư mục QA này.
- Chỉ sửa format ở `src/pagefpt/modules/identity/sessions.py` và `tests/integration/test_web_ui.py`; chưa thay đổi logic production để sửa các lỗi được ghi nhận.
- Đã điều chỉnh bộ test tạo giá: sau POST 201, xác minh draft bằng GET API và DOM thay vì chờ đọc body response mà handler UI không sử dụng. Lượt browser chạy cuối xác nhận tạo giá đạt; timeout ban đầu không được liệt kê là lỗi sản phẩm.

Ưu tiên sửa F-01 và F-02, sau đó F-03/F-04/F-05; chạy lại cả các assertion thất bại lẫn các luồng đang đạt. Chỉ sau khi có kết quả staging cho cấu hình cloud thực mới nghiệm thu kết nối triển khai.
