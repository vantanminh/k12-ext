# Chrome Web Store Listing — 1.6.0

## Tên và mô tả ngắn

K12 Video Runner

Quản lý bài học, đáp án AI và tiến độ K12 từ sidebar Chrome.

## Mô tả

K12 Video Runner mở sidebar ngay trên hcm.k12online.vn để quản lý bài học từ trang Bài giảng học tự do. Quét toàn bộ các trang, xem tên bài, môn học và tiến độ, lọc môn rồi chọn những bài cần xử lý.

Cấu hình riêng từng môn: bỏ qua bài tập, nộp đáp án, bình luận đáp án hoặc cả hai. Tài liệu và video có lựa chọn đánh dấu đã đọc/xem và bình luận riêng. Bình luận theo thứ tự Tên - Lớp - Mã số - đáp án; hồ sơ chỉ lưu trong Chrome và gửi tới K12 khi người dùng bật chức năng đó.

AI hỗ trợ form bài tập PDF chọn một đáp án và form văn bản Đúng/Sai có bảng, hình minh họa. Nội dung đề được gửi tới backend Rust do người dùng chạy trên localhost hoặc host HTTPS đã chọn, rồi tới OpenAI. OpenAI API key nằm trên server; cookie/token đăng nhập K12 được giữ trong trình duyệt.

Tab AI cho phép đọc đề, xuất JSON, xem đáp án và lời giải trước khi nộp. Quy trình theo môn mở từng nội dung trong tab nền, thực hiện quy tắc đã cấu hình và đóng các tab do tiện ích tạo. Tiện ích kiểm tra tiến độ K12 trước khi báo hoàn thành; đáp án AI chưa được nộp có trạng thái riêng.

Tùy chọn Ghi API K12 giúp chẩn đoán tại máy. Log che token, cookie và trường tài khoản, không gửi cho AI; HTML chỉ giữ metadata. Người dùng có thể xuất JSON đề/đáp án/log để kiểm tra.

Nút hoàn thành nhanh dành cho trang tài liệu/video có thể tắt trong Quản lý. Courseware.Exam và dạng bài chưa hỗ trợ được báo rõ. Tiện ích không có quảng cáo, analytics hoặc tracking của nhà phát triển.

## Thông tin cửa hàng

- Danh mục: Productivity / Năng suất.
- Ngôn ngữ: Vietnamese / Tiếng Việt.
- Nội dung người lớn: Không.
- Tài liệu quyền riêng tư: privacy-policy.md và chrome-store-privacy-form.md trong thư mục này.

Chưa gửi duyệt Store. Cần chuẩn bị icon và screenshot thật, đối chiếu kích thước và biểu mẫu Store hiện hành trước khi phát hành. URL hỗ trợ/chính sách phải public nếu sử dụng repository làm nguồn.
