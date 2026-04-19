# K12 Video Runner

Chrome extension này hiển thị nút `Chạy tiến trình` trên trang video của `https://hcm.k12online.vn/*`.

## Cách dùng

1. Mở `chrome://extensions`.
2. Bật `Developer mode`.
3. Chọn `Load unpacked`.
4. Trỏ tới thư mục `d:\code\k12-ext\chrome-extension`.
5. Mở trang bài học video trên `hcm.k12online.vn` khi đã đăng nhập.
6. Bấm nút `Chạy tiến trình`.

## Extension làm gì

- Chỉ chạy trên trang có URL dạng `https://hcm.k12online.vn/<portal>/page/LMS/Lesson/Courseware/learn/<lessonId>`.
- Tự đọc các giá trị `courseResultId`, `courseSiteId`, `site`, `securityToken` và `options[...]` từ HTML/script hiện tại của trang.
- Gửi `POST` tới API `https://hcm.k12online.vn/api/LMS/Learning/CourseResult/Video/complete` bằng đúng phiên đăng nhập hiện tại.
- Nếu phản hồi là `{"status":"SUCCESS","percent":100}` thì báo hoàn tất.
- Nếu phản hồi khác hoặc request lỗi, trạng thái lỗi sẽ hiển thị ngay cạnh nút.

## Ghi chú

- Extension không hardcode cookie hay token đăng nhập.
- Nếu hệ thống đổi cấu trúc script nhúng trên trang, cần cập nhật regex trong `content.js`.