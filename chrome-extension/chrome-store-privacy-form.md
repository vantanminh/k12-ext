# Chrome Web Store Privacy Form

File này là nội dung gợi ý để điền nhanh phần `Quyền riêng tư` trên Chrome Web Store cho extension `K12 Video Runner`.

## 1. Mục đích duy nhất

### Mô tả mục đích duy nhất

K12 Video Runner có một mục đích duy nhất là giúp người dùng chọn bài học trên hcm.k12online.vn và đánh dấu các bài đã chọn là hoàn thành. Sidebar đọc tên, ID và tiến độ từ các dòng bài đang hiển thị. Khi người dùng chọn bài và bấm nút, tiện ích gửi lessonId tới API `Lesson/learn` để lấy liên kết chuẩn, đọc dữ liệu cần thiết từ trang bài, rồi gửi yêu cầu hoàn thành. Courseware thường dùng API `Courseware/markComplete`; video vẫn dùng API hoàn tất video. Người dùng có thể bật bình luận tự động dạng `Tên - Lớp - Mã số - đã xem ạ`. Nút nổi `Hoàn thành bài` trên trang riêng lẻ có thể bật hoặc tắt trong mục Quản lý. Tiện ích không dùng cho quảng cáo, theo dõi hành vi, phân tích dữ liệu hoặc website khác.

## 2. Lý do yêu cầu quyền

### Lý do yêu cầu Quyền từ phía máy chủ

Tiện ích cần quyền truy cập vào mẫu khớp `https://hcm.k12online.vn/*` để content script đọc danh sách bài học đang hiển thị, lấy liên kết bài bằng API `Lesson/learn`, đọc các tham số cần thiết từ trang bài học và gửi yêu cầu cùng domain sau khi người dùng chọn bài. Quyền `sidePanel` mở sidebar Chrome; quyền `storage` lưu tùy chọn và thông tin bình luận cục bộ. Tiện ích không yêu cầu quyền truy cập website khác, cookies hoặc activeTab.

## 3. Có phải bạn đang dùng mã từ xa không?

Chọn: `Không, tôi hiện không sử dụng Mã từ xa`

### Lý do

Toàn bộ mã JavaScript và CSS của tiện ích đều được đóng gói sẵn trong extension package. Tiện ích không tải hoặc thực thi JavaScript hay Wasm từ máy chủ bên ngoài, không dùng `eval()`, không nhúng script từ xa và không thực thi mô-đun bên ngoài gói extension.

## 4. Sử dụng dữ liệu

### Bạn định thu thập loại dữ liệu nào của người dùng bây giờ hoặc trong tương lai?

Để khai báo thận trọng, chọn `Thông tin nhận dạng cá nhân` cho Tên và Mã số người dùng tự nhập. Các giá trị chỉ lưu trong Chrome và chỉ được gửi tới `hcm.k12online.vn` khi người dùng bật bình luận tự động rồi chủ động hoàn thành bài.

Giải thích nội bộ:

- Tiện ích không gửi dữ liệu về phía nhà phát triển; tên, lớp và mã số tùy chọn được lưu cục bộ trong Chrome.
- Tiện ích chỉ xử lý cục bộ tên và liên kết bài học trên trang hiện tại, cùng các bài người dùng chọn.
- Request được gửi tới cùng hệ thống `hcm.k12online.vn` như một phần của chức năng trên website mà người dùng đang sử dụng, không phải gửi dữ liệu về máy chủ riêng của nhà phát triển extension.
- Tùy chọn nút nổi, cài đặt bình luận và thông tin bình luận được lưu cục bộ trong Chrome; danh sách bài chọn không được lưu sau phiên sidebar.

Nếu biểu mẫu hiển thị tên loại dữ liệu khác, chọn loại gần nhất với tên và mã số. Không khai báo rằng extension không xử lý dữ liệu nhận dạng cá nhân.

## 5. Các xác nhận bắt buộc

Đánh dấu xác nhận cả 3 mục sau:

- `Tôi không bán hoặc chuyển dữ liệu người dùng cho bên thứ ba, ngoài những trường hợp sử dụng đã được phê duyệt`.
- `Tôi không sử dụng hoặc chuyển dữ liệu người dùng cho các mục đích không liên quan đến mục đích duy nhất của mặt hàng mà tôi sở hữu`.
- `Tôi không sử dụng hoặc chuyển dữ liệu người dùng để xác định khả năng thanh toán nợ hoặc phục vụ mục đích cho vay`.

## 6. Chính sách quyền riêng tư

### URL đến chính sách quyền riêng tư

Sau khi push file lên GitHub public, dùng URL này:

`https://github.com/vantanminh/k12-ext/blob/main/chrome-extension/privacy-policy.md`

Nếu repo đang là private, cần chuyển file này sang một URL public trước khi nộp lên store, ví dụ GitHub Pages hoặc một website công khai khác.

## 7. Bản copy ngắn để dán nhanh

### Mô tả mục đích duy nhất

K12 Video Runner mở sidebar Chrome để người dùng chọn các bài học đang hiển thị trên hcm.k12online.vn và đánh dấu các bài đó hoàn thành khi họ bấm nút. Nút nổi trên trang bài học có thể bật hoặc tắt trong mục Quản lý.

### Lý do yêu cầu Quyền từ phía máy chủ

Tiện ích cần quyền `https://hcm.k12online.vn/*` để đọc danh sách bài học, gọi API `Lesson/learn` lấy liên kết bài và gửi request hoàn thành trên cùng domain, quyền `sidePanel` để mở sidebar Chrome, và quyền `storage` để nhớ tùy chọn nút nổi cục bộ.

### Mã từ xa

Không, tôi hiện không sử dụng Mã từ xa.

### Lý do cho mã từ xa

Toàn bộ mã JS và CSS đều nằm trong gói extension. Tiện ích không tải và không thực thi mã JS hoặc Wasm từ bên ngoài.

### Dữ liệu người dùng

Thông tin nhận dạng cá nhân do người dùng tự nhập (Tên và Mã số) được lưu cục bộ trong Chrome và chỉ gửi tới hcm.k12online.vn khi người dùng bật bình luận tự động.

### URL chính sách quyền riêng tư

https://github.com/vantanminh/k12-ext/blob/main/chrome-extension/privacy-policy.md
