# K12 Video Runner

Chrome extension này có sidebar Chrome để chọn nhiều bài học đang hiển thị trên trang K12 và đánh dấu hoàn thành. Người dùng có thể bật bình luận tự động theo tên, lớp và mã số trong mục Quản lý. Nút `Hoàn thành bài` nổi trên từng trang bài học vẫn có thể bật hoặc tắt tại đó.

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
- `service-worker.js`
- `sidepanel.html`
- `sidepanel.css`
- `sidepanel.js`
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
- Version: `1.3.1`
- Trạng thái đang bật

Nếu Chrome báo lỗi ở file `manifest.json` hoặc `content.js`, cần sửa lỗi rồi quay lại trang `chrome://extensions` và bấm `Reload` trên extension đó.

### 6. Ghim icon extension ra thanh công cụ

Bước này không bắt buộc vì extension chạy trực tiếp trên trang, nhưng nên làm để dễ quản lý:

1. Bấm biểu tượng `Extensions` ở bên phải thanh địa chỉ Chrome.
2. Tìm `K12 Video Runner`.
3. Bấm biểu tượng ghim để pin nó ra thanh toolbar. Bấm icon K12 Video Runner để mở sidebar.

### 7. Sử dụng trên trang K12

1. Đăng nhập vào hệ thống `https://hcm.k12online.vn`.
2. Mở trang danh sách bài học hoặc một bài học, ví dụ dạng:

	`https://hcm.k12online.vn/79000729/page/LMS/Lesson/Student/teacherList?...`

3. Chờ trang tải xong.
4. Bấm icon K12 Video Runner trên thanh công cụ để mở sidebar.
5. Trong tab `Chọn bài`, chọn các bài muốn đánh dấu rồi bấm `Hoàn thành bài đã chọn`.

Sidebar quét các dòng bài học trong danh sách hiện tại, ưu tiên module `#listingModule3`; mỗi dòng có `data-type="Lesson"` và `data-id` được nhận dạng cùng với liên kết courseware thông thường. Sidebar hiển thị tiến độ hiện tại. Với dòng danh sách, extension lấy liên kết chuẩn bằng API `Lesson/learn` khi người dùng bấm hoàn thành, rồi đọc dữ liệu bài để gọi API đánh dấu hoàn thành. Với bài học đang mở, nút nổi `Hoàn thành bài` vẫn thao tác một lần như trước. Trong tab `Quản lý`, có thể bật/tắt nút nổi, bật bình luận tự động, nhập Tên, Lớp, Mã số hoặc mở trang quản lý extension của Chrome.

Với courseware không phải video, extension gửi yêu cầu `Courseware/markComplete` bằng phiên đăng nhập hiện tại. Với video, extension tiếp tục dùng API hoàn tất video hiện có. Khi bật bình luận tự động và hoàn thành bài thành công, extension gửi bình luận dạng `Tên - Lớp - Mã số - đã xem ạ` tới K12. Các thông tin này được lưu trong Chrome và chỉ gửi tới K12 khi tùy chọn đang bật. Sidebar hiển thị tiến độ và kết quả cho từng bài.

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

`Không thấy bài học trong sidebar`:

- Trang hiện tại chưa có dòng bài học hoặc liên kết courseware trong danh sách đang hiển thị.
- Trang chưa tải xong hoàn toàn.
- Bạn đã load nhầm thư mục, không phải `d:\code\k12-ext\chrome-extension`.
- Extension đang bị tắt trong `chrome://extensions`.

`Bấm nút nhưng báo thiếu dữ liệu`:

- Courseware thường cần `coursewareId`, `lessonId`, `courseSiteId`, `coursewareType`, `site` và `securityToken`.
- Video có thể cần thêm `courseResultId`.

`Bấm nút nhưng server trả lỗi`:

- Phiên đăng nhập đã hết hạn.
- Tài khoản không có quyền trên bài học đó.
- Hệ thống K12 thay đổi cấu trúc request hoặc script nhúng của trang.

## Cách dùng nhanh

1. Vào `chrome://extensions`.
2. Bật `Developer mode`.
3. Bấm `Load unpacked`.
4. Chọn thư mục `d:\code\k12-ext\chrome-extension`.
5. Mở trang danh sách bài học K12 đã đăng nhập.
6. Bấm icon extension, chọn bài trong sidebar và bấm `Hoàn thành bài đã chọn`.

## Extension làm gì

- Chỉ đọc nội dung trên `hcm.k12online.vn`; sidebar quét danh sách bài học đang hiển thị, gồm module `#listingModule3` khi có.
- Tự đọc `lessonId` và tên bài từ các dòng `Lesson` của danh sách; khi người dùng bấm hoàn thành, lấy liên kết chuẩn bằng API `Lesson/learn`, rồi đọc `coursewareId`, `courseSiteId`, `coursewareType`, `site`, `securityToken` và các giá trị `options[...]` từ HTML/script của bài.
- Gửi `POST` tới `Courseware/markComplete` cho courseware thường bằng phiên đăng nhập hiện tại; video tiếp tục dùng API hoàn tất video.
- Có mục Quản lý để bật/tắt nút nổi trên trang và mở trang quản lý Chrome.
- Có thể bật bình luận tự động sau khi hoàn thành bài; Tên, Lớp và Mã số do người dùng nhập được lưu cục bộ trong Chrome.
- Chỉ gửi yêu cầu cho các bài người dùng đã chọn và bấm hoàn thành.
- Không lưu hoặc hardcode cookie và token đăng nhập; phần bình luận lấy token theo trang K12 hiện tại.
- Nếu phản hồi khác hoặc request lỗi, trạng thái lỗi sẽ hiển thị ngay cạnh nút.

## Ghi chú

- Extension không hardcode cookie hay token đăng nhập.
- Nếu hệ thống đổi cấu trúc script nhúng trên trang, cần cập nhật regex trong `content.js`.
