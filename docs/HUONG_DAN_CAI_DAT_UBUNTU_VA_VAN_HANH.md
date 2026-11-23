# HƯỚNG DẪN CÀI ĐẶT UBUNTU MINI SERVER & VẬN HÀNH HỆ THỐNG NESPHAR

**Dự án:** Zalo Mini App & Hệ thống Quản trị Dược phẩm (Web Admin CMS/CRM/GSP-FEFO)  
**Chủ đầu tư:** CÔNG TY TNHH DƯỢC PHẨM NESPHAR (MST: `3002297464`)  
**Đơn vị triển khai:** Tikovia (`0711 MKT/2026/HĐDV-TIKOVIA-NESPHAR`)  
**Zalo App ID:** `4490716441165809191` • **Zalo Mini App ID:** `1283290697529026891`

---

## 1. Kiến trúc vận hành tối ưu cho Ubuntu Mini Server

Toàn bộ Backend API + Cơ sở dữ liệu SQLite WAL + Giao diện Web Admin SPA được đóng gói gọn nhẹ trên **1 cổng duy nhất (`4000`)**, chiếm chưa tới **90–140 MB RAM** khi vận hành thực tế:

- `http://<IP-hoặc-Domain>:4000/` → Giao diện **Web Admin Quản trị NESPHAR**
- `http://<IP-hoặc-Domain>:4000/api/v1/admin/*` → REST API Quản trị nội bộ (Bảo vệ bằng JWT + RBAC 9 quyền)
- `http://<IP-hoặc-Domain>:4000/api/v1/miniapp/*` → REST API đồng bộ trực tiếp với **Zalo Mini App**
- `http://<IP-hoặc-Domain>:4000/uploads/*` → Kho lưu trữ ảnh sản phẩm & hồ sơ PDF công bố Bộ Y Tế

---

## 2. Triển khai lên Ubuntu Mini Server (Ubuntu 22.04 / 24.04 LTS)

### Bước 1: Chuyển mã nguồn lên Mini Server

Từ máy tính cá nhân (Windows PowerShell) hoặc Git:

```bash
# Tạo thư mục trên Ubuntu Mini Server
ssh user@<IP-MINI-SERVER> "sudo mkdir -p /opt/nesphar && sudo chown -R \$USER:\$USER /opt/nesphar"

# Copy mã nguồn lên Ubuntu (bỏ qua node_modules để truyền siêu nhanh trong vài giây)
tar --exclude='node_modules' --exclude='mini-app/www' --exclude='backend/data/*.sqlite*' -czf nesphar-release.tar.gz .
scp nesphar-release.tar.gz user@<IP-MINI-SERVER>:/opt/nesphar/
ssh user@<IP-MINI-SERVER> "cd /opt/nesphar && tar -xzf nesphar-release.tar.gz && rm nesphar-release.tar.gz"
```

### Bước 2: Chạy lệnh cài đặt tự động 1 chạm

SSH vào Ubuntu Mini Server và chạy:

```bash
cd /opt/nesphar

# Cách 1 (KHUYẾN NGHỊ): Chạy bằng Docker Compose — Tự đóng gói, tự khởi động lại khi cúp điện/reboot
sudo bash deploy/setup-ubuntu.sh docker

# Hoặc Cách 2: Chạy trực tiếp trên Ubuntu bằng Node.js 22 + PM2 (không dùng Docker)
sudo bash deploy/setup-ubuntu.sh pm2
```

Kiểm tra ngay trạng thái máy chủ:

```bash
curl -s http://127.0.0.1:4000/api/v1/health
```

Nếu trả về `"status":"ok","sqliteMode":"WAL"` là hệ thống đã sẵn sàng! Mở trình duyệt trong mạng LAN công ty tại `http://<IP-LAN-MINI-SERVER>:4000` để đăng nhập ngay Web Admin.

---

## 3. Cấp tên miền HTTPS Public để kết nối Zalo Mini App thực tế

> **Lưu ý quan trọng từ nền tảng Zalo:** Zalo Mini App chạy trên điện thoại bắt buộc mọi API bên ngoài phải sử dụng giao thức **`https://`** có chứng chỉ SSL hợp lệ.

Tùy hạ tầng mạng tại văn phòng công ty, chọn **1 trong 2 phương án** dưới đây:

### Phương án A (Khuyên dùng cho Mini Server đặt tại văn phòng công ty — Không cần IP tĩnh, không cần mở Port Modem)

Sử dụng **Cloudflare Tunnel (`cloudflared`)** miễn phí, chống DDoS và tự động cấp chứng chỉ SSL:

