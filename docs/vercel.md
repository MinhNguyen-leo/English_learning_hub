# Triển khai English Learning Hub trên Vercel

Ứng dụng dùng Vercel Functions để gọi Gemini phía server và Upstash Redis để
duy trì hạn mức giữa các Function. Các Function không gọi Gemini khi Redis
thiếu cấu hình hoặc không sẵn sàng.

1. Import repository vào Vercel, chọn **Root Directory** là `frontend` và dùng
   preset Vite. Cấu hình trong `frontend/vercel.json` đặt Function ở `iad1`;
   lựa chọn này không đảm bảo Google chấp nhận IP, cần kiểm tra sau triển khai.
2. Tạo Redis qua Vercel Marketplace (Upstash). Kiểm tra giới hạn và chi phí
   trước khi tạo. Chọn cùng môi trường Production/Preview với website.
3. Trong Vercel Project Settings → Environment Variables, cấu hình cho môi
   trường tương ứng:
   - `GEMINI_API_KEY`: Gemini API key, đặt ở server, không có tiền tố `VITE_`.
   - `GEMINI_MODEL`: tùy chọn, mặc định `gemini-3.6-flash`.
   - `UPSTASH_REDIS_REST_URL` và `UPSTASH_REDIS_REST_TOKEN`: REST URL và token
     có quyền ghi của Redis. Nếu Marketplace tạo biến tên khác, ánh xạ chúng
     thành đúng các tên này trong cấu hình dự án.
   - `TRANSLATE_QUOTA_SECRET`: chuỗi ngẫu nhiên bí mật tối thiểu 32 ký tự,
     dùng ký cookie và băm định danh. Có thể tạo bằng
     `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
     Không gửi các giá trị này vào chat hoặc commit chúng.
4. Deploy lại sau khi cấu hình biến. Mở `/api/translate/usage`, rồi thử dịch
   một đoạn ngắn. Lần thử thực tế sử dụng quota Gemini và Upstash. Nếu gặp 503,
   kiểm tra cấu hình secret và kết nối Redis; nếu Gemini trả lỗi vùng, xem log
   của Vercel và xác nhận project/key, không giả định đổi nền tảng chắc chắn sửa.

Hạn mức mặc định: 30 lượt/thiết bị/ngày, 100 lượt/IP/ngày, 1.000 lượt toàn
website/ngày, chờ 10 giây giữa các lượt; reset lúc 00:00 UTC+7. Bộ đếm và
thời gian chờ được cập nhật nguyên tử; chỉ lưu HMAC của định danh và IP, không
lưu văn bản dịch. Hủy/lỗi sau khi gửi vẫn tính lượt. Đổi quota secret sẽ tạo
định danh thiết bị và IP mới; bộ đếm toàn hệ thống vẫn được giữ trong ngày.
Các deployment dùng cùng Redis và cùng secret sẽ dùng chung hạn mức; dùng Redis
riêng cho Preview nếu không muốn chia sẻ quota với Production.

**Dữ liệu trên trình duyệt:** IndexedDB gắn với origin. Nếu địa chỉ Vercel khác
địa chỉ Cloudflare, dữ liệu sẽ không tự xuất hiện tại địa chỉ mới. Trước khi
chuyển, dùng chức năng sao lưu toàn bộ trên site cũ, sau đó mở site mới và
khôi phục bản sao lưu. Giữ site và dữ liệu cũ cho đến khi đã xác minh bản sao.
Nếu chuyển chính custom domain đang dùng sang Vercel và origin không đổi,
IndexedDB vẫn thuộc origin đó.
