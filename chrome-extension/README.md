# K12 Video Runner

Chrome extension này hiển thị nút `Chạy tiến trình` trên trang video của `https://hcm.k12online.vn/*`.

## Tải bản đóng gói sẵn từ GitHub Release

Repo đã có workflow tự động đóng gói extension thành file zip để người dùng tải về nhanh.

### Với người dùng cuối

1. Mở trang `Releases` của repo trên GitHub.
2. Tải file asset dạng `k12-video-runner-x.y.z.zip` trong phần `Assets`.
3. Giải nén file zip.
4. Vào `chrome://extensions`.
5. Bật `Developer mode`.
6. Bấm `Load unpacked`.
7. Chọn thư mục `k12-video-runner` vừa giải nén.

Lưu ý: Chrome không nạp trực tiếp file zip. Cần giải nén trước rồi mới `Load unpacked` thư mục bên trong.

### Với người phát hành

Workflow release nằm ở `.github/workflows/release-extension.yml` và hỗ trợ 2 cách:

1. Tạo tag dạng `v1.0.0` rồi push lên GitHub để workflow tự tạo release.
2. Vào tab `Actions` trên GitHub, chạy thủ công workflow `Release Chrome Extension` và nhập `tag_name`.

Mỗi lần chạy thành công, workflow sẽ:

- đóng gói toàn bộ thư mục `chrome-extension`
- tạo file zip có thư mục gốc là `k12-video-runner`
- upload file zip làm artifact
- tạo hoặc cập nhật GitHub Release cùng asset tải về

## Cài đặt trên Chrome bằng Developer mode

Extension này chưa được đưa lên Chrome Web Store, nên cần cài thủ công bằng chế độ dành cho nhà phát triển.

### 1. Chuẩn bị thư mục extension

Đảm bảo bạn đang có đầy đủ các file sau trong cùng một thư mục:

- `manifest.json`
- `content.js`
- `styles.css`
- `README.md`

Thư mục cần chọn khi cài là:

`d:\code\k12-ext\chrome-extension`

Lưu ý: Chrome yêu cầu chọn **thư mục gốc của extension**, không chọn từng file riêng lẻ.

### 2. Mở trang quản lý extension của Chrome

Có 2 cách:

1. Mở Chrome, nhập `chrome://extensions` vào thanh địa chỉ rồi Enter.
2. Hoặc bấm menu 3 chấm ở góc phải trên cùng -> `Extensions` -> `Manage Extensions`.

### 3. Bật Developer mode

Ở góc phải trên của trang `chrome://extensions`, bật công tắc `Developer mode`.

Khi bật xong, Chrome sẽ hiện thêm 3 nút:

- `Load unpacked`
- `Pack extension`
- `Update`

### 4. Nạp extension vào Chrome

1. Bấm `Load unpacked`.
2. Chọn thư mục:

	`d:\code\k12-ext\chrome-extension`

3. Bấm `Select Folder`.

Nếu không có lỗi, bạn sẽ thấy extension `K12 Video Runner` xuất hiện trong danh sách extension đang cài.

### 5. Kiểm tra extension đã được nạp thành công

Sau khi load xong, Chrome thường hiển thị một thẻ extension có:

- Tên extension: `K12 Video Runner`
- Version: `1.0.0`
- Trạng thái đang bật

Nếu Chrome báo lỗi ở file `manifest.json` hoặc `content.js`, cần sửa lỗi rồi quay lại trang `chrome://extensions` và bấm `Reload` trên extension đó.

### 6. Ghim icon extension ra thanh công cụ

Bước này không bắt buộc vì extension chạy trực tiếp trên trang, nhưng nên làm để dễ quản lý:

1. Bấm biểu tượng `Extensions` ở bên phải thanh địa chỉ Chrome.
2. Tìm `K12 Video Runner`.
3. Bấm biểu tượng ghim để pin nó ra thanh toolbar.

### 7. Sử dụng trên trang K12

1. Đăng nhập vào hệ thống `https://hcm.k12online.vn`.
2. Mở đúng trang bài học video, ví dụ dạng:

	`https://hcm.k12online.vn/79000729/page/LMS/Lesson/Courseware/learn/...`

3. Chờ trang tải xong.
4. Extension sẽ chèn nút `Chạy tiến trình` vào khu vực action của bài học.
5. Bấm nút `Chạy tiến trình`.

Nếu server trả về:

`{"status":"SUCCESS","percent":100}`

thì trạng thái sẽ báo hoàn tất ngay trên giao diện.

Nếu request lỗi, extension sẽ hiển thị nội dung lỗi tương ứng cạnh nút.

### 8. Khi sửa code extension và muốn cập nhật

Vì đây là bản cài bằng `Load unpacked`, mỗi lần bạn sửa code thì cần nạp lại bản mới:

1. Lưu các file đã sửa.
2. Mở lại `chrome://extensions`.
3. Tìm `K12 Video Runner`.
4. Bấm `Reload`.
5. Quay lại tab K12 và refresh trang.

### 9. Gỡ extension khỏi Chrome

1. Mở `chrome://extensions`.
2. Tìm `K12 Video Runner`.
3. Bấm `Remove`.

### 10. Lỗi thường gặp

`Không thấy nút Chạy tiến trình`:

- Bạn chưa mở đúng URL trang video.
- Trang chưa tải xong hoàn toàn.
- Bạn đã load nhầm thư mục, không phải `d:\code\k12-ext\chrome-extension`.
- Extension đang bị tắt trong `chrome://extensions`.

`Bấm nút nhưng báo thiếu dữ liệu`:

- Trang hiện tại không chứa đủ thông tin `courseResultId`, `securityToken` hoặc `courseSiteId`.
- Bạn đang ở sai loại nội dung, không phải video lesson page.

`Bấm nút nhưng server trả lỗi`:

- Phiên đăng nhập đã hết hạn.
- Tài khoản không có quyền trên bài học đó.
- Hệ thống K12 thay đổi cấu trúc request hoặc script nhúng của trang.

## Cách dùng nhanh

1. Vào `chrome://extensions`.
2. Bật `Developer mode`.
3. Bấm `Load unpacked`.
4. Chọn thư mục `d:\code\k12-ext\chrome-extension`.
5. Mở trang video K12 đã đăng nhập.
6. Bấm `Chạy tiến trình`.

## Extension làm gì

- Chỉ chạy trên trang có URL dạng `https://hcm.k12online.vn/<portal>/page/LMS/Lesson/Courseware/learn/<lessonId>`.
- Tự đọc các giá trị `courseResultId`, `courseSiteId`, `site`, `securityToken` và `options[...]` từ HTML/script hiện tại của trang.
- Gửi `POST` tới API `https://hcm.k12online.vn/api/LMS/Learning/CourseResult/Video/complete` bằng đúng phiên đăng nhập hiện tại.
- Nếu phản hồi là `{"status":"SUCCESS","percent":100}` thì báo hoàn tất.
- Nếu phản hồi khác hoặc request lỗi, trạng thái lỗi sẽ hiển thị ngay cạnh nút.

## Ghi chú

- Extension không hardcode cookie hay token đăng nhập.
- Nếu hệ thống đổi cấu trúc script nhúng trên trang, cần cập nhật regex trong `content.js`.