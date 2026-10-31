# Triển khai lên Cloudflare Workers

Worker `english-learning-hub` phục vụ cả giao diện trong `frontend/dist` và API
cùng tên miền. Website tiếp tục gọi `/api/translate`, không cần chạy 9Router hay
máy tác giả. Chỉ văn bản người dùng gửi dịch được chuyển tới Gemini; thư viện từ
vựng tiếp tục nằm trong IndexedDB.

| API | Hành vi |
| --- | --- |
| `POST /api/translate` | Kiểm tra dữ liệu, hạn mức, gọi Gemini, xác thực kết quả |
| `GET /api/translate/usage` | Trả số lượt và thời điểm được gửi tiếp |

## Chuẩn bị và kiểm thử

Chạy trong `frontend` với Node 24 và pnpm ghi trong `package.json`:

```powershell
corepack pnpm install --frozen-lockfile --ignore-scripts
corepack pnpm exec wrangler login
corepack pnpm exec wrangler whoami
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm worker:check
corepack pnpm audit --audit-level=high
```

Tests dùng Miniflare/workerd và phản hồi AI giả, không gọi Gemini thật. Cần cho
phép tiến trình con và cổng localhost. `worker:check` chỉ đóng gói, không deploy.
Overrides trong `pnpm-workspace.yaml` vá các phiên bản `undici`/`sharp` bị công cụ
Cloudflare ghim cứng; xem lại khi nâng công cụ. Không dùng `audit fix --force`.

## Cấu hình Gemini và deploy

`wrangler.jsonc` chứa các biến máy chủ không bí mật:

```text
OPENAI_HOST=https://generativelanguage.googleapis.com/v1beta/openai
OPENAI_MODEL=gemini-3.6-flash
```

Dùng Gemini API key cho Secret `OPENAI_API_KEY` của Worker. Worker chỉ chấp nhận
endpoint Gemini hoặc NVIDIA đã được cho phép và không theo chuyển hướng chứa key.
Gemini dùng structured output; kết quả vẫn được kiểm tra trước khi trả về.
Kiểm tra quota, điều khoản và chi phí nhà cung cấp trước khi mở cho công chúng;
code không mua gói hoặc bật thanh toán. `.env.local` không được tự nhập lên cloud.

```powershell
corepack pnpm run deploy
corepack pnpm exec wrangler secret put OPENAI_API_KEY
corepack pnpm exec wrangler secret list
```

Nhập key trong lời nhắc Wrangler, không gửi vào chat. Nếu đã có Secret trên đúng
Worker và tài khoản, deploy giữ lại nó; Secret ở Pages hoặc Worker khác không
được chia sẻ tự động. Lần đầu, API trả 503 cho đến khi có Secret và không gọi AI.
Nếu có nhiều tài khoản, đặt `CLOUDFLARE_ACCOUNT_ID` trong terminal trước khi deploy.

Wrangler áp dụng migration `v1` tạo SQLite Durable Object và binding
`TRANSLATION_LIMITS`. Không sửa tag migration đã áp dụng, đổi tên class hoặc
namespace tùy tiện: namespace mới không giữ bộ đếm cũ. Bộ đếm local không được
chuyển lên cloud, và IndexedDB của người dùng không bị thay đổi.

Để thử trên máy, sao chép `.dev.vars.example` thành `.dev.vars`, điền Gemini API key
và chạy `corepack pnpm worker:dev` sau build. File thật bị Git bỏ qua. Những lần
gửi dịch thực tế vẫn dùng quota Gemini.

## Xác minh và phục hồi

Mở URL `workers.dev` Wrangler trả về. Kiểm tra VN/EN, bảng từ và tải lại trang.
Trong Network, `/api/translate/usage` phải trả JSON với `Cache-Control: no-store`,
cookie `HttpOnly; Secure; SameSite=Strict` và số lượt còn lại. Kiểm tra CSP trên
HTML và header bảo mật trên API. `/api/*` không tồn tại phải trả JSON 404 thay vì
trang HTML. Thử một bản dịch ngắn sau khi có key để xác minh model/tài khoản;
lượt này tính quota. Worker giữ định dạng kết quả frontend hiện có: bản dịch và
tối đa 5 mục từ đầy đủ.

Nếu phát hành lỗi, dùng phiên bản trước trong Cloudflare Deployments hoặc
`corepack pnpm exec wrangler rollback`. Không xóa namespace để sửa lỗi. Workflow
GitHub chỉ kiểm tra mã, không tự deploy hoặc lưu khóa production.

## Hạn mức và dữ liệu

Cấu hình hiện tại: 30 lượt/trình duyệt/ngày, 100 lượt/IP/ngày, 1.000 lượt/toàn website/ngày,
chờ 10 giây theo trình duyệt và IP, đặt lại ngày lúc 00:00 UTC+7. Đổi các biến
`TRANSLATE_*` trong `wrangler.jsonc` rồi deploy để điều chỉnh. Một Durable Object
chung tăng và kiểm tra các bộ đếm nguyên tử, kể cả nhiều yêu cầu đồng thời.
Lỗi/timeout/hủy sau khi gửi AI vẫn tính lượt; đầu vào sai hoặc thiếu cấu hình không
tính lượt. Hỏng storage chặn cuộc gọi AI, không bỏ qua giới hạn.

SQLite chỉ lưu secret ký cookie, mã trình duyệt/IP đã băm HMAC, số lượt và thời
gian. Không lưu prompt, kết quả, API key hoặc từ vựng. Alarm dọn bộ đếm cũ sau
khoảng 2–3 ngày; secret được giữ để bảo toàn cookie qua lần khởi động lại.
Cookie là định danh ẩn danh, không phải tài khoản: xóa cookie không vượt được
giới hạn IP/toàn website. Người chung IP dùng chung hạn mức IP. Giới hạn lượt
không chống được mọi bot hoặc mọi chi phí Cloudflare; theo dõi quota cả hai dịch vụ.
Không đưa key hoặc nội dung dịch vào log.

Tài liệu chính thức:
- [Assets và routing](https://developers.cloudflare.com/workers/static-assets/binding/)
- [SQLite Durable Object](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- [Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Gemini OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai/)
