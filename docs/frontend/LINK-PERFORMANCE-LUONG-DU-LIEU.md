# Hợp đồng nguồn content → form → chốt — 14/10/2026

Kiến trúc giữ FastAPI/Jinja2/vanilla JS, private PostgreSQL qua `api.dispatch`. Không chuyển việc đếm form/chốt sang event client. Bảng và chỉ số Admin mới ở `/admin/link-performance`; quyền Python `marketing.write`, SQL bắt buộc phạm vi toàn hệ thống. Nguồn API chi tiết sinh tại `frontend-contract.json` và `API-KET-NOI-CHI-TIET.md`.

## Luồng dữ liệu

`GET /r/{slug}` (content) hoặc `/s/{slug}` (voucher) → click tổng theo ngày/phiên bản; loại bot preview nhận diện được → đích nội bộ. `/r` trả signed `pf_link_source` + UTM, `/s` giữ cookie voucher chức năng và context nguồn. HEAD không cộng click.

`link_tracking.js` đọc nguồn và làm sạch URL hiện tại. Click/auxclick các anchor client cùng origin truyền nguồn qua query khi điều hướng; giữ query/hash khác, không truyền sang domain ngoài/Admin/API/static hoặc `/r`/`/s` nhận nguồn mới. Dù chưa đồng ý phân tích, form hiện tại vẫn có nguồn công khai; không lưu hành trình vào storage và không đo thời gian. Nếu dựng navigation bằng JavaScript khác phải truyền ngữ cảnh này, không tự gọi event chuyển đổi.

Khi đã xác nhận đồng ý phân tích ở server: `POST /api/v1/link-tracking/visit` body `{source_token, session_token, visit_token?}` → `{id,replayed,visit_token,source_at}`. Nguồn và phiên đo đều ký server, không tự tạo UUID/claim trên UI. Mỗi phiên bản nguồn khác có cohort đo riêng. Visit quay lại được giới hạn 30 phút; token tối đa 8 giờ.

SDK cộng thời gian chỉ trang visible/focused và còn hoạt động trong 60 giây; `POST /engagement` mỗi 15 giây khi thay đổi, body `{visit_token,session_token,page_id,sequence,total_ms}`. Mỗi page có sequence/cumulative riêng; server chống replay và giới hạn delta bởi thời gian server, tối đa 15 giây. Burst bucket 24, phục hồi 0,5 request/giây/visit; tối đa 128 page state/visit. Tạo/resume visit bucket 12, phục hồi 0,1 request/giây/session. 429 không phải lỗi form. Thu hồi đồng ý/xóa privacy xóa dữ liệu journey thô; aggregate vô danh giữ lại. SDK giữ packet chưa xác nhận để retry không cộng đôi.

Helper `api.js` lấy `PageFPTLinkTracking.leadContext()` → `{link_source_token,link_visit_token?}` vào LeadRequest. Form nhập Tên/số điện thoại/địa chỉ vẫn dùng quy trình cũ. Không đưa token vào local intent fingerprint; khi retry phải giữ body/key của request chưa rõ kết quả. Không log token/PII vào GA/Ads. Source sai/expired chỉ bỏ attribution, không làm mất lead hợp lệ; visit sai/expired không xóa source hợp lệ.

Lead INSERT trigger → `link_results` và `link_daily.forms` cùng transaction commit. Nhân viên transition CRM → current closed/installed/invalid, actual closer và thời gian, aggregate cùng transaction. Đây là nguồn cho “chuyển đổi thành công từ link”, không dùng nút bấm, UI toast hoặc event `generate_lead` làm bằng chứng chốt.

## API Admin

| Method/path | Payload / response |
|---|---|
| GET `/api/v1/admin/link-performance/report` | start/end YYYY-MM-DD (UI dd/mm/yyyy), khoảng tối đa 93 ngày; platform, creator UUID, kind content/voucher, q, order, direction, limit ≤100, offset, link_id optional. `{items,total_count,start,end,timezone,totals,daily,closers}`. |
| GET `/api/v1/admin/link-performance` | `{items}` registry tối đa 1000; dùng report có pagination cho bảng lớn. |
| GET `/api/v1/admin/link-performance/options` | `{creators,targets}`. |
| POST `/api/v1/admin/link-performance` | `{title,slug,target,platform,utm_medium,utm_campaign,utm_content,content_note,active}`; 201 registry. Creator/time do server xác định. |
| PUT `/api/v1/admin/link-performance/{id}` | các field trên + expected_version. 409 cần refresh, không tự overwrite. Source platform/UTM immutable khi có dữ liệu; cần tạo link mới. Với voucher chỉ tên/note/active ở đây. |
| POST `/api/v1/admin/link-performance/bulk` | `{action:'pause'|'activate',items:[{id,expected_version}]}` tối đa 50; `{items:[{id,saved,version? ,code?}]}`. Hiển thị thành công/thất bại từng mục, không gọi cả batch thành công nếu một mục lỗi. |

Mỗi row report gồm metadata registry, raw_clicks/bot_clicks/clicks/forms/closed/installed/invalid/erased/measured_visits/timed_visits/average_engagement_ms/mature_visits/mature_forms/mature_closed/ranking_score/measured_platforms/ranking. Các tỷ số UI dùng denominator thích hợp; denominator=0 hoặc time null là “Chưa đo/Chưa có tỷ lệ”. `ranking` gồm state,samples,form_rate,closed_rate,form_interval,closed_interval,score,maturity_days,minimum_samples. Chỉ ready khi có ít nhất 30 phiên trưởng thành; score=cận dưới closed interval×100.

Closers là `{closer_id,name,closed,average_hours}` trong nguồn/date đang lọc, không phải creator hoặc assignee hiện tại. Hồ sơ đã xóa PII chỉ còn aggregate nên không còn trong danh sách đối chiếu nhân viên. CSV chỉ trang hiện tại, vô hiệu hóa spreadsheet formulas. Bảng hỗ trợ sort server hai chiều, checkbox/bulk, dd/mm/yyyy, dialog native/focus, light/dark và vùng cuộn bảng riêng ở mobile.

## Component cho Antigravity

Giữ ID/endpoint/state contract của `admin/link_performance.html` và `static/js/admin/link_performance.js` khi thay thiết kế. KPI/funnel/trend/table/detail/editor là các khối độc lập. Null không tô thành 0 hoặc “thất bại”; không bịa lượt người đang xem, hiệu quả, creator hoặc conversion cũ. Bất kỳ trang client/landing mới phải kế thừa `client_base.html` hoặc tích hợp đủ consent/session/SDK/form helper tương đương, giữ preview tắt tracking.
