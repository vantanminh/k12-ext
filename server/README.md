# K12 AI server — Rust

Server nhận đề đã chuẩn hóa, gọi OpenAI Responses API với Structured Outputs, rồi kiểm tra đủ câu và mã đáp án. Server không nhận cookie/securityToken K12 và không trực tiếp nộp bài.

## Chạy trên Windows

Tự tạo `.env` từ `.env.example`:

- `OPENAI_API_KEY`: key của bạn.
- `OPENAI_MODEL`: model hỗ trợ ảnh, Structured Outputs và PDF nếu dùng đề PDF; mặc định gpt-4.1-mini.
- `K12_SERVER_TOKEN`: token kết nối, nhập cùng giá trị trong tab AI của tiện ích.
- `K12_SERVER_PORT`: mặc định 3210.

Trong thư mục server:

```powershell
.\start.ps1
```

Bản mã nguồn: script luôn chạy Cargo build incremental để dùng đúng mã mới. Trước khi build, chỉ dừng tiến trình k12-ai-server.exe có đúng đường dẫn của bản này. Bản Windows đóng gói: script chạy executable bên cạnh, không cần Cargo. Script dùng ASCII để tương thích Windows PowerShell 5.1.

Mặc định lắng nghe tại http://127.0.0.1:3210. `GET /health` không trả secret, có protocol_version=2 và cờ ready. Không có key vẫn khởi động được; solve trả lỗi cấu hình rõ ràng.

## Deploy Railway

Đặt Root Directory của dịch vụ là gốc repository, nơi có `Dockerfile` và `railway.json`. Cấu hình có sẵn builder Dockerfile, healthcheck /health và restart khi lỗi.

Thiết lập ba biến OPENAI_API_KEY, OPENAI_MODEL, K12_SERVER_TOKEN trong Railway. Khi có PORT do nền tảng cấp, server tự bind 0.0.0.0:PORT. Generate Domain, rồi nhập URL HTTPS và token trong tiện ích. Tiện ích yêu cầu quyền kết nối đúng host HTTPS đã chọn.

Docker build có hai stage, runtime Debian có CA certificates và chạy bằng user không phải root. .dockerignore chỉ cho phép Cargo manifest/lock và mã nguồn Rust; không đưa .env, HAR, dữ liệu debug hay binary Windows vào image. Docker image chưa được chạy thử trên máy này do Docker daemon chưa hoạt động. Chưa deploy lên Railway.

Tài liệu Railway: https://docs.railway.com/config-as-code/reference và https://docs.railway.com/deployments/healthchecks

## API

`POST /v1/solve`, header `x-k12-token`, JSON:

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
