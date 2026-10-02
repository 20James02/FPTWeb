# Gói cước và giá theo địa bàn

Phạm vi được người dùng yêu cầu: CRUD gói đồng bộ, checkbox địa bàn áp dụng, giá riêng tỉnh/thành và xã/phường, giá client theo lựa chọn. Giữ FastAPI/Jinja, RPC và phân quyền hiện tại; chỉ dữ liệu đã nhập/công bố được sử dụng.

- Region có `level=province|ward`, ward có parent_id tỉnh và cùng branch. Cấu trúc/branch bất biến; không ngừng tỉnh khi còn xã đang hoạt động. Vẫn đọc được region cũ như province.
- Plan có applicable_region_ids (rỗng = mọi địa bàn); province áp dụng cho tất cả ward con, ward chỉ chính nó. Không bịa giá/địa bàn.
- Giá: ward > province > group > default, kỳ và khoảng hiệu lực giữ nguyên, VAT không cộng hai lần. Quote lưu ward UUID; khuyến mãi tỉnh được kế thừa.
- Admin quản lý gói, bảng giá, địa bàn; checkbox tìm theo tên, chọn nhiều địa bàn dùng chung giá. Giá ngoại lệ nhập riêng bằng cùng form. Draft sửa trực tiếp; published sửa bằng thay thế nguyên tử, giữ lịch sử. Ngừng cung cấp/áp dụng thay cho xóa lịch sử có lead.
- Bulk insert/publish tối đa 500 dòng nguyên tử, rollback cả lô khi có lỗi/overlap/quyền. Published replacement CAS và nguyên tử, cùng plan/scope/term, ngày bắt đầu phải nằm trong khoảng giá cũ.
- Pagination UUID và lazy ward theo tỉnh để không tải mọi xã/phường. Server scoped permissions; MFA ở công bố và thay thế.
- Client đồng bộ province/ward giữa trang chủ và form; clearing quote ngay khi đổi địa bàn; generation fences với fetch timeout; client landing cũng chọn ward. Không nhận quote confirmed ngoài địa bàn áp dụng.
- Accessible native dialogs, label, error summary, controls44px/16px mobile, không overflow. Giữ IDs/calls tương thích nơi có ý nghĩa.
