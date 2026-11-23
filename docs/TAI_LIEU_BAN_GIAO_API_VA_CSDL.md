# TÀI LIỆU BÀN GIAO KỸ THUẬT: KIẾN TRÚC API, CƠ SỞ DỮ LIỆU & THUẬT TOÁN FEFO

**Hợp đồng:** `0711 MKT/2026/HĐDV-TIKOVIA-NESPHAR` (Điều 1.2 — Hạng mục Bàn giao Kỹ thuật)  
**Hệ thống:** NESPHAR Pharma Core (`mini-app` + `backend` + `web-admin`)

---

## 1. Cấu trúc thư mục tổng thể (Monorepo)

```text
MiniAppHieuTHuoc/
├── mini-app/                  # Zalo Mini App (React 18 + ZMP SDK + Jotai + TailwindCSS)
│   ├── src/
│   │   ├── components/        # Layout, BackendSyncBridge, ProductCard, SupportModal...
│   │   ├── pages/             # 11 màn hình chuẩn Zalo Mini App Ngành Dược
│   │   ├── services/api.ts    # Client đồng bộ Live API + Cơ chế Offline Fallback tự động
│   │   └── state/store.ts     # Jotai Reactive Store (Catalog, Giỏ hàng, B2B Tier, Đơn hàng)
│   └── app-config.json        # Cấu hình Zalo Mini App ID 1283290697529026891
│
├── backend/                   # REST API Server & GSP/FEFO Engine (Node.js 22+ + Express + node:sqlite)
│   ├── assets/media/          # Bộ ảnh sản phẩm & thương hiệu chuẩn hóa tự động khởi tạo
│   └── src/
│       ├── db/database.ts     # Khởi tạo 16 bảng SQLite chế độ WAL + Foreign Keys
│       ├── db/seed.ts         # Khởi tạo dữ liệu mẫu NESPHAR & sinh PDF Hồ sơ công bố Bộ Y Tế
│       ├── middleware/auth.ts # Xác thực JWT HMAC-SHA256 & Kiểm soát 9 phân quyền RBAC
│       ├── services/          # Thuật toán xuất kho FEFO & Hoàn nhập lô tự động
│       └── routes/            # miniappRoutes.ts & adminRoutes.ts
│
├── web-admin/                 # Hệ thống Web Admin CMS/CRM (React 18 + TypeScript + Vite)
│   └── src/pages/             # 7 Phân hệ Quản trị đầy đủ theo Hợp đồng + Phiếu in GPP
│
├── deploy/                    # Bộ công cụ triển khai Ubuntu Mini Server
│   ├── setup-ubuntu.sh        # Cài đặt 1 chạm (Docker hoặc PM2)
│   ├── backup-sqlite.sh       # Sao lưu nóng SQLite WAL + Uploads định kỳ
│   ├── nginx-nesphar.conf     # Cấu hình Reverse Proxy + SSL + Gzip
│   └── ecosystem.config.cjs   # Cấu hình quản lý tiến trình PM2
│
├── Dockerfile                 # Multi-stage Production Container (node:22-bookworm-slim)
└── docker-compose.yml         # Orchestration kèm Persistent Volumes bảo toàn dữ liệu
```

---

## 2. Thiết kế Cơ sở dữ liệu (16 Bảng SQLite WAL)

Cơ sở dữ liệu vận hành ở chế độ `PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;` cho phép đọc/ghi đồng thời tốc độ cao và toàn vẹn giao dịch (`ACID`).