1. Thêm tên miền của công ty (hoặc tên miền quản trị của Tikovia) vào Cloudflare DNS.
2. Vào **Cloudflare Zero Trust → Networks → Tunnels → Create a tunnel (Cloudflared)**, đặt tên `nesphar-mini-server`.
3. Chạy lệnh cài agent `cloudflared` trên Ubuntu theo hướng dẫn hiển thị trên màn hình Cloudflare.
4. Trong tab **Public Hostname** của Tunnel, tạo bản ghi:
   - **Subdomain:** `api` (ví dụ `api.nesphar.vn` hoặc `nesphar.tikovia.vn`)
   - **Type:** `HTTP`
   - **URL:** `127.0.0.1:4000`
5. Ngay lập tức bạn có địa chỉ `https://api.nesphar.vn` vừa vào được **Web Admin** từ mọi nơi, vừa làm **HTTPS API** cho Zalo Mini App!

### Phương án B (Nếu Mini Server có IP Public tĩnh & mở cổng 80/443)

```bash
sudo apt-get update && sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo cp /opt/nesphar/deploy/nginx-nesphar.conf /etc/nginx/sites-available/nesphar.conf
# Sửa server_name trong file thành tên miền thực tế của bạn
sudo nano /etc/nginx/sites-available/nesphar.conf
sudo ln -sf /etc/nginx/sites-available/nesphar.conf /etc/nginx/sites-enabled/nesphar.conf
sudo nginx -t && sudo systemctl reload nginx

# Cấp chứng chỉ SSL miễn phí tự động gia hạn
sudo certbot --nginx -d api.nesphar.vn
```

---

## 4. Liên kết tên miền HTTPS với Zalo Mini App (`1283290697529026891`)

Ngay sau khi có tên miền HTTPS (ví dụ `https://api.nesphar.vn`):

1. **Khai báo Server Domain trên Zalo Mini App Studio:**
   - Truy cập `https://mini.zalo.me` → Chọn Mini App **Dược Phẩm NESPHAR (`1283290697529026891`)**.
   - Vào **Cấu hình ứng dụng / Quản lý quyền → Domain / Server Domain**.
   - Thêm `https://api.nesphar.vn` vào **Request Domain** và thêm cả `https://api.nesphar.vn` cùng `https://img.vietqr.io` vào **Download/Image Domain** (để hiển thị mã quét VietQR động), nhấn **Lưu**.
   - Tại `https://developers.zalo.me` → Ứng dụng `4490716441165809191` → Sao chép **Khóa bí mật của ứng dụng (`App Secret Key`)** điền vào biến `ZALO_APP_SECRET=` trong file `/opt/nesphar/.env` trên Ubuntu để giải mã SĐT thật từ máy chủ Zalo.
2. **Cập nhật biến môi trường & Deploy lại bản Mini App lên Zalo:**
   - Mở file `mini-app/.env`, thêm dòng:
     ```env
     VITE_API_BASE_URL=https://api.nesphar.vn/api/v1/miniapp
     ```
   - Build và đẩy bản cập nhật lên Zalo Cloud:
     ```bash
     cd mini-app
     npm run build
     npx zmp-cli deploy --existing --testing-version
     ```

Từ thời điểm này, mọi thay đổi giá bán, tồn kho lô FEFO, banner, voucher, chính sách trên Web Admin sẽ **hiển thị trực tiếp theo thời gian thực** trên điện thoại khách hàng mở Zalo Mini App!

---

## 5. Tài khoản quản trị bàn giao mặc định (RBAC)

> **Khuyến nghị bảo mật:** Sau khi đăng nhập lần đầu trên Ubuntu Mini Server, Quản trị viên vào mục **Nhân sự & Nhật ký** để cập nhật mật khẩu riêng cho từng nhân sự.

| Vai trò | Email đăng nhập | Mật khẩu mặc định | Quyền hạn tiêu biểu |
|---|---|---|---|
| **Giám đốc / Quản trị cao nhất (`ADMIN`)** | `admin@nesphar.vn` | `Nesphar@2026` | Toàn quyền 9 phân quyền: Sản phẩm, Thay đổi giá bán, Kho lô GSP/FEFO, Đơn hàng, CRM B2B, CMS, Phân quyền nhân sự & Xuất báo cáo |
| **Dược sĩ Tư vấn & Vận đơn (`SALES`)** | `sales@nesphar.vn` | `Nesphar@2026` | Xử lý đơn hàng hàng loạt, phản hồi phiếu tư vấn Dược sĩ, phân nhóm B2B Nhà thuốc/Phòng khám (Không được phép tự ý sửa giá niêm yết hoặc khóa nhân sự) |
| **Thủ kho GSP (`WAREHOUSE`)** | `kho@nesphar.vn` | `Nesphar@2026` | Nhập lô hàng mới, kiểm kê tồn kho, biệt trữ lô cận hạn, in phiếu đóng gói xuất kho FEFO |

