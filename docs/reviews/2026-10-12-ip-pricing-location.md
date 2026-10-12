# Kiểm chứng gợi ý địa bàn và giá theo IP — 12/10/2026

## Phạm vi và hành vi

- Trang chủ, landing và trang đo tốc độ dùng chung gợi ý tỉnh/thành để tải giá theo địa bàn đã công bố.
- Ưu tiên lựa chọn hợp lệ đã lưu và thao tác của khách. Kết quả IP đến muộn, lỗi hoặc hết thời gian chờ không ghi đè lựa chọn đó.
- Chỉ đối chiếu duy nhất tên hoặc bí danh tỉnh trong danh mục công bố. Nhãn ISO từ Unicode CLDR 48 không được coi là mã hành chính Việt Nam; không tự suy diễn địa bàn sau sáp nhập.
- Hiển thị rõ “Khu vực ước tính theo IP”. Không tự chọn xã/phường, không lưu gợi ý IP thành địa chỉ được xác nhận. Khách chọn xã/phường thì áp dụng báo giá xã và lưu cả tỉnh cha.
- Landing được bổ sung lựa chọn xã/phường. Trang đo tốc độ giữ riêng chức năng gợi ý từ quyền vị trí thiết bị hiện có.
- Khôi phục danh sách xã và lựa chọn còn đang chờ khi quay lại bằng Back/BFCache. Gợi ý IP vẫn là ước tính sau khi khôi phục.

## API và tải hệ thống

GET `/api/v1/regions/location-suggestion` chỉ đọc metadata proxy Vercel tin cậy hoặc MMDB cục bộ đã cấu hình. Yêu cầu IP công cộng hợp lệ; không lấy IP do khách gửi qua query/body. Kết quả luôn có `ward_id: null`, `address_confirmed: false`, không trả IP hoặc tọa độ và dùng `Cache-Control: private, no-store`.

Tra gợi ý không gọi Supabase hay nhà cung cấp bên ngoài, không ghi sự kiện quảng cáo/analytics và không thay đổi lựa chọn đồng ý đo lường. Tên ISO được cache trong tiến trình. Client giới hạn thời gian chờ gợi ý 2,5 giây; tải giá tỉnh không chờ tải xong danh sách xã.

## Rà soát và tái hiện

Các ca kiểm thử bao gồm proxy giả, IP sai/riêng, nước ngoài, bí danh mơ hồ, tỉnh chưa công bố, khác biệt mã ISO/mã hành chính, lỗi/timeout, thao tác thủ công trong khi tra IP, tỉnh/xã đã lưu, landing preview và Back/BFCache giữa lúc tải xã.

Rà soát độc lập tìm ba điểm cần sửa: thiếu nhãn ước tính ở trang đo tốc độ; danh sách xã không khôi phục khi quay lại; mất lựa chọn xã đã lưu nhưng chưa tải xong. Các điểm này đã được tái hiện bằng kiểm thử thất bại trước khi sửa và kiểm tra lại đạt.

Browser dùng dữ liệu giả và bộ xử lý báo giá thật: kiểm tra giá tỉnh, giá xã, ưu tiên lựa chọn khi tải lại và chống ghi đè bởi kết quả đến muộn trên 9 bố cục (trang chủ, landing, đo tốc độ ở 320/390/1440 px). Không sử dụng hồ sơ khách thật.

## Kết quả kiểm chứng cuối

| Kiểm tra | Kết quả |
| --- | --- |
| `env -u PAGEFPT_TEST_DSN .venv/bin/python -m pytest -q` | 413 đạt, 114,33 giây; không bỏ qua test |
| `tools/run_js_contracts.py` | 26/26 tập hợp hợp đồng JavaScript đạt |
| `tests/e2e/ip_location.cjs` qua `tools/run_browser_smoke.py` | 9 bố cục đạt, mã thoát 0 |
| `ruff check src tests tools` | Đạt |
| `ruff format --check src tests tools` | 174 file đúng định dạng |
| `mypy src` và `tools/check_architecture.py` | Đạt trên 102 file nguồn Python |
| Đóng wheel và `tools/verify_wheel.py` | Đạt: import độc lập, templates, static assets, ASGI health |
| `git diff --check` | Đạt |

Các lệnh Ruff trên dùng đúng phạm vi CI. Thử mở rộng ra toàn workspace (`ruff check .` / `ruff format --check .`) còn báo lỗi có sẵn ở script khảo sát `audit_crawl.py` và đoạn ví dụ trong `docs/deploy/HUONG-DAN-VERCEL-SUPABASE-R2.md`; hai file đó không được sửa trong yêu cầu này.

Log lần chạy cuối: `.local/qa/ip-location/pytest-final.log`, `contracts.log`, `browser.log`. Ảnh kiểm tra lưu trong cùng thư mục. Tác vụ browser được bổ sung vào workflow CI; chưa có kết quả chạy GitHub Actions hay kiểm tra thiết bị iPhone vật lý trong lượt này.

## Trạng thái triển khai

Thay đổi hiện ở workspace, chưa triển khai production. Phần gợi ý này không cần migration Supabase. Trên máy chủ Vercel thực cần `PAGEFPT_TRUSTED_VERCEL_PROXY=true`; giữ `false` ở máy chủ trực tiếp không có proxy Vercel tin cậy. Việc chạy thử cục bộ với metadata giả không chứng minh cấu hình hoặc độ chính xác địa lý trên production.

IP không bảo đảm xác định đúng tỉnh và không đủ xác định chính xác xã/phường hoặc địa chỉ lắp đặt. Khách cần chọn hoặc xác nhận địa bàn thực tế.

Nguồn kỹ thuật: [Vercel request headers](https://vercel.com/docs/headers/request-headers), [MaxMind geolocation accuracy](https://support.maxmind.com/knowledge-base/articles/maxmind-geolocation-accuracy), [Unicode CLDR 48 subdivision labels](https://github.com/unicode-org/cldr/blob/release-48/common/subdivisions/vi.xml).