| STT | Tên bảng | Chức năng nghiệp vụ |
|---|---|---|
| 1 | `staff_users` | Tài khoản nhân sự (`ADMIN`, `SALES`, `WAREHOUSE`), mật khẩu băm `scrypt` + muối ngẫu nhiên, danh sách quyền `permissions_json` |
| 2 | `categories` | Danh mục ngành hàng Dược phẩm, TPCN, Dược mỹ phẩm, Thiết bị & Vật tư y tế |
| 3 | `products` | Hồ sơ sản phẩm, SKU, Số ĐK công bố Bộ Y Tế (`registration_no`), đường dẫn PDF công bố (`declaration_doc_url`), đa quy cách đóng gói (`unit_options_json`), phân quyền hiển thị theo nhóm khách (`allowed_tiers_json`) |
| 4 | `inventory_batches` | Quản lý lô hàng chuẩn GSP: Mã lô (`batch_code`), Ngày SX (`mfg_date`), Hạn dùng (`exp_date`), Giá nhập (`cost_price`), Tồn lô (`remaining_qty`), Trạng thái (`active` / `quarantined`) |
| 5 | `inventory_movements` | Sổ cái xuất - nhập - kiểm kê - hoàn hàng truy vết tới từng mã lô và mã đơn hàng |
| 6 | `customers` | Hồ sơ khách hàng Zalo & Đối tác B2B (`retail`, `clinic`, `pharmacy`, `distributor`), mã số thuế/GPKD nhà thuốc, chiết khấu riêng, điểm tích lũy |
| 7 | `customer_addresses` | Sổ địa chỉ nhận hàng của từng khách hàng / cơ sở nhà thuốc |
| 8 | `orders` | Đơn đặt hàng đa nguồn (`zalo_mini_app` / `admin_pos`), trạng thái vận hành, trạng thái hoàn hàng (`return_status`), thanh toán (`cod` / `vietqr` / `zalopay`) |
| 9 | `order_items` | Chi tiết từng dòng sản phẩm trong đơn kèm **mảng JSON lưu chính xác các lô FEFO đã trích xuất (`allocations_json`)** |
| 10 | `vouchers` | Kho mã giảm giá theo số tiền cố định hoặc phần trăm, giới hạn lượt dùng & hạn dùng |
| 11 | `banners` | Banner chiến dịch trang chủ Mini App |
| 12 | `articles` | Bài viết Chính sách pháp lý Zalo bắt buộc, Giới thiệu doanh nghiệp & Cẩm nang sức khỏe |
| 13 | `notifications` | Thông báo cá nhân theo đơn hàng/tư vấn và thông báo đẩy toàn hệ thống (`customer_id IS NULL`) |
| 14 | `support_tickets` | Phiếu yêu cầu Tư vấn Dược sĩ / Đăng ký mở đại lý sỉ B2B và lịch sử phản hồi |
| 15 | `system_settings` | Tham số cấu hình toàn cục: thông tin pháp nhân NESPHAR, bảng chiết khấu hạng B2B, ngưỡng cảnh báo cận hạn GSP (`nearExpiryDays`, `lowStockThreshold`) |
| 16 | `audit_logs` | Nhật ký kiểm toán bất biến ghi nhận người thực hiện, vai trò, hành động, đối tượng tác động, dữ liệu thay đổi (`diff_json`) và IP |

---

## 3. Đặc tả Thuật toán Xuất kho Chuẩn GSP / FEFO (`inventoryService.ts`)

1. **Tính tồn kho khả dụng (Sellable Stock):**
   - Chỉ tổng hợp số lượng từ các lô thỏa mãn đồng thời: `status = 'active'`, `remaining_qty > 0` và **`exp_date >= ngày hiện tại`**.
   - Các lô đã hết hạn hoặc đang bị Thủ kho khóa biệt trữ (`quarantined`) tự động bị loại khỏi tồn kho bán trên Zalo Mini App.
2. **Phân bổ lô tự động khi đặt đơn (`allocateBatchesFEFO`):**
   - Thực thi bên trong giao dịch `BEGIN ... COMMIT`.
   - Truy vấn các lô khả dụng sắp xếp theo `ORDER BY exp_date ASC, created_at ASC` (**First Expired, First Out**).
   - Khấu trừ tuần tự từ lô có hạn dùng gần nhất; nếu 1 lô không đủ số lượng quy đổi cơ sở (`ceil(quantity * multiplier)`), thuật toán tự động lấy tiếp phần thiếu ở lô kế tiếp và ghi vết đầy đủ từng lô vào `order_items.allocations_json` + `inventory_movements`.
   - Nếu tổng tồn khả dụng không đủ, toàn bộ đơn hàng được `ROLLBACK` nguyên tử và trả thông báo rõ ràng cho khách hàng.
3. **Hoàn trả tồn kho chuẩn xác theo lô gốc (`restoreBatchesFromOrder`):**
   - Khi khách hủy đơn chờ xác nhận trên Mini App hoặc khi Admin xác nhận **Nhận hàng hoàn & Nhập lại kho**, hệ thống đọc `allocations_json` để cộng trả lại đúng số lượng vào chính xác từng `batch_id` ban đầu và ghi bút toán `ORDER_RETURN` vào sổ cái kho.

---

## 4. Ma trận 9 Phân quyền Nhân sự (RBAC)

