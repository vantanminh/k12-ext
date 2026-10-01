# Chrome Web Store Privacy Form — 1.9.0

Nội dung tham khảo cho biểu mẫu hiện hành khi phát hành. Chưa gửi duyệt Store.

## Mục đích duy nhất

K12 Video Runner giúp quản lý bài học trên hcm.k12online.vn: quét toàn bộ danh sách, hiển thị môn và tiến độ, cấu hình cách xử lý từng môn, lấy đáp án AI, nộp bài tập, đánh dấu tài liệu/video đã xem và gửi bình luận đáp án khi người dùng yêu cầu.

## Quyền

- `https://hcm.k12online.vn/*`: đọc danh sách/nội dung/form và gửi các thao tác K12 bằng phiên đăng nhập hiện tại.
- `https://k12-ai-server-production.up.railway.app/*`: backend AI mặc định của tiện ích (đăng nhập email, giải bài).
- Localhost HTTP: kết nối backend Rust do người dùng tự chạy.
- `optional_host_permissions: https://*/*`: yêu cầu quyền cho đúng origin HTTPS người dùng nhập làm backend, ví dụ dịch vụ Railway của họ. Không yêu cầu quyền toàn bộ HTTPS khi cài.
- `sidePanel`: mở giao diện quản lý.
- `storage`: lưu hồ sơ tùy chọn, quy tắc môn, cấu hình backend, cache tối đa 10 đề/đáp án, lịch sử chống bình luận trùng và log chẩn đoán tùy chọn.

Không cần quyền cookies hoặc activeTab.

## Mã từ xa

Chọn “Không, tôi hiện không sử dụng Mã từ xa”. Toàn bộ JavaScript/CSS thực thi nằm trong gói tiện ích. Nội dung JSON trả từ AI chỉ được kiểm tra và hiển thị, không thực thi như mã.

## Dữ liệu cần khai báo

Đối chiếu tên loại dữ liệu trên biểu mẫu Store thực tế:

- Thông tin nhận dạng cá nhân: email đăng nhập, gửi tới server AI để nhận mã và tạo phiên; server lưu email và số lượt giải mỗi ngày. Tên/Lớp/Mã số tự nhập, lưu cục bộ và gửi tới K12 khi bật bình luận. Không đưa hồ sơ này vào payload AI.
- Nội dung website: câu hỏi, lựa chọn, bảng, URL PDF/hình công khai được gửi tới backend đã cấu hình và OpenAI khi giải bài. Rust tải byte ảnh rồi gửi cho OpenAI; OpenAI tải PDF được cung cấp. Không gửi cookie/token K12 cho AI.
- Thông tin xác thực: token phiên đăng nhập email lưu cục bộ và gửi tới server AI; server chỉ lưu SHA-256 của token. Không phải token K12.
- Hoạt động/truyền dữ liệu mạng: log API tùy chọn ở lại máy, có che trường credentials và chỉ xuất khi người dùng yêu cầu. HTML chỉ giữ metadata.

Không khai báo rằng tiện ích chỉ gửi dữ liệu tới K12 hoặc chỉ hỗ trợ server localhost. Backend HTTPS do người dùng chọn cũng nhận nội dung đề. Server AI hosted do nhà phát triển vận hành nhận email và nội dung đề; không có analytics, quảng cáo hoặc tracking.

## Xác nhận sử dụng dữ liệu

Dữ liệu dùng cho chức năng quản lý bài K12 và AI người dùng yêu cầu, không bán, không dùng cho mục đích ngoài phạm vi hoặc quyết định tín dụng. Đối chiếu nội dung ba xác nhận bắt buộc của Store trước khi nộp biểu mẫu.

## URL chính sách

Sau khi file được công bố ở repository public, có thể dùng:

https://github.com/vantanminh/k12-ext/blob/main/chrome-extension/privacy-policy.md

Nếu repository private, cần URL chính sách public khác trước khi nộp Store.
