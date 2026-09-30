# Workflow K12 — kiểm tra ngày 30/09/2026

## Bằng chứng thử trên Chrome Beta

- Trang **Bài giảng học tự do** công bố 48 bài, 20 bài mỗi trang. Tiện ích đã quét đủ 3 trang và hiển thị đúng tên bài, môn học, tiến độ; 16 bài đã đạt 100% trước khi thử. Không coi đáp án AI là bài đã hoàn thành.
- Hóa 12.4: lesson `6ab7e04a1d5332cbc90330b7`, exercise `6ab7e04a1d5332cbc90330ba`. Đề PDF có 20 câu, đáp án form 1/2/3/4 tương ứng A/B/C/D. Bài này đã đạt 100% và có điểm trước khi thử nên không nộp lại chỉ để kiểm tra.
- Lượt mở Hóa 12.4 từ trang chủ đã tìm được nội dung PDF và bài tập BT 12.4 bên cạnh. Trang bài tập hiện là kết quả 10/10, 20/20, có nút Làm lại; tiện ích không tự tạo lượt làm lại để đọc đề.
- Hóa 12.6 từ trang chủ cũng tìm được BT 12.6, nhưng K12 chặn bằng “Bạn cần hoàn thành các nội dung theo thứ tự” khi tài liệu trước đó còn 0%. Reader báo điều kiện này rõ ràng; workflow theo môn cần bật view để xử lý tài liệu trước bài tập. Chưa đánh dấu tài liệu này trong lần thử.
- Hóa 12.7: lesson `6ab7e0713409d4fad702dc89`, exercise `6ab7e0713409d4fad702dc8b`. Form văn bản tải nội dung muộn: 10 câu × 4 ý Đúng/Sai, kèm 6 hình và bảng. Reader xuất đủ 40 ý, 6 URL hình; JSON khoảng 32 KiB.
- OpenAI thật đã trả đủ đáp án cho PDF 20 câu và văn bản 40 ý. Lượt **trong tiện ích** với Hóa 12.7 hiển thị đủ 40 đáp án, độ tin cậy thấp nhất 88%, trạng thái “Đã nhận đáp án AI. Chưa nộp bài.”
- Đã thử chọn Hóa 12.7 ngay trên trang Bài giảng học tự do: tiện ích mở tab nền, tìm bài tập bên trong, đọc đủ đề, khớp cache đáp án và đóng tab đã tạo. Thẻ bài báo “1 bài tập đã có đáp án; chưa nộp”, tổng “Xử lý xong 1/1 bài học. Chưa nộp đáp án lên K12.”
- **Chưa xác minh thực tế bước nộp Hóa 12.7 và bình luận.** Test mô phỏng không thay cho bằng chứng K12 đã nhận bài. Hồ sơ Tên/Lớp/Mã số chưa được cung cấp; đang chờ xác nhận thao tác nộp thử.

HAR, HTML, JSON đề/đáp án thật và bảng duyệt đáp án nằm trong `api-captures/`, được Git bỏ qua. Fixture test bỏ thông tin người dùng và dùng token giả.

## Lỗi đã sửa

1. Link bài giảng thường mở PDF giới thiệu trước. Worker phải đọc các nội dung cùng lessonId trong cây bên trái để tìm bài tập bên cạnh, không trả về riêng PDF đầu tiên. Chỉ bỏ bước mở rộng khi đã chọn rõ `Courseware.Exercise`.
2. Tiêu đề lấy bằng `.panel-heading.textContent` chứa cả CSS và công cụ Thảo luận, làm tên bài quá dài. Reader giờ dùng `.panel-heading .panel-title`, loại script/style và cắt 240 Unicode code point, bảo đảm dưới giới hạn 1000 byte UTF-8 của Rust.
3. DOM danh sách vừa tải chưa gắn `data-column-index` hoặc nút phân trang. Reader dùng vị trí ô HTML gốc, ưu tiên dòng bài giảng; worker chờ tiến độ và phân trang sẵn sàng, lấy các mẫu ổn định trước khi xử lý. Kết quả đã kiểm chứng: 48 bài trên 3 trang.
4. Form Đúng/Sai ban đầu chỉ có placeholder. Reader chờ đủ câu/ý, giữ cột và hàng trong bảng, gắn ID nhóm cho hình minh họa.
5. OpenAI trả HTTP 400 `invalid_value`, param `url`, “Error while downloading file.” khi tự tải hình K12. Rust giờ tải hình công khai rồi gửi base64. Một file đuôi PNG và Content-Type PNG thực tế là JPEG; server nhận dạng định dạng từ byte ảnh, không dựa vào tên file.
6. `start.ps1` trước đây chứa tiếng Việt UTF-8 không BOM, khiến Windows PowerShell 5.1 đọc sai dấu và lỗi parse. Script dùng ASCII, build incremental bản nguồn trước khi chạy; tránh chạy lại executable cũ.

## API và dữ liệu

### Danh sách và mở nội dung

Trang danh sách và cây courseware được đọc trong phiên K12 của trình duyệt. Phân trang K12 dựng lại module qua POST của hệ thống VHV. Khi mở bài tập, luồng đã quan sát gửi:

