# Skills cho PageFPT

Đã cài 26 skill vào `/home/thannv3/.codex/skills`. Codex cần tải lại danh sách skill ở lượt làm việc tiếp theo; nếu chưa xuất hiện, khởi động lại Codex.

## Nguồn và phạm vi

| Bộ | Số skill | Nguồn |
| --- | ---: | --- |
| Superpowers | 9 | https://github.com/obra/superpowers |
| Antigravity Awesome, hiện chuyển tới Agentic Awesome Skills | 16 | https://github.com/sickn33/agentic-awesome-skills |
| UI UX Pro Max | 1 | https://github.com/nextlevelbuilder/ui-ux-pro-max-skill |

Các bản được ghim theo commit trong `docs/skills/manifest.json`; không tự cập nhật theo HEAD. Đây là cài skill, chưa kết nối tài khoản hay triển khai dịch vụ.

## Chọn skill theo công việc

| Công việc | Skills |
| --- | --- |
| Quy trình và làm rõ quyết định mới | using-superpowers, brainstorming |
| Lập và thực hiện kế hoạch | writing-plans, executing-plans |
| Kiểm thử, sửa lỗi và review | test-driven-development, systematic-debugging, requesting-code-review, receiving-code-review, verification-before-completion |
| Python/FastAPI và xử lý bất đồng bộ | python-patterns, fastapi-pro, async-python-patterns |
| Kiểm thử và tốc độ Python | python-testing-patterns, python-performance-optimization |
| Database, Auth, RLS, Realtime, queue | supabase, supabase-postgres-best-practices |
| Vercel và lưu trữ R2 | vercel-deployments, cloudflare-r2 |
| UI client/admin, responsive mobile | ui-ux-pro-max, fixing-accessibility |
| Tăng tỷ lệ gửi form và hiệu quả landing page | form-cro, page-cro |
| Đo lường quảng cáo và SEO | analytics-tracking, seo-audit |
| Tốc độ trang và bảo mật API | web-performance-optimization, api-security-best-practices |

Skill review có thể đề xuất agent phụ; chỉ tạo agent phụ khi người dùng hoặc hướng dẫn áp dụng cho phép. Cài skill không tự chạy quy trình hay test.

## UI UX Pro Max

Upstream tạo SKILL.md từ template thay vì có thư mục skill Codex hoàn chỉnh. `tools/install_uiux_skill.py` render template Codex đã tải, sao chép scripts/data và dùng đường dẫn tuyệt đối để phù hợp thư mục global Codex. Không dùng CLI npm, không cài thêm dependency; công cụ tìm kiếm dùng thư viện chuẩn Python.

Ví dụ tìm hướng dẫn:

```bash
python3 /home/thannv3/.codex/skills/ui-ux-pro-max/scripts/search.py "mobile form validation" --domain ux -n 2
python3 /home/thannv3/.codex/skills/ui-ux-pro-max/scripts/search.py "responsive layout" --stack html-tailwind -n 2
```

Hai truy vấn đã chạy thành công sau cài đặt. Chưa tạo design system cho sản phẩm; thực hiện khi bắt đầu thiết kế giao diện và kiểm tra kết quả phù hợp trước khi lưu.

## Cập nhật và giới hạn

Manifest ghi nguồn, commit, đường dẫn và SHA-256 của từng SKILL.md. Khi cập nhật: đối chiếu upstream, đọc thay đổi, sao lưu bản hiện tại rồi cập nhật có chủ đích. Script UI cần checkout upstream ở đường dẫn `/tmp/pagefpt-uiux`; nó từ chối ghi đè skill đã tồn tại.

Skill là hướng dẫn cho agent, không phải thư viện chạy trong website và không tự cải thiện tốc độ ứng dụng. Hiệu quả phải được kiểm chứng qua code, phép đo hiệu năng, test phân quyền và dữ liệu chuyển đổi thực tế.
