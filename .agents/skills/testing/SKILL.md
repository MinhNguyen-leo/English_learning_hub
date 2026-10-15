---
name: testing
description: Viết, chạy và đánh giá kiểm thử hành vi bằng Vitest cho JavaScript hoặc TypeScript và Pytest cho Python trong English Learning Hub; dùng cho logic mới, hồi quy và các trường hợp biên quan trọng.
---

# Testing

## Khám phá trước khi viết test

- Đọc `AGENTS.md`, logic cần kiểm tra, `frontend/package.json`, lockfile và cấu hình test hiện có. Frontend dùng React/TypeScript/Vite; backend FastAPI được dự kiến cho giai đoạn sau.
- Dùng Vitest cho JS/TS và Pytest cho Python khi hạ tầng tương ứng có sẵn. Hiện không mặc định coi hai công cụ này đã được cài hoặc có script test. Không tự scaffold backend hoặc cài thư viện chỉ để thực hiện một kiểm tra; nếu thiếu công cụ, báo rõ và chỉ thiết lập khi phạm vi công việc cho phép.
- Đọc manifest và test layout Python thực tế nếu backend đã xuất hiện; không đoán đường dẫn hay dùng môi trường Python toàn cục thay môi trường của dự án.

## Chọn trường hợp có giá trị

- Kiểm tra kết quả quan sát được và quy tắc nghiệp vụ, không khóa chặt cấu trúc hàm, state nội bộ hoặc class CSS. Không tạo test chỉ để lặp lại implementation.
- Với mỗi quy tắc thay đổi, ưu tiên happy path, input không hợp lệ và trường hợp biên có tác động thực tế. Chỉ chọn các trường hợp tương ứng tính năng đã triển khai:
  - Vocabulary/forms: chuỗi rỗng hoặc chỉ khoảng trắng, Unicode tiếng Việt/Anh, trường bắt buộc và giới hạn độ dài đã quy định.
  - XLSX: header thiếu/sai, hàng trống, kiểu ô bất ngờ, trùng dữ liệu, file lỗi và tính nguyên vẹn khi import thất bại. Dựa trên chính sách import hiện có, không tự đặt quy tắc mới trong test.
  - Flashcards/quiz: bộ từ rỗng/nhỏ, đáp án không trùng, điểm số, kết thúc phiên. Kiểm soát randomness và thời gian để test tái lập được.
  - Guest/sync: lưu và đọc lại, lỗi lưu, offline, retry không tạo bản ghi trùng và tách dữ liệu giữa tài khoản nếu các luồng này có thật.
- Với sửa lỗi, ưu tiên regression test thất bại vì lỗi đã tái hiện trước khi sửa, rồi chạy lại sau sửa.

## Viết và chạy

- Theo vị trí và naming của test sẵn có; nếu chưa có quy ước, đặt `*.test.ts(x)` gần tính năng và Python test theo quy ước `test_*.py` của backend.
- Dùng fixture nhỏ, dữ liệu giả, setup/teardown cô lập; không dùng tài khoản thật hoặc dữ liệu production. Mock ranh giới mạng, thời gian và dịch vụ ngoài khi cần; không mock chính logic đang kiểm tra.
- Test component qua thao tác và nội dung/role accessible nếu thư viện DOM test đã có. Test adapter IndexedDB bằng môi trường IndexedDB test đã có; mock đơn giản không chứng minh được transaction hoặc migration thật.
- Chạy test liên quan trước: Vitest ở chế độ một lần bằng script test hiện có với `--run` nếu script chưa có, hoặc `vitest run` qua package manager; với Python dùng `python -m pytest <đường-dẫn-test>` trong môi trường dự án.
- Chạy lint, typecheck và build có thật khi thay đổi frontend. Không gọi build/typecheck là unit test, không báo pass khi runner không tìm thấy test.

## Bàn giao

Liệt kê test/file thay đổi, lệnh đã chạy, số pass/fail nếu có, và kiểm tra bị chặn hoặc chưa chạy. Không thêm dependency, tăng coverage hình thức hoặc mở rộng sang tính năng mới ngoài yêu cầu.