---

## 6. Hướng dẫn vận hành 7 phân hệ Web Admin (Theo Hợp đồng)

1. **Tổng quan & Báo cáo (Mục 7):**
   - Theo dõi Doanh thu thuần, Tổng đơn hàng, Tỷ lệ hoàn tất và Giá trị đơn trung bình theo biểu đồ 14 ngày.
   - Hộp **Cần xử lý ngay** gom toàn bộ đơn mới chờ xác nhận, lô cận hạn GSP và câu hỏi khách hàng vào một nơi.
   - Nút **Xuất báo cáo CSV** hỗ trợ mở trực tiếp bằng Microsoft Excel tiếng Việt (chuẩn UTF-8 BOM).
2. **Sản phẩm & Pháp lý Dược (Mục 1):**
   - Quản lý Mã SKU, Số đăng ký công bố Bộ Y Tế (`ĐKSP`, `CBMP`, `TBYT`), tải ảnh sản phẩm và **đính kèm file PDF Hồ sơ công bố** (Zalo thẩm định có thể bấm xem trực tiếp).
   - Thiết lập quy cách đóng gói đa đơn vị (Hộp / Combo / Thùng sỉ) và phân quyền hiển thị riêng cho nhóm B2B.
3. **Kho vận & Lô hạn dùng GSP/FEFO (Mục 2):**
   - Nhập kho theo Số lô (`Batch/Lot`), Ngày sản xuất (`MFG`), Hạn sử dụng (`EXP`) và Giá vốn.
   - Khi khách đặt đơn trên Zalo Mini App, hệ thống **tự động trừ tồn từ lô có HSD gần nhất còn đủ điều kiện lưu hành (FEFO)** và tự động loại trừ tuyệt đối các lô đã hết hạn hoặc đang biệt trữ (`quarantined`).
4. **Đơn hàng & Vận hành (Mục 3):**
   - Hỗ trợ tích chọn nhiều đơn để **Cập nhật trạng thái hàng loạt (Bulk Update)**.
   - Bấm vào từng đơn để xem chi tiết lô FEFO đã phân bổ, **In phiếu xuất kho GPP/GDP** hoặc thực hiện **Nhận hàng hoàn & Cộng trả lại đúng lô gốc**.
5. **Khách hàng, B2B & Tư vấn Dược sĩ (Mục 4):**
   - Nâng hạng tài khoản khách hàng lên **Phòng khám (-8%)**, **Nhà thuốc GPP (-12%)**, **Đại lý phân phối (-18%)** hoặc gán mức chiết khấu hợp đồng riêng. Khi khách đồng bộ SĐT trên Zalo trùng SĐT nhà thuốc trong CRM, Mini App tự động mở khóa bảng giá sỉ!
   - Tiếp nhận và trả lời trực tiếp các phiếu hỏi đáp từ Mini App; câu trả lời tự động đẩy thông báo về hộp thư Thông báo của khách trên Mini App.
6. **Nội dung Mini App & Chính sách Zalo (Mục 5):**
   - Quản lý Banner trang chủ, Danh mục, Mã giảm giá Voucher, 7 bài viết Chính sách Pháp lý bắt buộc của Zalo, Gửi thông báo đẩy hàng loạt và Cấu hình ngưỡng cảnh báo cận hạn GSP.
7. **Nhân sự & Nhật ký Hệ thống (Mục 6):**
   - Cấp phát chi tiết 9 quyền nghiệp vụ cho từng nhân viên và tra cứu **Audit Logs** (ai sửa giá, ai duyệt đơn, ai điều chỉnh tồn kho, vào lúc nào).

---

## 7. Sao lưu tự động hàng ngày & Khôi phục dữ liệu

Thiết lập lịch tự động sao lưu nóng (Hot Backup không gây gián đoạn đơn hàng) lúc **02:30 sáng hàng ngày**:

```bash
(crontab -l 2>/dev/null; echo "30 2 * * * /opt/nesphar/deploy/backup-sqlite.sh >> /var/log/nesphar-backup.log 2>&1") | crontab -
```

Các bản sao lưu được nén tại `/opt/nesphar-backups/` (`nesphar_YYYYMMDD_HHMMSS.sqlite.gz` & `uploads_YYYYMMDD_HHMMSS.tar.gz`) và tự động giữ vòng lặp 14 ngày gần nhất.

