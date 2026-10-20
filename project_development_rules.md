# Project Rules & Guidelines — English Learning Hub

Tài liệu này quy định các nguyên tắc cốt lõi về kiến trúc, tiêu chuẩn kỹ thuật, tính toàn vẹn dữ liệu, bảo mật và quy trình phát triển cho dự án **English Learning Hub**. Mọi đóng góp và phát triển tính năng mới (cho cả AI Agents và Developers) đều phải tuân thủ nghiêm ngặt các quy tắc dưới đây.

---

## 1. Quy trình làm việc & Quản lý phạm vi (Workflow & Scope)

- **Phát triển theo từng giai đoạn (Phased Implementation):** Chỉ làm việc trên một tính năng/phase tại một thời điểm. Dừng lại ngay sau khi hoàn thành phase được cấp phép, không tự ý viết trước code hoặc tạo sẵn file/thư mục rỗng (boilerplate/placeholders) cho các tính năng tương lai.
- **Trì hoãn phụ thuộc (Deferred Dependencies):** Chỉ cài đặt thư viện mới khi tính năng ở phase hiện tại thực sự cần. Không cài đặt sẵn router, state management library (như Redux/Zustand), UI framework hoặc backend packages nếu React local state/hooks và cấu trúc hiện tại đã đáp ứng đủ.
- **Không tích hợp AI/External API ngoài luồng:** Hệ thống bài tập, flashcard và quiz hoạt động hoàn toàn dựa trên quy tắc tất định (deterministic rule-based). Tuyệt đối không gọi LLM, AI API hay dịch vụ từ điển bên thứ ba.

---

## 2. Môi trường & Công cụ (Environment & Tooling)

- **Runtime & Package Manager:**
  - Node.js `24 LTS` (`>= 24.14`, ghim phiên bản chuẩn tại `.nvmrc` là `24.19.0`).
  - `pnpm 11.25.0` (chạy thông qua `corepack pnpm`).
  - Luôn sử dụng `--frozen-lockfile` khi cài đặt dependencies và commit file `frontend/pnpm-lock.yaml`.
- **Tech Stack cốt lõi:** React 19, Strict TypeScript 6, Vite 8, Tailwind CSS 4 (`@tailwindcss/vite`), Dexie (IndexedDB), SheetJS CE `0.20.3` (pinned tarball).
- **Thư mục làm việc:** Mọi câu lệnh frontend phải được thực thi từ thư mục `frontend/`.

---

## 3. Kiến trúc & Tổ chức Mã nguồn (Architecture & Code Structure)

### 3.1. Cấu trúc thư mục (`frontend/src/`)
- `app/`: Thành phần khởi tạo ứng dụng, điều hướng (navigation) và kết nối các repositories.
- `features/`: Chứa từng tính năng độc lập (`vocabulary`, `spreadsheet`, `flashcards`, `quiz`, `dashboard`, `backup`, và tương lai là `auth`, `sync`). Các helper chỉ phục vụ cho một tính năng phải đặt ngay trong thư mục của tính năng đó.
- `shared/`: Chỉ chứa các thành phần UI, domain types, storage hoặc cloud adapters khi đã được chứng minh là dùng chung ở nhiều features.

### 3.2. Phân tách trách nhiệm (Separation of Concerns)
- **Domain Logic độc lập:** Toàn bộ logic nghiệp vụ (kiểm tra hợp lệ, tính điểm, trộn thẻ, tạo câu hỏi quiz, tính toán thống kê dashboard) phải là các hàm thuần túy (pure functions), hoàn toàn độc lập với React và Database/I/O.
- **Repository Pattern:** Các thành phần giao diện (React UI Components) **tuyệt đối không** gọi trực tiếp API của Dexie hoặc IndexedDB. UI chỉ được giao tiếp thông qua các interface Repository (`VocabularyRepository`, `ReviewProgressRepository`, `QuizProgressRepository`, v.v.).
- **Quản lý trạng thái hiển thị (View Mounting):** Giữ các view học tập và quản lý từ vựng được mount khi chuyển tab (nếu cần thiết theo thiết kế của `App.tsx`) để bảo toàn các bản nháp (drafts) đang chỉnh sửa hoặc bộ đếm thời gian/trạng thái của phiên học.

---

## 4. Quy tắc Dữ liệu, Lưu trữ & Giao dịch (Data & Storage Rules)

