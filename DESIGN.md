# NESPHAR Design System

## Visual Identity: NESPHAR Royal Pharma Blue

Thiết kế đồng bộ nhận diện thương hiệu chính thức cho hệ sinh thái **Công ty TNHH Dược Phẩm NESPHAR** (Zalo Mini App & Web Admin CMS/CRM), trích xuất trực tiếp từ logo gốc viên nang chữ `N` của NESPHAR với sắc **Xanh Biển Dược Phẩm (`#3E4095`)** chuẩn mực, chuyên nghiệp và đạt chuẩn tương phản cao WCAG AAA.

## Color Tokens

| Role | Hex | Usage |
|---|---|---|
| `--pharma-primary` | `#3E4095` | Màu nhận diện gốc từ Logo NESPHAR: Thanh Header Mini App, nút CTA chính (`Mua ngay`, `Đặt hàng`), giá bán chính, nhãn xác thực |
| `--pharma-primary-dark` | `#31337A` / `#282A6E` | Trạng thái nhấn/hover, chữ đậm trên nền xanh nhạt, dải nền Thẻ thành viên |
| `--pharma-navy` | `#1E2059` | Tiêu đề Hero Banner và khối nhấn tương phản cao |
| `--pharma-tint` | `#E6E9FC` / `#EEF0FD` | Pill tab đang chọn ở Bottom Navigation, nút phụ `Thêm vào giỏ`, nền icon danh mục |
| `--surface-bg` | `#F3F5FB` | Nền trang tổng thể (pha sắc xanh băng y khoa dịu nhẹ, sạch sẽ) |
| `--surface-card` | `#FFFFFF` / `#FAFBFF` | Bề mặt thẻ sản phẩm, khối thông tin, danh sách đơn hàng |
| `--surface-border` | `#DCE1F0` | Đường viền 1px tách khối sắc nét (không kết hợp viền 1px với bóng đổ rộng) |
| `--ink-primary` | `#121833` | Chữ tiêu đề và nội dung chính (tương phản > 16:1 trên nền sáng) |
| `--ink-secondary` | `#3E486B` | Chữ mô tả phụ, thông tin hướng dẫn sử dụng |
| `--ink-muted` | `#5A658A` | Nhãn thông số, thời gian, giá gốc gạch ngang (tương phản ≥ 5.5:1) |
| Semantic Sale | `#D92D20` | Nhãn giảm giá `-XX%` góc trên phải thẻ sản phẩm & huy hiệu số lượng |
| Semantic Loyalty | `#D97706` / `#FEF3C7` | Huy hiệu hạng thành viên & nhóm khách hàng B2B |
| Semantic Success | `#15803D` / `#DCFCE7` | Trạng thái đơn hàng Hoàn thành |

## Typography & Numerals

- **Font chính:** `Be Vietnam Pro` (hỗ trợ tối ưu dấu tiếng Việt trên màn hình di động mật độ điểm ảnh cao), fallback hệ thống `-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif`.
- **Tabular Numerals (`font-variant-numeric: tabular-nums`):** Bắt buộc áp dụng cho toàn bộ giá tiền, phần trăm giảm giá, số lượng tồn kho, điểm tích lũy, mã SKU, Số đăng ký công bố và mã đơn hàng.

## Zalo Mini App Layout & Safe-Area Rules

- **Official Brand Mark:** Sử dụng logo viên nang chữ `N` chính thức (`src/static/images/nesphar-logo.png`) tại Header, ô lối tắt `Cửa hàng`, tab `Tất cả` trang Danh mục và tâm mã QR cửa hàng.
- **Top Capsule Clearance:** Mọi màn hình dùng custom header (`actionBarHidden: true`, `statusBar: "transparent"`) đều chừa khoảng trống an toàn cho thanh trạng thái (`zmp-safe-top`) và cụm nút điều khiển gốc `••• | ✕` bên phải của Zalo (`86px` spacer trong WebView Zalo).
- **Persistent 5-Tab Bottom Navigation:** `Trang chủ` • `Đơn hàng` • `Danh mục` • `Thông báo` • `Tài khoản`, nổi bật tab hiện tại bằng pill `#E6E9FC`.
- **Floating Quick Pill:** Cụm nút nổi bên phải dưới gồm **Giỏ hàng** (kèm badge số lượng) và nút **Mở rộng Hỗ trợ nhanh** (Gọi Hotline `0926.090.668`, Chat Zalo OA, Gửi form tư vấn Dược sĩ).
- **Zalo User Intent Compliance:** Không bao giờ chặn màn hình xem hàng bằng popup xin SĐT; chỉ kích hoạt xác thực khi khách bấm thao tác giao dịch cụ thể.

## Web Admin CMS/CRM Design Rules

- **Shell Architecture:** Thanh bên thu gọn `#111424` (có cây lọc nhanh danh mục dưới mục `Sản phẩm` kèm checkbox `#3E4095`), thanh trên `#FFFFFF` (tìm kiếm nhanh `Ctrl+K`, bộ chọn ngày/kỳ báo cáo, hộp thư tư vấn, chuông vận hành, avatar chữ cái `#3E4095`) trên nền `#F5F7FB` và mặt thẻ phẳng `#FFFFFF` viền `1px #ECEFF6`.
- **Overview Hierarchy:** Lưới 12 cột bất đối xứng gồm thẻ biểu đồ `Doanh thu` (7 cột trái, 2 đường `Tổng thu` `#3E4095` & `Khách sỉ` `#14B8A6`) và cụm `2×2` KPI (5 cột phải, duy nhất ô đầu tiên nền đặc `#3E4095`, 3 ô còn lại nền trắng), phía dưới là bảng `Sản phẩm` kèm ảnh thật, trạng thái không xuống dòng và số liệu `tabular-nums`.
- **Copy Restraint (Anti-AI Slop):** Tiêu đề danh từ ngắn gọn (`Sản phẩm`, `Đơn hàng`, `Kho & Lô hạn`, `Khách hàng`), loại bỏ hoàn toàn các dòng phụ đề giải thích dài dòng và không dùng font monospace trang trí ngoài khối mã kỹ thuật.
