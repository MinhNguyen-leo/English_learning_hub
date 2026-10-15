---
name: systematic-debugging
description: Điều tra và sửa lỗi English Learning Hub bằng tái hiện, bằng chứng và xác định nguyên nhân gốc; dùng khi có hành vi sai, lỗi runtime, build, typecheck, test hoặc đồng bộ dữ liệu.
---

# Systematic debugging

## Xác định hệ thống đang có

Đọc `AGENTS.md`, file liên quan, `frontend/package.json`, lockfile và cấu hình trước khi chạy lệnh. Hiện frontend dùng React, TypeScript strict, Vite và Tailwind; Dexie, Supabase và FastAPI thuộc kế hoạch, không giả định đã tồn tại. Nếu backend đã được thêm, đọc manifest Python và cấu hình test của nó.

## Quy trình

1. Ghi hành vi mong đợi, hành vi thực tế và bước tái hiện tối thiểu; thu thập input, môi trường, lệnh lỗi và thông báo liên quan. Nếu thiếu thông tin, hỏi phần cần thiết và tiếp tục các kiểm tra độc lập.
2. Tái hiện trên trạng thái hiện tại trước khi sửa. Đọc stack trace, console/network hoặc test output phù hợp; che token, credentials và dữ liệu cá nhân khi ghi bằng chứng. Phân biệt lỗi môi trường/cấu hình với lỗi ứng dụng.
3. Theo luồng dữ liệu từ UI qua validation, state và tầng lưu trữ đang có. Với guest/offline, kiểm tra IndexedDB, transaction, schema version và lỗi quota nếu liên quan; không xóa database hoặc dữ liệu người dùng để làm mất triệu chứng.
4. Đưa ra giả thuyết cụ thể có thể kiểm chứng. Kiểm tra từng giả thuyết bằng trường hợp nhỏ nhất, thay đổi một yếu tố một lần; giải thích bằng chứng nào xác nhận hoặc bác bỏ. Không nâng cấp hàng loạt dependencies hay bắt lỗi rồi bỏ qua để làm xanh kiểm tra.
5. Sửa tại nguyên nhân gốc với phạm vi nhỏ. Với logic nghiệp vụ, thêm regression test chứng minh lỗi trước sửa và kết quả đúng sau sửa khi có hạ tầng phù hợp. Nếu chưa tái hiện được, báo rõ giới hạn thay vì khẳng định đã sửa.
6. Chạy lại bước tái hiện ban đầu, test liên quan và các script lint/typecheck/build áp dụng được. Kiểm tra các luồng lân cận có nguy cơ bị ảnh hưởng, đặc biệt guest/offline nếu đã triển khai.

## Ranh giới và báo cáo

- Không log secret, tắt RLS, bỏ kiểm tra quyền, chạy thao tác database phá hủy hoặc `git reset --hard` để chữa lỗi. Việc xóa dữ liệu cần phê duyệt rõ ràng theo `AGENTS.md`.
- Không tự cài thêm thư viện hoặc chuyển sang giai đoạn triển khai khác ngoài phạm vi được giao.
- Báo nguyên nhân gốc, bằng chứng tái hiện, file sửa, lệnh và kết quả xác minh. Nêu riêng giả thuyết còn chưa xác nhận và lỗi môi trường đang chặn kiểm tra.