| Mã quyền (`PermissionKey`) | Mô tả nghiệp vụ | `ADMIN` | `SALES` | `WAREHOUSE` |
|---|---|:---:|:---:|:---:|
| `view_dashboard` | Xem biểu đồ doanh thu & bảng đối soát vận hành | Có | Có | Có |
| `edit_products` | Thêm/sửa thông tin sản phẩm, số ĐK công bố, ẩn/hiện sản phẩm | Có | Có | Không |
| `change_price` | **Quyền nhạy cảm:** Thay đổi giá bán lẻ niêm yết & giá gốc | **Có** | Không | Không |
| `manage_inventory` | Nhập lô mới, điều chỉnh kiểm kê, khóa/mở biệt trữ lô hàng | Có | Không | **Có** |
| `approve_orders` | Duyệt đơn, cập nhật vận đơn hàng loạt, xử lý hoàn hàng | Có | **Có** | **Có** |
| `manage_crm` | Phân nhóm B2B Nhà thuốc/Đại lý, trả lời tư vấn Dược sĩ | Có | **Có** | Không |
| `manage_cms` | Quản trị Banner, Danh mục, Voucher, Chính sách & Push Notification | Có | **Có** | Không |
| `export_data` | Xuất file CSV Đơn hàng, Tồn kho lô GSP, Danh sách khách hàng | **Có** | Không | Không |
| `manage_staff` | Tạo tài khoản nhân viên, sửa ma trận phân quyền, khóa tài khoản | **Có** | Không | Không |

---

## 5. Danh mục Endpoint REST API Chính

### 5.1. Nhóm API Công khai cho Zalo Mini App (`/api/v1/miniapp`)
- `GET /api/v1/health` — Kiểm tra trạng thái máy chủ, chế độ SQLite WAL và số lượng bản ghi.
- `GET /api/v1/miniapp/bootstrap?customerId=...&phone=...` — Tải trọn gói cấu hình công ty, danh mục, banner, sản phẩm (lọc theo nhóm B2B và tính tồn kho FEFO), voucher, bài viết chính sách, hồ sơ khách hàng, địa chỉ, đơn hàng và thông báo trong 1 request duy nhất.
- `POST /api/v1/miniapp/profile/sync-phone` — Đồng bộ SĐT Zalo (chuẩn User Intent) và tự động khớp hồ sơ đối tác B2B trong CRM.
- `PUT /api/v1/miniapp/profile` — Cập nhật tên hiển thị, SĐT, nhóm hiển thị giá.
- `POST | PUT | DELETE /api/v1/miniapp/addresses[/:id]` — Thêm, đặt mặc định, sửa, xóa địa chỉ nhận hàng.
- `POST /api/v1/miniapp/orders` — Tạo đơn hàng mới, khấu trừ lô FEFO nguyên tử, áp mã voucher và cộng điểm thưởng.
- `POST /api/v1/miniapp/orders/:id/cancel` — Khách hủy đơn `pending` và hoàn trả tồn lô tự động.
- `POST /api/v1/miniapp/notifications/read-all` — Đánh dấu đã đọc tất cả thông báo.
- `POST /api/v1/miniapp/support-tickets` — Gửi câu hỏi tư vấn Dược sĩ / yêu cầu mở tài khoản sỉ về Web Admin.

### 5.2. Nhóm API Quản trị Web Admin (`/api/v1/admin` — Yêu cầu Header `Authorization: Bearer <JWT>`)
- **Auth & Upload:** `POST /auth/login`, `GET /auth/me`, `POST /upload` (`multipart/form-data` lưu ảnh & PDF).
- **Tổng quan & Báo cáo:** `GET /dashboard`, `GET /export/:resource` (`orders` | `inventory` | `customers` | `products`).
- **Sản phẩm & Pháp lý:** `GET /products`, `POST /products`, `PUT /products/:id`, `PATCH /products/:id/visibility`.
- **Kho lô GSP/FEFO:** `GET /inventory/overview`, `POST /inventory/batches`, `PATCH /inventory/batches/:id`.
- **Đơn hàng & Vận hành:** `GET /orders`, `PATCH /orders/:id/status`, `POST /orders/bulk-status`, `POST /orders/:id/return`.
- **CRM & Tư vấn Dược sĩ:** `GET /customers`, `PUT /customers/:id`, `GET /support-tickets`, `PATCH /support-tickets/:id/reply`.
- **CMS & Hệ thống:** `GET /cms/all`, CRUD `/cms/banners`, `/cms/categories`, `/cms/vouchers`, `/cms/articles`, `POST /cms/notifications/broadcast`, `PUT /cms/settings`.
- **Nhân sự & Audit:** `GET /staff`, `POST /staff`, `PUT /staff/:id`, `GET /audit-logs`.