### 4.1. Tính nguyên tử và Giao dịch (Transactions & Atomicity)
- **Commit trước, Thông báo sau:** Mọi thao tác thêm, sửa, xóa, import hoặc lưu tiến độ phải được thực hiện bên trong giao dịch (transaction) của Dexie/IndexedDB. Giao diện chỉ được thông báo thành công sau khi transaction đã commit hoàn tất.
- **Rollback an toàn:** Nếu xảy ra lỗi (vượt quá dung lượng bộ nhớ, lỗi dữ liệu, hủy bỏ giữa chừng), toàn bộ transaction phải được rollback, giữ nguyên trạng thái đã commit gần nhất và giữ lại bản nháp trên UI để người dùng thử lại.
- **Chống ghi đè dữ liệu cũ (Concurrency & Stale Writes):**
  - Sử dụng kiểm tra `updatedAt` timestamp, `revision` counter, hoặc `restoreGeneration` bên trong read/write transaction.
  - Từ chối các thao tác ghi/xóa nếu phát hiện dữ liệu đã bị thay đổi bởi một tab khác hoặc sau khi khôi phục bản sao lưu (Backup Restore). Yêu cầu người dùng tải lại dữ liệu mới nhất.

### 4.2. Chuẩn hóa & Kiểm tra dữ liệu (Validation & Normalization)
- **Chuẩn hóa văn bản:**
  - Mọi dữ liệu đầu vào phải được `trim()` và chuẩn hóa về dạng **Unicode NFC** (đối với lưu trữ từ vựng và kiểm tra trùng lặp).
  - Trong bộ tạo Quiz (Quiz Generator), sử dụng **Unicode NFKC**, chuyển chữ thường (lowercase), loại bỏ dấu câu/ký hiệu và gộp khoảng trắng thừa để so sánh độ tương đồng ngữ nghĩa.
- **Giới hạn độ dài trường (Field Limits):**
  - `word`: Bắt buộc, tối đa `200` ký tự.
  - `part_of_speech`: Tối đa `200` ký tự (tùy chọn).
  - `english_meaning` / `vietnamese_meaning`: Phải có ít nhất 1 trong 2 nghĩa, mỗi trường tối đa `2,000` ký tự.
  - `synonyms` / `antonyms`: Tối đa `2,000` ký tự mỗi trường.
  - `example_sentence` / `note`: Tối đa `5,000` ký tự mỗi trường.
  - Các trường tùy chọn bị bỏ trống phải được lưu dưới dạng chuỗi rỗng `""`.
- **Quy tắc trùng lặp (Duplicate Identity):** Một mục từ vựng được coi là trùng lặp dựa trên bộ 4 giá trị sau khi đã chuẩn hóa (Unicode NFC + trim + lowercase): `(word, part_of_speech, english_meaning, vietnamese_meaning)`.

---

## 5. Quy tắc Nghiệp vụ cho từng Tính năng (Feature-Specific Rules)

### 5.1. Quản lý Từ vựng (Vocabulary Manager)
- Bảo vệ bản nháp (Draft Protection): Cảnh báo xác nhận khi người dùng chuyển dòng, thêm dòng mới, hủy bỏ hoặc đóng trình duyệt (`beforeunload`) khi đang có thay đổi chưa lưu.
- Tìm kiếm và lọc không được làm biến mất dòng nháp đang chỉnh sửa.
- Vô hiệu hóa bảng chỉnh sửa trực tiếp khi đang mở công cụ Excel Import/Export.

### 5.2. Nhập/Xuất Excel (XLSX Import & Export)
- **An toàn tập tin:** Chỉ chấp nhận file `.xlsx`. Từ chối các file chứa macro (`.xlsm` hoặc có chứa VBA entries) và các ô chứa công thức (formulas) — kể cả trong các cột bị bỏ qua (ignored columns). Không bao giờ sử dụng kết quả cache của công thức.
- **Giới hạn cứng:** Kích thước file tối đa `5 MiB`, tối đa `5,000` dòng dữ liệu vật lý, `64` cột, `512` archive entries, và kích thước giải nén tối đa `32 MiB`. Chạy trình phân tích cú pháp (parser) trong một Web Worker riêng biệt với thời gian chờ (timeout) tối đa `15 giây`.
- **Kiểu dữ liệu:** Chỉ chấp nhận chuỗi văn bản. Các kiểu số, ngày tháng, boolean hoặc lỗi bảng tính đều bị coi là không hợp lệ.
- **Xuất file (Export):** Luôn xuất ra các ô kiểu chuỗi tường minh (explicit string cells), giữ nguyên các ký tự đầu dòng như `=`, `+`, `-`, `@` dưới dạng văn bản thuần để chống tấn công CSV/Formula Injection.

