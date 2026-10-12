# Triển khai tài khoản, MFA và phân tích — 07/10/2026

Đã triển khai và đọc lại tên miền xác nhận **READY**:

- Website: [fpt-vungtau.com](https://fpt-vungtau.com).
- Trang mới: [Tài khoản & MFA](https://fpt-vungtau.com/admin/account), [Báo cáo hiệu quả](https://fpt-vungtau.com/admin/reports), [Dashboard](https://fpt-vungtau.com/admin/dashboard). Chưa đăng nhập thì chuyển `/admin/login`.
- Project Vercel: `pettravel/fpt-web`, project id `prj_loHu34Po87yGsB2U4z2Fxf0LACUi`.
- Deployment cuối: `dpl_HbcEvz3Nspxjupiwk2pFiLKGdJ3v`; candidate `https://fpt-gt112vz37-pettravel.vercel.app`, target production, trạng thái READY. Đã deploy `--prod --skip-domain`, kiểm tra candidate, promote, rồi inspect domain thấy cùng id.
- Bản cùng chức năng trước bản vá giữ lựa chọn vai trò: `dpl_4sVLsvmNY6MRE7D5zPZWWw1K9H7f`. Khi rollback ứng dụng sau người dùng đổi mật khẩu, ưu tiên bản đã hỗ trợ login fence; các bản lịch sử 06/10 chưa gửi thời điểm bắt đầu login vào SQL.
- Supabase `FPTWeb`, ref `ryfdlhmbytabinsbxbup`: migration `20261007021006_accounts_analytics`, 15 migrations / 39 bảng private bật RLS. File local đã khớp version migration cloud. Không tạo dữ liệu nhân viên hoặc đổi MFA/mật khẩu tài khoản thật trong quá trình triển khai.
- Không thay keys, config R2 hoặc Telegram. Environment ứng dụng vẫn staging với domain công khai; không chuyển sang development. Placeholder/mẫu giữ trong Admin; nội dung client theo trạng thái công bố như hiện có.

## Kiểm chứng

| Phạm vi | Kết quả |
|---|---|
| Toàn bộ Python | 255 passed, 57.97 giây |
| Ruff / format / mypy / import boundaries | Đạt; 144 file format, 93 source files |
| Hợp đồng JS | 12 files đạt |
| Browser account/MFA/staff/reports/dashboard | 23 checkpoints đạt, 1440/768/390/360, dark, không pageerror |
| Client fixture | Menu/keyboard/mobile và gửi form ngắn SQL thật đạt |
| Candidate cuối | 12 HTTP checks đạt; các asset mới đúng SHA256 source |
| Domain cuối | 12 checks đạt: public/health/login 200, private API 401, private HTML chuyển login303, www308 giữ path/query; asset mới đúng SHA256 source |
| Client cloud | Sáu trang, năm kích thước; logo/hotline/3D/navbar/form/login/www đạt, không pageerror hoặc server500; không gửi lead/mã khôi phục thật |
| Upload | 189 entries; không `.env`, keys hoặc thư mục credentials; mã/asset mới có trong manifest |

Evidence riêng ngoài Git/deployment: `.local/deploy-cli/deployment-accounts.json`, `domain-accounts-inspect.json`, `cloud-smoke-accounts.json`, `cloud-live-accounts.json`, `deployment-accounts-upload-safety.json`; browser fixture `.local/qa/accounts-analytics/result.json`. Hồi quy client cloud chạy sau release đầu cùng mã client; bản cuối chỉ bổ sung giữ lựa chọn role/branch khi tìm kiếm nền trả về trong lúc mở dialog nhân viên, đã kiểm thử lại bằng fixture.

## Việc chủ tài khoản cần làm

Đăng nhập, mở **Tài khoản & MFA**, đặt tên thiết bị, quét QR bằng ứng dụng xác thực và nhập sáu số. Thêm thiết bị dự phòng trước khi thay thiết bị. Nhân viên mới phải tự thiết lập MFA trước khi đọc dữ liệu nghiệp vụ; tài khoản thật không được tự bật MFA thay người dùng.

Cloud self-service cần tài khoản/thiết bị thật nên không thử thay mật khẩu hoặc quét QR bằng công cụ. Các luồng đã kiểm chứng bằng fixture Auth và SQL thật, kể cả lỗi provider/DB và đăng nhập đồng thời. [Chi tiết và giới hạn advisor](../qa/2026-10-07-admin-accounts-analytics.md), [hướng dẫn và hợp đồng API](../backend/admin-accounts-analytics.md).
