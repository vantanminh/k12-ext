# Chrome Web Store Listing

File này tổng hợp nội dung để copy nhanh lên Chrome Web Store cho extension `K12 Video Runner`.

## 1. Trang thông tin trên Cửa hàng

### Tên trong gói

K12 Video Runner

### Thông tin tóm tắt trong gói

Mở sidebar để chọn và đánh dấu hoàn thành nhiều bài học K12 cùng lúc.

### Mô tả

K12 Video Runner là tiện ích mở rộng dành cho người dùng đang làm việc trên hệ thống hcm.k12online.vn.

K12 Video Runner mở một sidebar ngay trong Chrome để người dùng chọn các bài học đang hiển thị trên trang K12. Sidebar quét các liên kết bài học trong module danh sách như `#listingModule3`, cho phép tìm kiếm, chọn từng bài hoặc chọn tất cả, rồi gửi yêu cầu hoàn thành theo thứ tự.

Khi đang ở trang bài học và đã đăng nhập hợp lệ, tiện ích tự đọc các thông tin cần thiết từ URL và HTML của từng bài, gồm coursewareId, lessonId, courseSiteId, coursewareType, site, securityToken và các tham số options liên quan. Courseware thường dùng API `Courseware/markComplete`; video tiếp tục dùng API hoàn tất video. Mỗi yêu cầu được gửi bằng phiên đăng nhập hiện tại sau khi người dùng chọn bài và bấm nút hoàn thành.

Trên từng trang bài học, người dùng vẫn có thể dùng nút nổi `Hoàn thành bài` một lần. Tab `Quản lý` trong sidebar cho phép bật/tắt nút nổi và mở trang quản lý extension của Chrome.

Điểm hữu ích của tiện ích:

- Chọn và hoàn thành nhiều bài học từ sidebar Chrome.
- Hiển thị nút thao tác nhanh ngay trên trang bài học.
- Tận dụng phiên đăng nhập hiện tại của người dùng, không yêu cầu nhập lại cookie hoặc token.
- Phản hồi rõ ràng ngay trên giao diện sau khi gửi request.
- Nếu hệ thống xác nhận request thành công thì tiện ích thông báo bài học đã hoàn tất.
- Nếu request thất bại hoặc dữ liệu trên trang không đủ, tiện ích hiển thị lỗi tương ứng để người dùng dễ kiểm tra.

Tiện ích chỉ đọc trang và gửi yêu cầu tới `hcm.k12online.vn`. Sidebar chỉ lấy các bài học liên kết trên trang hiện tại; tiện ích không tự chọn hoặc tự hoàn thành bài.

K12 Video Runner phù hợp cho người dùng muốn quản lý và hoàn thành nhanh các bài học K12 từ một sidebar duy nhất.

### Loại

Productivity

Nếu giao diện hiển thị danh mục tiếng Việt, có thể chọn mục tương đương với `Năng suất`.

### Ngôn ngữ

Tiếng Việt

Nếu Chrome Web Store yêu cầu chọn mã ngôn ngữ hoặc tên tiếng Anh, chọn `Vietnamese`.

## 2. Nội dung đồ họa

### Biểu tượng cửa hàng

Yêu cầu upload file ảnh thật, kích thước `128 x 128`.

Gợi ý tên file:

`icon-128.png`

Gợi ý nội dung icon:

- Nền xanh đậm hoặc xanh ngọc.
- Biểu tượng nút Play kết hợp dấu check.
- Phong cách phẳng, dễ nhìn ở kích thước nhỏ.

### Video quảng cáo hiển thị ở mọi ngôn ngữ

URL YouTube:

Để trống nếu chưa có video demo.

Nếu sau này có video, nên dùng video ngắn từ 20 đến 45 giây, quay lại các bước:

1. Mở trang video trên K12.
2. Mở sidebar K12 Video Runner từ icon extension.
3. Chọn một hoặc nhiều bài học.
4. Bấm nút hoàn thành và xem kết quả từng bài.

### Ảnh chụp màn hình

Cần ít nhất 1 ảnh, tối đa 5 ảnh.

Yêu cầu kỹ thuật:

- `1280 x 800` hoặc `640 x 400`
- `JPEG` hoặc `PNG 24-bit`
- Không dùng alpha

Gợi ý 5 ảnh để upload:

1. `screenshot-1-home.png`
   Sidebar hiển thị danh sách bài học có thể chọn.

2. `screenshot-2-running.png`
   Trạng thái đang xử lý nhiều bài đã chọn.

3. `screenshot-3-success.png`
   Trạng thái thành công với thông báo hoàn tất.

4. `screenshot-4-error.png`
   Ví dụ hiển thị lỗi khi thiếu dữ liệu hoặc phiên đăng nhập hết hạn.

5. `screenshot-5-mobile-or-compact.png`
   Giao diện hiển thị gọn trong layout hẹp hơn.

### Ô quảng cáo nhỏ

Yêu cầu ảnh thật, kích thước `440 x 280`.

Gợi ý tên file:

`promo-small-440x280.png`

Gợi ý nội dung chữ trên ảnh:

`K12 Video Runner`

`Chọn và hoàn thành nhiều bài học từ sidebar Chrome`

### Ô quảng cáo marquee

Yêu cầu ảnh thật, kích thước `1400 x 560`.

Gợi ý tên file:

`promo-marquee-1400x560.png`

Gợi ý nội dung chữ trên ảnh:

`K12 Video Runner`

`Quản lý và hoàn thành bài học ngay trên hcm.k12online.vn`

## 3. Các trường bổ sung

### URL chính thức

Không có thì để trống.

### URL trang chủ

Không có thì để trống.

Nếu cần điền sau này, nên dùng website chính thức của dự án hoặc trang giới thiệu riêng cho extension.

### URL hỗ trợ

Không có thì để trống.

Nếu cần điền sau này, nên dùng trang hướng dẫn sử dụng, trang liên hệ hoặc form hỗ trợ.

## 4. Nội dung người lớn

Chọn: `Không`

## 5. Bản copy ngắn để dán nhanh

### Tên trong gói

K12 Video Runner

### Thông tin tóm tắt trong gói

Mở sidebar để chọn và đánh dấu hoàn thành nhiều bài học K12 cùng lúc.

### Mô tả ngắn gọn hơn nếu cần

K12 Video Runner mở sidebar trên Chrome để chọn các bài học đang hiển thị trên hcm.k12online.vn, rồi đánh dấu hoàn thành các bài được chọn bằng phiên đăng nhập hiện tại. Sidebar hiển thị tiến độ và kết quả từng bài; nút nổi trên từng trang có thể bật hoặc tắt trong mục Quản lý.

### Danh mục đề xuất

Productivity

### Ngôn ngữ đề xuất

Vietnamese

### Nội dung người lớn

Không

## 6. Ghi chú trước khi đăng

- Cần chuẩn bị ít nhất 1 ảnh screenshot thật để upload.
- Nếu chưa có website chính thức hoặc trang hỗ trợ, có thể để trống các URL tương ứng.
- Nên kiểm tra lại nội dung mô tả để phù hợp chính sách của Chrome Web Store trước khi gửi duyệt.