### 5.3. Flashcards & Quiz
- **Snapshot độc lập:** Khi bắt đầu một phiên Flashcard hoặc Quiz, hệ thống phải chụp lại (snapshot) dữ liệu của các từ được chọn. Việc chỉnh sửa hoặc xóa từ vựng ở thư viện chính sau đó không được làm hỏng hoặc thay đổi phiên học đang diễn ra.
- **Quiz Distractors (Phương án nhiễu):** Phải được kiểm tra chéo nghiêm ngặt qua nhóm từ đồng nghĩa (synonyms), nghĩa tiếng Việt tương đương và độ trùng lặp token để đảm bảo một câu hỏi luôn có đúng 1 đáp án đúng duy nhất và 3 phương án nhiễu hoàn toàn tách biệt.
- **Tính điểm & Tự động chuyển câu (Quiz):** Điểm số và danh sách từ sai phải được suy ra (derived) từ danh sách câu trả lời đã nộp. Tự động chuyển câu sau `1.5s` (nếu đúng) và `2.5s` (nếu sai) sau khi lưu thành công; tạm dừng bộ đếm nếu người dùng chuyển khỏi tab Quiz.

### 5.4. Sao lưu & Khôi phục (Backup & Restore)
- Chỉ chấp nhận file JSON hợp lệ với `application: "english-learning-hub"` và `formatVersion: 1`.
- Giới hạn kích thước file JSON tối đa `32 MiB` và tối đa `100,000` bản ghi cho mỗi mảng dữ liệu (bao gồm cả các mảng con lồng nhau).
- Hỗ trợ 2 chế độ: **Merge** (giữ nguyên các bản ghi hiện có nếu trùng ID, chỉ thêm ID mới, đảm bảo tính lũy đẳng - idempotent) và **Replace** (xóa toàn bộ dữ liệu hiện tại và thay bằng bản sao lưu, bắt buộc phải có hộp thoại xác nhận riêng).

### 5.5. Bảng điều khiển (Learning Dashboard)
- Chỉ đọc dữ liệu hiện có thông qua một giao dịch `readonly` nhất quán (chỉ tải khóa chính của từ vựng và 2 bản ghi phiên học đang hoạt động, không tải toàn bộ văn bản từ vựng vào bộ nhớ để đếm).
- Tuyệt đối không tự bịa ra dữ liệu lịch sử hoặc số lượng từ cần ôn tập (SRS due dates) khi schema hiện tại chưa lưu trữ lịch sử theo thời gian.

---

## 6. Bảo mật & Quyền riêng tư (Security & Privacy)

- **Chống XSS:** Không bao giờ render dữ liệu từ vựng, nội dung file Excel hoặc JSON dưới dạng HTML thô (như `dangerouslySetInnerHTML`). Mọi nội dung người dùng nhập vào phải được xử lý như văn bản thuần túy (plain text).
- **Biến môi trường (`VITE_*`):** Mọi biến môi trường bắt đầu bằng `VITE_` đều sẽ bị đóng gói công khai vào trình duyệt. **Tuyệt đối không** đưa Supabase `service_role` key, mật khẩu cơ sở dữ liệu hoặc JWT secret vào mã nguồn frontend hoặc file `.env` của frontend.
- **Cách ly dữ liệu Guest và Account (Khi triển khai Auth/Sync):**
  - Dữ liệu của Guest không bao giờ được tự động tải lên đám mây khi đăng nhập; phải có sự xác nhận sao chép rõ ràng từ người dùng.
  - Khi đăng xuất, phải ẩn ngay lập tức dữ liệu của tài khoản, tạm dừng hàng đợi đồng bộ (outbox) và hủy các request đang chạy.
- **Supabase RLS & RPC (Khi triển khai Cloud):**
  - Bật Row Level Security (RLS) trên mọi bảng.
  - Không tin tưởng thời gian của client (client timestamps) hoặc các khóa chuẩn hóa (`normalized_term`) do client gửi lên; server phải tự tính toán và kiểm tra.

---

## 7. Kiểm thử & Đảm bảo chất lượng (Testing & Verification)

Trước khi hoàn thành bất kỳ thay đổi hoặc phase nào, bắt buộc phải chạy và vượt qua toàn bộ các lệnh kiểm tra sau từ thư mục `frontend/`:

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm format:check
```

### Quy tắc viết Test:
- **Cô lập hoàn toàn:** Sử dụng `fake-indexeddb` với tên cơ sở dữ liệu độc lập cho từng test case; không bao giờ chạm vào dữ liệu thực của trình duyệt hoặc dữ liệu production.
- **Kiểm soát tính ngẫu nhiên:** Sử dụng nguồn tạo số ngẫu nhiên có hạt giống cố định (fixed-seed injectable RNG) khi kiểm thử logic trộn thẻ Flashcard và tạo câu hỏi Quiz.
- **Bao phủ các trường hợp biên (Edge Cases):** Bắt buộc phải có test cho dữ liệu tiếng Việt (Unicode), file hỏng/sai định dạng, vượt quá giới hạn kích thước, rollback khi giao dịch lỗi, xung đột dữ liệu giữa nhiều tab (stale revision/timestamp), và trạng thái UI khi bộ nhớ bị lỗi.