# Slide toàn chiều ngang và landing mobile — 09/10/2026

## Thay đổi

- Slide trang chủ bỏ container/cột chia đôi, border và lề quanh banner. Ảnh thật phủ chiều ngang viewport, chiều cao theo tỷ lệ ảnh gốc; không crop hoặc stretch. Mô tả/CTA nằm bên dưới trong vùng đọc có lề. Placeholder thiết bị khi chưa có banner giữ kích thước gọn.
- Landing mobile/preview: nhóm điểm nổi bật không còn giới hạn165px và flex-column. Dùng grid hai cột toàn chiều ngang nội dung; headline23–28px, highlight25–32px, icon32px. Hotline/CTA thu gọn, CTA mặc định một dòng và cao44px. Form vẫn dùng16px, không dùng transform để thu nhỏ toàn trang. Lớp nền tối giúp đọc chữ trên ảnh.
- Cấu hình Admin, chuyển slide, giảm chuyển động và desktop giữ các hành vi hiện có. Không đổi database/API/R2 hoặc nội dung ưu đãi.

## Chứng cứ kiểm tra

Kiểm tra kích thước trực tiếp trên HTML render từ template thật và CSS thật bằng Chromium + WebKit:

| Phạm vi | Kết quả |
|---|---|
| Banner trang chủ320/375/390/768/1440/1920px | 12 lượt đạt; cạnh trái0, chiều rộng bằng viewport, tỷ lệ ảnh đúng, không cuộn ngang |
| Landing305/320/375/390/430/767/768/1440px | 16 lượt đạt; mobile hai cột, chiều rộng features bằng copy, CTA44px, không cuộn ngang |
| `home_mobile.cjs` Chromium + WebKit | Mỗi browser9 nhóm đạt: Admin mobile,6 kích thước,12 dots, điều khiển và CTA, thẻ75%, lật/vuốt |
| `telecom_landing.cjs` Chromium + WebKit | Mỗi browser15 nhóm đạt: preview, draft/publish, form, giá/địa bàn, popup/menu,3/6/9 thẻ,320–1440px, kích thước thẻ, kỳ/phụ kiện/lead payload, upload và thao tác editor |

Before: banner320px chỉ rộng254px, cách mép33px; regression cạnh viewport thất bại. Landing305px: nhóm features165px trong copy277px, headline30px/highlight33px, CTA xuống dòng và cao60.78px. After: banner320px rộng320px/cạnh0, giữ tỷ lệ; landing305px features277px, title23px/highlight25px, CTA44px. Đã xem ảnh render320px để kiểm tra chữ/icon/nền ảnh.

Kiểm thử nghiệp vụ chạy Auth giả + FastAPI/PostgreSQL thật trong fixture riêng, không gửi form hoặc sửa cấu hình production. Không chạy lại full pytest vì bản sửa chỉ thay hai stylesheet và một template; kiểm tra browser tập trung vào phần thay đổi cùng các hành vi phụ thuộc. Máy chủ QA riêng được dừng sau kiểm thử.

## Triển khai

Upload thường với kiểm kê238 file, loại toàn bộ `.env*`, `.local`, môi trường Python và dữ liệu kiểm thử. Candidate cuối `dpl_J6BfXfsCX85mJEvJaYxpshKBsAXG` (`https://fpt-pg5d1w3jt-pettravel.vercel.app`) READY, đạt67 kiểm tra HTTP/asset trước promote. Đã promote project `pettravel/fpt-web`; inspect `https://fpt-vungtau.com` xác nhận đúng deployment READY.

Tên miền chính đạt69 kiểm tra HTTP/asset, gồm SHA256 của `client-mobile-home.css` và `telecom-landing.css` khớp mã nguồn. Không thực hiện ghi dữ liệu nghiệp vụ production. Deployment trước để rollback: `dpl_CBAtbyPP8w1ZRknzTue5o3BvTtds`. Candidate riêng cho slide ban đầu `dpl_9vXXqv88ZPKKK81WeAbFpza3KFVP` chưa promote, đã được thay bằng candidate cuối bao gồm yêu cầu landing mobile bổ sung.
