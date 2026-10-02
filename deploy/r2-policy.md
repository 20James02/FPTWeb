# R2: cấu hình để operator review

Dùng hai bucket riêng. `PAGEFPT_R2_BUCKET` private chứa quarantine/export; không bật public access. `PAGEFPT_R2_PUBLIC_BUCKET` chỉ nhận ảnh WebP đã kiểm tra và re-encode. Media public dùng custom HTTPS domain trong `PAGEFPT_MEDIA_DOMAIN`.

API token chỉ có Object Read & Write trên hai bucket cần thiết. Không đưa token vào client. Client nhận presigned PUT 300 giây cho quarantine, không được chọn key/bucket. Finalize xác minh thực tế nội dung ảnh và kích thước; không dựa vào MIME do client khai báo. Download export dùng GET 60 giây sau kiểm tra quyền/MFA/audit/epoch.

CORS private bucket chỉ cho origin canonical và preview staging được duyệt, phương thức PUT, header Content-Type. Không dùng `*` với các origin nhạy cảm. Ví dụ để điền origin thật qua dashboard/CLI:

```json
[{
  "AllowedOrigins": ["https://REPLACE_WITH_SITE_ORIGIN"],
  "AllowedMethods": ["PUT"],
  "AllowedHeaders": ["Content-Type"],
  "MaxAgeSeconds": 300
}]
```

Lifecycle private: prefix `quarantine/` xóa sau 1 ngày; prefix `exports/` xóa sau 7 ngày để dọn orphan khi worker thất bại. Kiểm tra prefix từ `infrastructure/r2.py` trước apply. Không đặt lifecycle xóa tất cả ảnh đã publish. Backend vẫn có cleanup/erase job; lifecycle là dự phòng.

Kiểm tra staging: PUT bằng URL thật; ảnh giả, SVG, file quá lớn bị từ chối; ảnh publish không còn metadata gốc; export hết hạn; sau privacy erase không phát hành URL mới và object bị dọn. URL đã phát hành có cửa sổ tối đa 60 giây trước hết hạn, không thể thu hồi chữ ký S3 riêng lẻ tức thì.

Theo [presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [CORS](https://developers.cloudflare.com/r2/buckets/cors/) và [lifecycle](https://developers.cloudflare.com/r2/buckets/object-lifecycles/). Chưa apply bucket policy hoặc xác minh tài khoản R2 thật trong phiên này.
