# Chrome Web Store Privacy Form

File này là nội dung gợi ý để điền nhanh phần `Quyền riêng tư` trên Chrome Web Store cho extension `K12 Video Runner`.

## 1. Mục đích duy nhất

### Mô tả mục đích duy nhất

K12 Video Runner có một mục đích duy nhất là hỗ trợ người dùng trên hcm.k12online.vn thao tác hoàn tất tiến trình của bài học video nhanh hơn. Tiện ích chỉ hiển thị nút `Chạy tiến trình` trên đúng trang bài học video, đọc các tham số cần thiết ngay trên trang hiện tại và gửi yêu cầu hoàn tất video tới hệ thống khi người dùng chủ động bấm nút. Tiện ích không dùng cho quảng cáo, theo dõi hành vi, phân tích dữ liệu, thay đổi nội dung trên website khác hoặc cung cấp chức năng ngoài phạm vi này.

## 2. Lý do yêu cầu quyền

### Lý do yêu cầu Quyền từ phía máy chủ

Tiện ích cần quyền truy cập vào mẫu khớp `https://hcm.k12online.vn/*` vì content script chỉ chạy trên domain này để nhận diện đúng trang bài học video, hiển thị nút thao tác trong giao diện hiện tại, đọc các tham số đã có sẵn trên trang và gửi yêu cầu hoàn tất video tới API cùng domain khi người dùng bấm nút. Tiện ích không yêu cầu quyền trên website khác và không dùng các quyền mở rộng như `tabs`, `storage`, `cookies` hoặc `activeTab`.

## 3. Có phải bạn đang dùng mã từ xa không?

Chọn: `Không, tôi hiện không sử dụng Mã từ xa`

### Lý do

Toàn bộ mã JavaScript và CSS của tiện ích đều được đóng gói sẵn trong extension package. Tiện ích không tải hoặc thực thi JavaScript hay Wasm từ máy chủ bên ngoài, không dùng `eval()`, không nhúng script từ xa và không thực thi mô-đun bên ngoài gói extension.

## 4. Sử dụng dữ liệu

### Bạn định thu thập loại dữ liệu nào của người dùng bây giờ hoặc trong tương lai?

Khuyến nghị chọn: `Không có mục nào`.

Giải thích nội bộ:

- Tiện ích không thu thập, lưu trữ hoặc gửi dữ liệu người dùng về phía nhà phát triển.
- Tiện ích chỉ xử lý cục bộ dữ liệu hiển thị trên trang hiện tại để thực hiện thao tác do chính người dùng kích hoạt.
- Request được gửi tới cùng hệ thống `hcm.k12online.vn` như một phần của chức năng trên website mà người dùng đang sử dụng, không phải gửi dữ liệu về máy chủ riêng của nhà phát triển extension.

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

K12 Video Runner có một mục đích duy nhất là hỗ trợ người dùng trên hcm.k12online.vn thao tác hoàn tất tiến trình của bài học video nhanh hơn. Tiện ích chỉ hiển thị nút `Chạy tiến trình` trên đúng trang bài học video, đọc các tham số cần thiết trên trang hiện tại và gửi yêu cầu hoàn tất video khi người dùng chủ động bấm nút.

### Lý do yêu cầu Quyền từ phía máy chủ

Tiện ích cần quyền truy cập `https://hcm.k12online.vn/*` để chỉ chạy trên domain này, nhận diện đúng trang video, hiển thị nút thao tác, đọc các tham số cần thiết trên trang và gửi request hoàn tất video tới API cùng domain khi người dùng bấm nút.

### Mã từ xa

Không, tôi hiện không sử dụng Mã từ xa.

### Lý do cho mã từ xa

Toàn bộ mã JS và CSS đều nằm trong gói extension. Tiện ích không tải và không thực thi mã JS hoặc Wasm từ bên ngoài.

### Dữ liệu người dùng

Không thu thập dữ liệu người dùng.

### URL chính sách quyền riêng tư

https://github.com/vantanminh/k12-ext/blob/main/chrome-extension/privacy-policy.md