HAR phân trang thật: `POST /79000729/`, service `LMS.Learning.Lesson.Student.selectAllFreeLearn`, `pageNo=2`, `itemsPerPage=20`; phản hồi 200 HTML chứa môn và tiến độ. Tiện ích đọc DOM đã dựng xong từ phản hồi này để giữ đúng ngữ cảnh trang.

1. `POST /api/LMS/Learning/Courseware/learn`: ID nội dung, ngữ cảnh lesson/site/course và token K12. Phản hồi `SUCCESS`, `addNew=1`, ID lượt làm.
2. `POST /79000729/` với service `LMS.Learning.Courseware.select`: dựng lại `Content.Form`; body có `coursewareId`, `lessonId`, `coursewareType`, `isPDF`, `totalQuestion` và options ngữ cảnh. Đây là lý do recorder cần nhận cả portal POST có service LMS, ngoài `/api/LMS/`.
3. Reader lấy form PDF hoặc form Đúng/Sai hiện tại. Cookie, token và trường định danh người dùng không được đưa vào đề gửi Rust.

### AI

Tiện ích chuẩn hóa title/questions/pdf_url hoặc images, gọi server Rust bằng token kết nối riêng. Rust gửi OpenAI Responses API với Structured Outputs, `store: false`, rồi kiểm tra đủ ID, lựa chọn và confidence. PDF dùng `input_file.file_url`; hình dùng `input_image.image_url` dạng base64 với MIME được kiểm tra.

URL file chỉ cho phép upload công khai của `static.k12online.vn`, không query/token. Tối đa 50 ý, body 2 MiB; ảnh 4 MiB mỗi ảnh, tổng 16 MiB, tối đa 30 ảnh. HTTP tải ảnh không cookie/key, không theo redirect. Kết quả AI được cache cục bộ theo đề đã chuẩn hóa.

### Nộp và bình luận

Adapter nộp xác minh đúng đề, đủ đáp án, mỗi confidence ít nhất 70%, đúng loại `Courseware.Exercise`. Nó giữ các hidden field của form K12 và gửi tới `LMS.Learning.CourseResult.Exercise.edit` bằng phiên trình duyệt. Sau đó đọc lại trang để xác minh đúng courseware đạt 100%. Phản hồi nhận bài nhưng chưa có bằng chứng 100% được báo riêng, không tự nộp lại.

Quy tắc môn: bỏ qua, nộp, bình luận đáp án, hoặc nộp và bình luận. Comment-only không nộp đáp án vào form. Hồ sơ đủ Tên/Lớp/Mã số được kiểm tra trước khi chạy môn có bình luận. Bình luận theo thứ tự hồ sơ rồi đáp án; đề Đúng/Sai nhóm theo câu và ý a–d.

Comment dùng API `Social/Comment/edit`. Lịch sử cục bộ ghi pending trước khi gửi, sent sau thành công để tránh bình luận trùng khi mất kết nối. Tài liệu PDF dùng `Courseware/markComplete` rồi đọc lại tiến độ; video dùng API hoàn tất video và kiểm tra phần trăm trong phản hồi. `Courseware.Exam` và nội dung chưa hỗ trợ không đi qua markComplete.

### Log chẩn đoán

Recorder chỉ hoạt động khi bật, ghi fetch/XHR LMS và portal POST có service LMS. HTML chỉ ghi độ dài/số dòng/số nhóm câu, không giữ toàn bộ HTML. Log che token, cookie và trường tài khoản; tối đa 80 entries/1.5 MB, xuất JSON cục bộ. Không gửi log cho AI. HAR DevTools là dữ liệu debug riêng và có thể chứa thông tin nhạy cảm; không đưa vào Git hoặc gói phát hành.

## Kiểm thử và triển khai

- 52 test JavaScript và 15 test Rust đã qua. Regression bao gồm tên tiếng Việt/emoji, PDF giới thiệu có bài tập bên cạnh, danh sách chưa hydrate, phân trang thiếu, form PDF/Đúng-Sai tải muộn, bảng/hình, validation và ghi log có che dữ liệu. Nút Làm bài dùng bridge MAIN gọi phương thức K12 đã có, không eval hoặc điều hướng javascript:. Trang kết quả đã nộp và yêu cầu nội dung tuần tự được nhận diện trước khi mở lượt làm.
- Test workflow xác minh thứ tự solve → submit → kiểm tra 100% → comment, comment-only không submit, bài đã 100% được bỏ qua, và tab nền được đóng. Network K12 trong test được giả lập.
- Test Rust kiểm tra auth, schema, body quá lớn, ID đáp án, lỗi OpenAI, MIME JPEG bị ghi nhầm PNG, không gửi credentials khi tải ảnh, HTML/redirect/file quá lớn bị từ chối. Cargo fmt và clippy đã qua.
- Có Dockerfile, railway.json, bind PORT và healthcheck cho Railway. Chưa deploy; Docker daemon trên máy chưa hoạt động nên chưa thử image.

Tài liệu OpenAI: [Images and vision](https://developers.openai.com/api/docs/guides/images-vision), [File inputs](https://developers.openai.com/api/docs/guides/file-inputs). Cách cấu hình backend xem `server/README.md`.
