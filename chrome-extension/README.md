# K12 Video Runner 1.9.0

Tiện ích Chrome quản lý bài học K12 từ trang **Bài giảng học tự do**. Backend Rust nhận đề, gọi OpenAI và trả đáp án. Cookie và token đăng nhập K12 được giữ trong trình duyệt.

## Cài và cập nhật

1. Giải nén `chrome-extension-k12.zip`, hoặc dùng thư mục `G:\k12-ext\chrome-extension`.
2. Trong `chrome://extensions`, bật Developer mode và chọn Load unpacked.
3. Khi cập nhật, bấm Reload trên tiện ích, rồi tải lại trang K12.
4. Chạy `server\start.ps1`. Script build mã nguồn mới bằng Cargo và khởi động lại đúng executable.
5. Tab **AI bài tập**: nhập email, bấm **Gửi mã đăng nhập**, rồi nhập mã 6 số nhận qua email. Không cần mật khẩu. Địa chỉ server và token quản trị (không bắt buộc) nằm trong **Cấu hình server**. OpenAI API key chỉ nằm trên server.

Chrome cần thư mục đã giải nén, không nạp trực tiếp ZIP. Workflow GitHub Release trong `.github/workflows/release-extension.yml` đóng gói thư mục này khi phát hành tag.

## Từ trang chủ đến từng nội dung

- Mở trang Bài giảng học tự do đã đăng nhập, bấm biểu tượng K12.
- **Tìm bài trong toàn bộ danh sách** quét mọi trang và đối chiếu tổng số bài K12 công bố. Đã thử trực tiếp: 48 bài trên 3 trang, có tên môn và tiến độ.
- Lọc môn, tìm tên, chọn bài. Mục **Quản lý** cấu hình riêng cho từng môn.
- **Chạy quy trình theo môn cho bài đã chọn** mở tab nền của từng bài, nhận diện các tài liệu/video/bài tập bên trong rồi thực hiện quy tắc đã chọn. Các tab do tiện ích tạo sẽ được đóng sau khi xử lý.
- **Xem trước quy trình** chỉ đọc cấu trúc bài và hiện rõ mỗi tài liệu, video, bài tập cùng thao tác dự kiến. Nút này không đánh dấu tiến độ, nộp đáp án hoặc gửi bình luận lên K12.
- Tiến độ 100% chỉ được hiển thị khi K12 xác nhận đúng nội dung. Lỗi từng bài được giữ trên thẻ để xem lại.

## Quy tắc theo môn

Bài tập có bốn cách xử lý: bỏ qua; nộp đáp án; bình luận đáp án; nộp và bình luận. Tài liệu/video có tùy chọn đánh dấu đã đọc/xem và tùy chọn bình luận riêng.

Bình luận cần đủ **Tên, Lớp, Mã số**, theo thứ tự `Tên - Lớp - Mã số - đáp án`. Đề PDF dùng A/B/C/D; đề Đúng/Sai nhóm theo câu và ý a/b/c/d. Tài liệu/video dùng nội dung `đã xem ạ`. Hồ sơ và quy tắc được lưu cục bộ trong Chrome.

Các nội dung đã đạt 100% được bỏ qua khi chỉ cần nộp/đánh dấu. Khi yêu cầu cả bình luận, tiện ích vẫn xử lý phần bình luận cần thiết. Lịch sử bình luận ngăn gửi trùng; nếu mất kết nối khi gửi, phải kiểm tra Thảo luận trước khi xử lý lại.

## AI bài tập

Reader hỗ trợ biểu mẫu PDF chọn một đáp án và biểu mẫu K12 Đúng/Sai: 10 câu × 4 ý thành 40 ý. Reader chờ nội dung tải đủ, giữ các cột bảng và gửi hình minh họa cùng đề. Tên lấy từ phần panel-title, không lấy CSS hoặc thanh công cụ.

Tab AI có công cụ đọc đề, xuất JSON đề đã chuẩn hóa, kiểm tra server và xem đáp án. **Nộp đáp án AI lên K12 sau khi giải** là tùy chọn riêng cho thao tác giải thử; mặc định tắt. Quy trình theo môn dùng quy tắc trong Quản lý.

Server kiểm tra đủ câu, ID đáp án và độ tin cậy. Adapter nộp chỉ gửi khi mỗi đáp án đạt ít nhất 70%, đề không đổi và form thuộc Courseware.Exercise. Đáp án AI chưa phải bằng chứng đã nộp hoặc hoàn thành.

Đề PDF gửi URL upload K12. Đề văn bản gửi nội dung, bảng và URL hình; Rust tải hình công khai, nhận dạng PNG/JPEG/GIF/WebP từ dữ liệu rồi gửi ảnh trực tiếp cho OpenAI. Courseware.Exam và các kiểu chưa xác minh được báo rõ và không tự đánh dấu hoàn thành.

## Chẩn đoán

Bật **Ghi API K12** để ghi fetch/XHR LMS và các POST dựng lại nội dung có service LMS. HTML chỉ ghi metadata, không lưu toàn bộ vào log tiện ích. Cookie, token và trường tài khoản được che. Bấm **Xuất dữ liệu API đã ghi** để tải JSON về máy; log không được gửi đến AI.

Nếu gặp thông báo server cũ, chạy lại `start.ps1` và tải lại tiện ích. Nếu đề chưa tải đủ, tải lại trang bài. Khi phiên K12 hết hạn, đăng nhập lại bằng trình duyệt.

Một số bài yêu cầu xem tài liệu trước rồi mới cho mở bài tập. Khi K12 báo hoàn thành nội dung theo thứ tự, bật đánh dấu đã xem và dùng quy trình theo môn từ trang danh sách. Trang kết quả có nút Làm lại được báo riêng; tiện ích không tự mở lượt làm lại để đọc đề.

Chi tiết API và bằng chứng thử thật: [docs/exercise-workflow.md](../docs/exercise-workflow.md). Cấu hình localhost/Railway: [server/README.md](../server/README.md).
