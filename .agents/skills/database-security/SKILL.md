---
name: database-security
description: Thiết kế và rà soát schema, migration, Supabase RLS, quyền truy cập và truy vấn an toàn cho English Learning Hub; dùng khi thay đổi tầng dữ liệu hoặc cần kiểm tra sự cô lập dữ liệu giữa người dùng.
---

# Database security

## Bối cảnh và phạm vi

- Đọc `AGENTS.md`, tài liệu schema trong `docs/` nếu có, migration, adapter và cấu hình thực tế trước khi đề xuất thay đổi.
- Định hướng là Dexie/IndexedDB cho guest, Supabase Postgres và Supabase Auth cho cloud, FastAPI ở giai đoạn sau. Hiện không giả định database, backend, migration runner hoặc cloud credentials đã tồn tại.
- Dùng Supabase Auth cho danh tính; không tạo hệ thống mật khẩu/auth riêng. Chỉ thiết kế hoặc triển khai phần dữ liệu được yêu cầu, không tự provision dịch vụ hay chạy migration lên cloud.

## Schema và migration

- Xác định quyền sở hữu dữ liệu, khóa chính ổn định, khóa ngoại, nullability và constraint theo nghiệp vụ. Với dữ liệu riêng tư của tài khoản, gắn ownership với danh tính Supabase Auth; tạo index phục vụ truy vấn theo owner và quan hệ thực tế.
- Kiểm tra quan hệ con/cha không thể nối sang dữ liệu của người khác: dùng constraint và/hoặc policy kiểm tra quyền sở hữu bản ghi cha. Không chỉ kiểm tra `user_id` của bản ghi con.
- Viết migration có version theo công cụ đang dùng; nêu tác động dữ liệu, thứ tự áp dụng, cách xác minh và phục hồi. Ưu tiên thay đổi bổ sung tương thích; kiểm tra dữ liệu cũ trước khi thêm constraint bắt buộc.
- Với Dexie, giữ version schema rõ ràng và test nâng cấp từ phiên bản trước khi có migration. IndexedDB là lưu trữ phía client, không thay thế kiểm soát quyền phía server; không xóa dữ liệu guest để nâng cấp.
- Không chạy DROP, TRUNCATE, xóa dữ liệu hay migration phá hủy nếu chưa có phê duyệt rõ ràng. Giới hạn kiểm tra có ghi dữ liệu trong database test được phép, không dùng production.

## RLS và quyền tối thiểu

- Bật RLS cho bảng dữ liệu người dùng được truy cập qua Supabase API. Cấp quyền tối thiểu cho từng role; guest dùng dữ liệu local không đồng nghĩa role `anon` được đọc dữ liệu cloud riêng tư.
- Bao phủ SELECT, INSERT, UPDATE và DELETE. Dùng `USING` để giới hạn bản ghi hiện có và `WITH CHECK` để kiểm tra giá trị mới khi phù hợp; ngăn thay `user_id` hoặc khóa ngoại để chuyển ownership.
- Ràng buộc ownership với `auth.uid()` đã được xác thực; không tin `user_id` do client gửi. Với FastAPI nếu đã có, xác minh JWT bằng cấu hình của dự án và kiểm tra quyền trên mỗi tài nguyên; không chỉ decode token hoặc kiểm tra trên UI.
- Không dùng service-role/secret key cho thao tác người dùng thông thường vì có thể bỏ qua RLS. Chỉ public/publishable key được phép ở frontend; mọi biến `VITE_*` phải được coi là công khai. Không ghi secret vào mã, log hay fixture.
- Rà soát view, function/RPC và `SECURITY DEFINER` nếu có để tránh vô tình vượt quyền; giới hạn quyền execute và cố định `search_path` cho hàm đặc quyền khi thực sự cần.

## Truy vấn và kiểm chứng

- Dùng truy vấn tham số hóa hoặc API query builder của thư viện đang có; không nối input vào SQL. Với tên cột, sort hoặc identifier không thể bind, dùng allowlist cố định. Validate và giới hạn input tại ranh giới API.
- Trong môi trường test được phép, tạo hai người dùng A/B và trường hợp chưa đăng nhập. Kiểm tra mỗi thao tác CRUD: A chỉ thao tác dữ liệu A, B không đọc/sửa/xóa dữ liệu A, người chưa đăng nhập bị từ chối đối với dữ liệu riêng tư.
- Thử giả mạo owner, chuyển owner khi update và tham chiếu bản ghi cha của người khác. Kiểm tra qua role/JWT người dùng thông thường, không dùng tài khoản admin/service-role để chứng minh RLS.
- Bao gồm trường hợp truy cập hợp lệ để phát hiện policy chặn toàn bộ. Test phải xác minh dữ liệu thực tế sau thao tác bị từ chối; không chỉ dựa vào HTTP status vì RLS có thể trả tập rỗng hoặc không tác động hàng nào.
- Báo schema/policy thay đổi, migration đã viết và có thực thi hay chưa, môi trường/role đã kiểm tra, kết quả và giới hạn. Không khẳng định an toàn RLS nếu chỉ đọc SQL hoặc chưa có môi trường test.
