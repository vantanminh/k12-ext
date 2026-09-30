# K12 AI server — Rust

Server nhận đề đã chuẩn hóa, gọi OpenAI Responses API với Structured Outputs, rồi kiểm tra đủ câu và mã đáp án. Server không nhận cookie/securityToken K12 và không trực tiếp nộp bài.

## Chạy trên Windows

Tự tạo `.env` từ `.env.example`:

- `OPENAI_API_KEY`: key của bạn.
- `OPENAI_MODEL`: model hỗ trợ ảnh, Structured Outputs và PDF nếu dùng đề PDF; mặc định gpt-4.1-mini.
- `K12_SERVER_TOKEN`: token quản trị (không bắt buộc), nhập trong **Cấu hình server** của tiện ích; không bị giới hạn lượt.
- `K12_SERVER_PORT`: mặc định 3210.
- `K12_DEV_LOG_OTP=1`: chỉ dùng trên máy; in mã đăng nhập ra console thay vì gửi email.

Các biến đăng nhập email và quota xem mục **Đăng nhập email**.

Trong thư mục server:

```powershell
.\start.ps1
```

Bản mã nguồn: script luôn chạy Cargo build incremental để dùng đúng mã mới. Trước khi build, chỉ dừng tiến trình k12-ai-server.exe có đúng đường dẫn của bản này. Bản Windows đóng gói: script chạy executable bên cạnh, không cần Cargo. Script dùng ASCII để tương thích Windows PowerShell 5.1.

Mặc định lắng nghe tại http://127.0.0.1:3210. `GET /health` không trả secret, có protocol_version=2 và cờ ready. Không có key vẫn khởi động được; solve trả lỗi cấu hình rõ ràng.

## Deploy Railway

Đặt Root Directory của dịch vụ là gốc repository, nơi có `Dockerfile` và `railway.json`. Cấu hình có sẵn builder Dockerfile, healthcheck /health và restart khi lỗi.

1. Thêm Postgres vào project Railway, rồi đặt `DATABASE_URL=${{Postgres.DATABASE_URL}}` cho dịch vụ server. Bảng được tạo tự động khi server khởi động.
2. Tạo tài khoản Resend, xác minh domain gửi mail, tạo API key.
3. Đặt biến: `OPENAI_API_KEY`, `OPENAI_MODEL`, `RESEND_API_KEY`, `K12_EMAIL_FROM`, `K12_DAILY_SOLVE_LIMIT`; tùy chọn `K12_SERVER_TOKEN` cho quản trị.
4. Generate Domain, rồi nhập URL HTTPS trong **Cấu hình server** của tiện ích. Tiện ích yêu cầu quyền kết nối đúng host HTTPS đã chọn.

Khi có PORT do nền tảng cấp, server tự bind 0.0.0.0:PORT và lấy IP người dùng từ hop cuối của `X-Forwarded-For` do proxy Railway thêm vào. Giới hạn theo IP nằm trong bộ nhớ, đúng cho một instance.

Docker build có hai stage, runtime Debian có CA certificates và chạy bằng user không phải root. .dockerignore chỉ cho phép Cargo manifest/lock và mã nguồn Rust; không đưa .env, HAR, dữ liệu debug hay binary Windows vào image. Docker image chưa được chạy thử trên máy này do Docker daemon chưa hoạt động. Chưa deploy lên Railway.

Tài liệu Railway: https://docs.railway.com/config-as-code/reference và https://docs.railway.com/deployments/healthchecks

## Đăng nhập email

Người dùng nhập email, nhận mã 6 số, không có mật khẩu. Tài khoản được tạo khi xác minh mã lần đầu.

| Endpoint | Body / header | Kết quả |
| --- | --- | --- |
| `POST /v1/auth/otp` | `{"email"}` | Gửi mã. `resend_after` = 60 giây |
| `POST /v1/auth/verify` | `{"email","code"}` | `token` phiên (`k12s_…`), hạn 30 ngày |
| `GET /v1/auth/me` | `Authorization: Bearer <token>` | Email, `daily_limit`, `used_today`, `remaining_today` |
| `POST /v1/auth/logout` | `Authorization: Bearer <token>` | Xóa phiên |

Giới hạn chống lạm dụng:

- Mã hết hạn sau 10 phút, dùng một lần, tối đa 5 lần nhập sai.
- Mỗi email: gửi lại sau 60 giây, tối đa 5 mã mỗi giờ. Mỗi IP: 10 lần gửi mã và 30 lần xác minh mỗi giờ.
- Mỗi user: `K12_DAILY_SOLVE_LIMIT` lượt giải thành công mỗi ngày, reset lúc 0 giờ giờ Việt Nam. Lượt lỗi (OpenAI lỗi, server bận) được hoàn lại.

Server chỉ lưu SHA-256 của mã và của token phiên, không lưu giá trị gốc. Bảng Postgres: `users`, `otp_challenges`, `sessions`, `solve_usage`. Khóa một tài khoản bằng `UPDATE users SET disabled = true WHERE email = '...'`; mọi phiên của tài khoản đó bị từ chối ngay. Dữ liệu hết hạn được dọn mỗi giờ.

Test Postgres: `TEST_DATABASE_URL=postgres://... cargo test postgres_store`; không có biến này thì test được bỏ qua.

## API

`POST /v1/solve`, header `Authorization: Bearer <token phiên>` hoặc `x-k12-token` (quản trị), JSON:

```json
{
  "title": "Bài tập Toán",
  "questions": [{
    "id": "question-id-from-k12",
    "kind": "single_choice",
    "prompt": "1 + 1 = ?",
    "choices": [{"id": "a", "text": "1"}, {"id": "b", "text": "2"}]
  }]
}
```

Kiểu câu: single_choice, multiple_choice, short_text. Kết quả mỗi câu có question_id, choice_ids, text, explanation và confidence. Body tối đa 2 MiB; 1–50 câu; tên bài tối đa 1000 byte UTF-8; hai yêu cầu đang xử lý đồng thời.

PDF gửi thêm pdf_url trên https://static.k12online.vn/upload/...pdf. Văn bản có hình gửi images=[{id, url}], trong đó id là ID gốc của nhóm câu Đúng/Sai. Chỉ chấp nhận upload K12 công khai, không có query/token. Không trộn PDF và images.

Rust tải hình không kèm cookie/key, không theo redirect, kiểm tra dữ liệu ảnh thay vì tin đuôi file. Giới hạn 4 MiB mỗi ảnh, tổng 16 MiB, tối đa 30 ảnh. Ảnh gửi bằng data URL base64 nên OpenAI không cần tự tải ảnh từ K12. PDF hiện gửi bằng input_file.file_url. HTTP client có timeout; lỗi JSON, xác thực, quota, tốc độ, tải hình và phản hồi AI được phân biệt.

## Kiểm thử

```powershell
cargo test
cargo clippy --all-targets -- -D warnings
```

Test Rust dùng OpenAI/HTTP giả lập để kiểm tra schema, IDs, auth, CORS, request lớn và ảnh giả PNG/thật JPEG. Đã gọi API OpenAI thật với đề K12 PDF 20 câu và đề Đúng/Sai 40 ý kèm 6 hình; kiểm tra riêng với bằng chứng nộp K12 ở docs/exercise-workflow.md.

Tài liệu ảnh OpenAI: https://developers.openai.com/api/docs/guides/images-vision