**Lệnh cập nhật phần mềm sau này mà KHÔNG mất dữ liệu:**

```bash
cd /opt/nesphar
docker compose up -d --build
# Dữ liệu nằm trong Docker Volume `nesphar_sqlite_data` và `nesphar_uploads_data` nên được bảo toàn 100%.
```

**Lệnh dọn sạch dữ liệu mẫu Demo trước giờ G mở bán thật (Go-Live Reset):**

```bash
cd /opt/nesphar
sudo bash deploy/go-live-reset.sh
# Tự động sao lưu trước rồi xóa toàn bộ đơn hàng & khách hàng mẫu, giữ nguyên tài khoản Admin, Danh mục, Chính sách Zalo & Cấu hình VietQR/Telegram.
```

---

## 8. Kiến trúc Phòng thủ Đa tầng & Chống tấn công DDoS

Hệ thống đã được tích hợp sẵn **4 lớp bảo vệ chuyên sâu** dành riêng cho môi trường **Ubuntu Mini Server**:

1. **Lớp 1 — Mạng biên (Cloudflare Edge WAF + Nginx Anti-DDoS):**
   - Khuyến nghị đi qua **Cloudflare Tunnel (`cloudflared`)** để ẩn hoàn toàn IP WAN của công ty (`HOST_BIND_IP=127.0.0.1`) và tận hưởng lớp lọc DDoS Layer 3/4/7 miễn phí của Cloudflare.
   - Cấu hình `deploy/nginx-nesphar.conf` tích hợp sẵn `limit_req_zone` (chặn flood API & brute-force login), `limit_conn_zone` (tối đa 25 kết nối đồng thời/IP chống Slowloris), và tự động ngắt kết nối `444` (tốn 0% CPU) với các bot quét `.env`, `.git`, `wp-admin`, `phpmyadmin`.
2. **Lớp 2 — Hệ điều hành Ubuntu & Container Cô lập (`setup-ubuntu.sh` & `docker-compose.yml`):**
   - Kích hoạt `tcp_syncookies` và `rp_filter` cấp nhân Linux chống TCP SYN-Flood & giả mạo IP.
   - Bật tường lửa `UFW` + `Fail2ban` chống dò mật khẩu SSH.
   - Container chạy dưới tài khoản phi đặc quyền (`USER node`), bật cờ `no-new-privileges:true`, giới hạn `pids_limit: 128` (chống fork-bomb) và `mem_limit: 512m` (ngăn tràn RAM sang hệ điều hành máy chủ).
3. **Lớp 3 — Ứng dụng & Chống Gian lận Nghiệp vụ (`securityShield.ts`):**
   - **Rate Limiter đa tầng giới hạn bộ nhớ (LRU):** Giới hạn tổng `240 req/phút/IP`, giới hạn ghi đơn/hỗ trợ `20 req/phút/IP`, và khóa đăng nhập `15 phút` sau `8` lần sai mật khẩu liên tiếp (kèm ghi vết `SECURITY_LOGIN_LOCKOUT` vào Audit Logs).
   - **Chống sửa giá đơn hàng (Server-Authoritative Pricing):** Luôn tính lại giá bán từ CSDL trên máy chủ, bỏ qua mọi đơn giá từ phía client gửi lên; kiểm tra hạn dùng Voucher thực tế và khóa đặt các sản phẩm đang ẩn.
   - **Kiểm tra chữ ký nhị phân (Magic Bytes) & Sandbox CSP:** Chỉ nhận tệp có header nhị phân thật của `JPEG/PNG/WEBP/PDF`, tự động xóa ngay tệp HTML/Script đổi đuôi giả mạo; gắn `Content-Security-Policy: sandbox` trên `/uploads` và chống thực thi công thức độc hại (`CSV Formula Injection`) khi mở báo cáo bằng Excel.
   - **Bảo mật phiên JWT:** Không chấp nhận JWT trên URL query string (tránh lộ token trong log), chặn thuật toán `alg: none`, và chặn Quản trị viên tự khóa hoặc tự hạ quyền tài khoản `ADMIN` cuối cùng.
4. **Lớp 4 — An toàn Toàn vẹn CSDL SQLite WAL:**
   - Bắt tín hiệu tắt máy (`SIGTERM` / `SIGINT`) để tự động chốt sổ `PRAGMA wal_checkpoint(TRUNCATE)` trước khi đóng tiến trình, bảo vệ dữ liệu nguyên vẹn khi Mini Server khởi động lại.
