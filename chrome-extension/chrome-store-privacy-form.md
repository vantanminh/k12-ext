# Chrome Web Store Privacy Form

File này là nội dung gợi ý để điền nhanh phần `Quyền riêng tư` trên Chrome Web Store cho extension `K12 Video Runner`.

## 1. Mục đích duy nhất

### Mô tả mục đích duy nhất

K12 Video Runner có một mục đích duy nhất là giúp người dùng chọn bài học trên hcm.k12online.vn và đánh dấu các bài đã chọn là hoàn thành. Sidebar Chrome đọc các liên kết bài học đang hiển thị, sau đó gửi yêu cầu cho từng bài khi người dùng chủ động chọn và bấm nút. Courseware thường dùng API `Courseware/markComplete`; video vẫn dùng API hoàn tất video. Nút nổi `Hoàn thành bài` trên trang riêng lẻ có thể bật hoặc tắt trong mục Quản lý. Tiện ích không dùng cho quảng cáo, theo dõi hành vi, phân tích dữ liệu hoặc website khác.

## 2. Lý do yêu cầu quyền

### Lý do yêu cầu Quyền từ phía máy chủ

Tiện ích cần quyền truy cập vào mẫu khớp `https://hcm.k12online.vn/*` để content script đọc danh sách bài học đang hiển thị, lấy các tham số cần thiết từ trang bài học và gửi yêu cầu cùng domain sau khi người dùng chọn bài. Quyền `sidePanel` mở sidebar Chrome; quyền `storage` chỉ lưu cục bộ tùy chọn bật/tắt nút nổi. Tiện ích không yêu cầu quyền truy cập website khác, cookies hoặc activeTab.

## 3. Có phải bạn đang dùng mã từ xa không?

Chọn: `Không, tôi hiện không sử dụng Mã từ xa`

### Lý do

Toàn bộ mã JavaScript và CSS của tiện ích đều được đóng gói sẵn trong extension package. Tiện ích không tải hoặc thực thi JavaScript hay Wasm từ máy chủ bên ngoài, không dùng `eval()`, không nhúng script từ xa và không thực thi mô-đun bên ngoài gói extension.

## 4. Sử dụng dữ liệu

### Bạn định thu thập loại dữ liệu nào của người dùng bây giờ hoặc trong tương lai?

Khuyến nghị chọn: `Không có mục nào`.

Giải thích nội bộ:

- Tiện ích không thu thập, lưu trữ hoặc gửi dữ liệu người dùng về phía nhà phát triển.
- Tiện ích chỉ xử lý cục bộ tên và liên kết bài học trên trang hiện tại, cùng các bài người dùng chọn.
- Request được gửi tới cùng hệ thống `hcm.k12online.vn` như một phần của chức năng trên website mà người dùng đang sử dụng, không phải gửi dữ liệu về máy chủ riêng của nhà phát triển extension.
- Tùy chọn nút nổi được lưu cục bộ trong Chrome; danh sách bài chọn không được lưu sau phiên sidebar.

Nếu phía Chrome Web Store yêu cầu cách khai báo bảo thủ hơn trong quá trình review, phương án dự phòng gần nhất là chỉ chọn `Nội dung trang web`. Tuy nhiên với cách triển khai hiện tại, câu trả lời đề xuất vẫn là không thu thập dữ liệu người dùng.

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

Tiện ích cần quyền `https://hcm.k12online.vn/*` để đọc danh sách bài học và gửi request hoàn thành trên cùng domain, quyền `sidePanel` để mở sidebar Chrome, và quyền `storage` để nhớ tùy chọn nút nổi cục bộ.

### Mã từ xa

Không, tôi hiện không sử dụng Mã từ xa.

### Lý do cho mã từ xa

Toàn bộ mã JS và CSS đều nằm trong gói extension. Tiện ích không tải và không thực thi mã JS hoặc Wasm từ bên ngoài.

### Dữ liệu người dùng

Không thu thập dữ liệu người dùng.

### URL chính sách quyền riêng tư

https://github.com/vantanminh/k12-ext/blob/main/chrome-extension/privacy-policy.md
