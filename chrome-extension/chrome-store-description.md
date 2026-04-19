# Chrome Web Store Listing

File này tổng hợp nội dung để copy nhanh lên Chrome Web Store cho extension `K12 Video Runner`.

## 1. Trang thông tin trên Cửa hàng

### Tên trong gói

K12 Video Runner

### Thông tin tóm tắt trong gói

Hiển thị nút Chạy tiến trình trên trang video của hcm.k12online.vn và gửi yêu cầu hoàn tất video.

### Mô tả

K12 Video Runner là tiện ích mở rộng dành cho người dùng đang làm việc trên hệ thống hcm.k12online.vn.

Tiện ích này thêm trực tiếp nút `Chạy tiến trình` vào giao diện trang bài học video, giúp người dùng thao tác nhanh hơn mà không cần tự mở DevTools, tìm request hay gửi API thủ công.

Khi đang ở đúng trang bài học video và đã đăng nhập hợp lệ, tiện ích sẽ tự đọc các thông tin cần thiết ngay trên trang hiện tại, bao gồm courseSiteId, courseResultId, site, securityToken và các tham số options liên quan. Sau đó, khi người dùng bấm nút, tiện ích sẽ gửi yêu cầu hoàn tất video bằng chính phiên đăng nhập hiện tại.

Điểm hữu ích của tiện ích:

- Hiển thị nút thao tác ngay trong giao diện học, không cần thực hiện thủ công bằng công cụ kỹ thuật.
- Tận dụng phiên đăng nhập hiện tại của người dùng, không yêu cầu nhập lại cookie hoặc token.
- Phản hồi rõ ràng ngay trên giao diện sau khi gửi request.
- Nếu hệ thống trả về `{"status":"SUCCESS","percent":100}` thì tiện ích thông báo hoàn tất.
- Nếu request thất bại hoặc dữ liệu trên trang không đủ, tiện ích hiển thị lỗi tương ứng để người dùng dễ kiểm tra.

Tiện ích chỉ hoạt động trên tên miền `hcm.k12online.vn` và chỉ hiển thị trên đúng loại trang bài học video phù hợp. Không chạy trên các website khác.

K12 Video Runner phù hợp cho người dùng cần một cách thao tác nhanh, gọn và trực tiếp ngay trên giao diện học mà không phải lặp lại các bước kỹ thuật mỗi lần xử lý video.

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
2. Nút `Chạy tiến trình` xuất hiện.
3. Bấm nút.
4. Hiện trạng thái hoàn tất.

### Ảnh chụp màn hình

Cần ít nhất 1 ảnh, tối đa 5 ảnh.

Yêu cầu kỹ thuật:

- `1280 x 800` hoặc `640 x 400`
- `JPEG` hoặc `PNG 24-bit`
- Không dùng alpha

Gợi ý 5 ảnh để upload:

1. `screenshot-1-home.png`
   Màn hình trang bài học video với nút `Chạy tiến trình` đã hiển thị.

2. `screenshot-2-running.png`
   Trạng thái đang gửi yêu cầu hoàn tất video.

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

`Thêm nút Chạy tiến trình ngay trên trang video`

### Ô quảng cáo marquee

Yêu cầu ảnh thật, kích thước `1400 x 560`.

Gợi ý tên file:

`promo-marquee-1400x560.png`

Gợi ý nội dung chữ trên ảnh:

`K12 Video Runner`

`Thao tác nhanh trực tiếp trên trang video của hcm.k12online.vn`

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

Hiển thị nút Chạy tiến trình trên trang video của hcm.k12online.vn và gửi yêu cầu hoàn tất video.

### Mô tả ngắn gọn hơn nếu cần

K12 Video Runner thêm nút `Chạy tiến trình` trực tiếp trên trang bài học video của hcm.k12online.vn. Tiện ích tự đọc thông tin cần thiết từ trang hiện tại và gửi yêu cầu hoàn tất video bằng chính phiên đăng nhập đang dùng. Kết quả thành công hoặc lỗi sẽ được hiển thị ngay trên giao diện để người dùng thao tác nhanh hơn mà không cần thực hiện request thủ công.

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