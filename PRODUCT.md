# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Full-stack pharmaceutical commerce & operations suite for **CÔNG TY TNHH DƯỢC PHẨM NESPHAR**:
- **Zalo Mini App (`mini-app/`):** `zmp-cli`, React 18, TypeScript, Vite 5, Tailwind CSS, `zmp-ui`, `zmp-sdk`, Jotai — live-synced to Backend API with instant offline resilience (`Mini App ID: 1283290697529026891`).
- **Backend API & GSP/FEFO Engine (`backend/`):** Node.js 22+, Express, built-in `node:sqlite` (`WAL` mode, 16 relational tables), atomic FEFO batch allocation & return restoration, HMAC-SHA256 JWT + 9-permission RBAC.
- **Web Admin CMS/CRM (`web-admin/`):** React 18, TypeScript, Vite 5, Tailwind CSS — 7 contract modules served single-port alongside the API on Ubuntu Mini Server (`Docker Compose` / `PM2`).

## Users

1. **Khách hàng mua lẻ (B2C):** Người tiêu dùng trên nền tảng Zalo tìm mua thực phẩm bảo vệ sức khỏe, dược mỹ phẩm, vật tư & thiết bị y tế chính hãng, xem rõ công dụng, quy cách, số đăng ký công bố Bộ Y Tế kèm hồ sơ PDF, nhận tư vấn dược sĩ qua Zalo OA/Hotline và đặt giao tận nơi.
2. **Khách hàng sỉ ngành Dược (B2B - Phòng khám, Nhà thuốc GPP, Đại lý):** Đối tác của NESPHAR đồng bộ SĐT qua Zalo để mở khóa bảng giá sỉ tự động theo hạng hoặc chiết khấu hợp đồng riêng, đặt hàng nhanh theo quy cách (Hộp/Lọ/Combo/Thùng) và theo dõi mã vận đơn cùng số lô xuất kho FEFO.
3. **Đội ngũ nội bộ NESPHAR (Giám đốc `ADMIN`, Dược sĩ `SALES`, Thủ kho `WAREHOUSE`):** Quản trị danh mục pháp lý Dược, kiểm soát lô hạn dùng GSP/FEFO, duyệt đơn hàng loạt, tạo đơn POS/sỉ nhanh, chăm sóc CRM & xuất báo cáo kế toán CSV.

## Product Purpose

Hệ sinh thái số hóa kênh bán lẻ, phân phối sỉ B2B và quản trị kho Dược chuẩn GPP/GDP/GSP chính thức của **Công ty TNHH Dược Phẩm NESPHAR**, tuân thủ nghiêm ngặt quy định kiểm duyệt ngành Sức khỏe/Dược của Zalo Mini App.

## Brand Commitments

- **Thương hiệu:** CÔNG TY TNHH DƯỢC PHẨM NESPHAR (Đại diện: Bà Nguyễn Thị Hương — Giám đốc)
- **Địa chỉ:** Số 90 Đường Hà Hoàng, Tổ dân phố Đoài Thịnh, P. Trần Phú, tỉnh Hà Tĩnh, Việt Nam
- **Mã số thuế:** `3002297464`
- **Hotline Dược sĩ:** `0926.090.668` (chính) & `0978.420.766` · **Email:** `Duocphamnesphar@gmail.com`
- **Zalo App ID:** `4490716441165809191` · **Zalo Mini App ID:** `1283290697529026891`
- **Nhận diện màu sắc chính thức:** **Royal Pharma Blue (`#3E4095`)** đồng bộ theo logo viên nang chữ `N` chính thức của NESPHAR trên cả Zalo Mini App và Web Admin (`framed-sheet` `#F3F5FB` / `#FFFFFF`).
