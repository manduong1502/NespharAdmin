# Dược Phẩm NESPHAR — Zalo Mini App

Ứng dụng Zalo Mini App chính thức dành cho **CÔNG TY TNHH DƯỢC PHẨM NESPHAR** (MST: `3002297464`, Hotline: `0978.420.766`), được xây dựng trên nền tảng chính thức `zmp-cli`, `zmp-ui`, `zmp-sdk`, React 18, TypeScript, Vite 5 và Tailwind CSS.

## Cách chạy thử giao diện ngay trên máy

```bash
cd mini-app

# Cách 1: Chạy trực tiếp trên trình duyệt (khung điện thoại giả lập sẵn)
npm run dev

# Cách 2: Chạy qua khung giả lập chính thức của Zalo Mini App CLI
npm start
```

## Đóng gói & Triển khai lên Zalo Mini App

```bash
# Kiểm tra kiểu dữ liệu TypeScript và build thư mục www/
npm run typecheck
npm run build

# Đăng nhập tài khoản Zalo Developer & đẩy bản cập nhật
npm run login
npm run deploy
```

## 9 Phân hệ đã hoàn thiện (Theo Phụ lục 01 Hợp đồng)

1. **Trang chủ (`/`):** Header chuyển màu khi cuộn, Banner slider, Thẻ thành viên nổi đè mép banner, Lưới 10 danh mục & lối tắt, Banner cam kết chất lượng GPP, Sản phẩm mới, Sản phẩm bán chạy, Ưu đãi tháng sức khỏe, Điều khoản sử dụng & Về chúng tôi.
2. **Danh mục (`/categories`):** Thanh tìm kiếm nhanh, dải danh mục cuộn ngang (chỉ gồm các nhóm hàng được phép hiển thị trên Zalo), sắp xếp & bộ lọc khoảng giá / tồn kho.
3. **Chi tiết sản phẩm (`/product/:id`):** Bộ sưu tập ảnh, nhãn giảm giá, tự động tính giá bán theo **Nhóm khách hàng** (Khách lẻ / Phòng khám / Nhà thuốc / Đại lý), chọn quy cách/đơn vị tính, Số ĐK công bố, mô tả thu gọn/xem thêm, sản phẩm cùng danh mục.
4. **Giỏ hàng (`/cart`):** Tăng/giảm số lượng, chọn từng món, xóa sản phẩm, áp mã Voucher (`NESPHAR30`, `BANMOI20`, `FREESHIPHT`, `DOITAC5`).
5. **Đặt hàng (`/checkout`):** Chọn sổ địa chỉ, đồng bộ SĐT chuẩn **User Intent của Zalo** (không chặn màn hình xem hàng), ghi chú cho Dược sĩ, chọn thanh toán COD / VietQR / ZaloPay.
6. **Đơn hàng (`/orders`):** Đủ 5 trạng thái (`Chờ xác nhận`, `Đã xác nhận`, `Đang giao`, `Hoàn thành`, `Đã hủy`), xem chi tiết, hủy đơn mới đặt và đặt mua lại nhanh.
7. **Tài khoản (`/profile`, `/addresses`, `/vouchers`):** Thẻ thành viên xanh lá Pharma, chuyển đổi thử nghiệm Nhóm khách hàng B2C/B2B, Ví tích điểm, Kho Voucher, Sổ địa chỉ, Lối tắt màn hình chính & Mã QR chia sẻ cửa hàng.
8. **Hỗ trợ & Thông báo (`/notifications` + Nút tiện ích nổi):** Nút giỏ hàng nổi kèm menu mở rộng gọi nhanh Hotline `0978.420.766`, mở chat Zalo OA và gửi form tư vấn Dược sĩ; trang Thông báo có cả danh sách tin lẫn trạng thái trống `"Chưa có thông báo"`.
9. **Chính sách duyệt Zalo (`/policy/:slug`):** Đầy đủ Điều khoản sử dụng, Chính sách bảo mật (Nghị định 13/2023/NĐ-CP), Chính sách kiểm hàng & đổi trả, Chính sách giao hàng & thanh toán, Giới thiệu & Thông tin pháp lý NESPHAR.
