---
name: frontend-development
description: Phát triển hoặc chỉnh sửa UI React và TypeScript trong English Learning Hub, với responsive layout, component tái sử dụng, accessibility và thiết kế nhất quán. Dùng khi làm giao diện hoặc tương tác frontend.
---

# Frontend development

## Bối cảnh dự án

- Frontend nằm trong `frontend/`, dùng React, TypeScript strict, Vite và Tailwind CSS. Đọc `package.json`, lockfile nếu có, `vite.config.ts`, các tsconfig và stylesheet trước khi thay đổi; theo phiên bản thực tế, không áp dụng cấu hình Tailwind cũ theo trí nhớ.
- `src/App.tsx`, `src/App.css`, `src/index.css` hiện là giao diện scaffold, chưa phải thiết kế sản phẩm hoàn chỉnh. Giữ các quy ước đã được chấp nhận; khi chưa có thiết kế, chọn cách trình bày đơn giản phù hợp phạm vi yêu cầu.
- Dexie/IndexedDB, Supabase Auth và cloud sync là định hướng trong `AGENTS.md`; chỉ tích hợp khi được yêu cầu và kiểm tra xem chúng đã được triển khai chưa.

## Cách thực hiện

1. Đọc `AGENTS.md`, mã liên quan và tài liệu trong `docs/` nếu có. Xác định file ảnh hưởng, giải thích ngắn thay đổi; làm một tính năng tại một thời điểm.
2. Theo kiến trúc theo tính năng đang có. Khi bổ sung tính năng mới, đặt UI, hooks và logic riêng trong `src/features/<feature>/`; chỉ đưa component vào vùng dùng chung khi có nhu cầu tái sử dụng rõ ràng. Không tái cấu trúc toàn dự án cho một thay đổi nhỏ.
3. Dùng props có kiểu rõ ràng, tránh `any`; giữ logic nghiệp vụ có thể kiểm thử tách khỏi hiển thị. Tái sử dụng component và token màu, khoảng cách, typography hiện có; không tự thêm thư viện UI hoặc state management.
4. Dùng HTML ngữ nghĩa, label cho input, thông báo lỗi liên kết với field, focus dễ thấy và thao tác bàn phím. Ưu tiên table ngữ nghĩa cho bảng từ vựng; chỉ dùng ARIA grid khi đã triển khai đầy đủ hành vi bàn phím tương ứng.
5. Kiểm tra màn hình hẹp và rộng; bảng có thể cuộn ngang trong vùng riêng, không làm tràn toàn trang. Không dùng màu làm tín hiệu duy nhất. Xử lý loading, empty, error và trạng thái lưu khi tính năng có các trạng thái này.
6. Validate form/import tại ranh giới dữ liệu. Giữ luồng guest hoạt động offline khi khả thi; không buộc đăng nhập cho thao tác guest. Không đưa secret vào mã frontend, không tự tạo hệ thống auth hay thêm AI API.

## Kiểm tra và bàn giao

- Chạy các script build, lint, typecheck có thật trong `frontend/package.json` bằng package manager của dự án. Không coi script tồn tại là bằng chứng cấu hình đã hoàn chỉnh.
- Kiểm tra trực quan responsive và bàn phím nếu có công cụ phù hợp; báo rõ nếu chưa kiểm tra trình duyệt.
- Viết/chạy test hành vi cho logic nghiệp vụ thay đổi bằng hạ tầng test đang có. Báo file sửa, kết quả và hạn chế; dừng sau phạm vi được giao.
