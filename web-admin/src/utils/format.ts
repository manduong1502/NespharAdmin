import { CustomerTier, OrderStatus, PermissionKey, StaffRole } from "../types";

export function formatVnd(amount: number): string {
  return `${Math.round(amount || 0).toLocaleString("vi-VN")}đ`;
}

export function formatCompactVnd(amount: number): string {
  const n = Math.round(amount || 0);
  if (n >= 1_000_000) {
    const tr = (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1);
    return `${tr.replace(".", ",")} tr`;
  }
  if (n >= 1_000) {
    return `${Math.round(n / 1_000)}k`;
  }
  return `${n}đ`;
}

export function formatDateVi(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const clean = dateStr.slice(0, 10);
  const parts = clean.split("-");
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function formatDateTimeVi(dtStr: string | null | undefined): string {
  if (!dtStr) return "—";
  if (dtStr.length >= 16 && dtStr.includes("-")) {
    const datePart = formatDateVi(dtStr.slice(0, 10));
    const timePart = dtStr.slice(11, 16);
    return `${timePart} · ${datePart}`;
  }
  return dtStr;
}

export const TIER_META: Record<
  CustomerTier,
  { label: string; shortLabel: string; discountPct: number; bg: string; ink: string }
> = {
  retail: {
    label: "Khách lẻ",
    shortLabel: "Khách lẻ",
    discountPct: 0,
    bg: "#F1F3F8",
    ink: "#4A536D",
  },
  clinic: {
    label: "Phòng khám",
    shortLabel: "Phòng khám",
    discountPct: 8,
    bg: "#EEF0FD",
    ink: "#3E4095",
  },
  pharmacy: {
    label: "Nhà thuốc",
    shortLabel: "Nhà thuốc",
    discountPct: 12,
    bg: "#E8F8EE",
    ink: "#136C3E",
  },
  distributor: {
    label: "Đại lý",
    shortLabel: "Đại lý",
    discountPct: 18,
    bg: "#FFF6E5",
    ink: "#9A5B00",
  },
};

export const ORDER_STATUS_PILL: Record<
  OrderStatus,
  { label: string; bg: string; ink: string }
> = {
  pending: { label: "Chờ duyệt", bg: "#FFF6E5", ink: "#9A5B00" },
  confirmed: { label: "Đã xác nhận", bg: "#EEF0FD", ink: "#3E4095" },
  shipping: { label: "Đang giao", bg: "#EBF3FF", ink: "#1D4ED8" },
  completed: { label: "Hoàn thành", bg: "#E8F8EE", ink: "#136C3E" },
  cancelled: { label: "Đã hủy", bg: "#FFECEB", ink: "#B42318" },
};

export const ROLE_META: Record<StaffRole, { label: string; bg: string; ink: string }> = {
  ADMIN: { label: "Giám đốc", bg: "#EEF0FD", ink: "#3E4095" },
  SALES: { label: "Dược sĩ", bg: "#E8F8EE", ink: "#136C3E" },
  WAREHOUSE: { label: "Thủ kho", bg: "#FFF6E5", ink: "#9A5B00" },
};

export const PERMISSION_LABELS: Record<
  PermissionKey,
  { title: string; description: string }
> = {
  view_dashboard: {
    title: "Xem tổng quan",
    description: "Xem doanh thu, đơn hàng và báo cáo",
  },
  edit_products: {
    title: "Sửa sản phẩm",
    description: "Thêm, sửa sản phẩm và ẩn/hiện trên App",
  },
  change_price: {
    title: "Đổi giá bán",
    description: "Cập nhật giá vốn và giá bán niêm yết",
  },
  manage_inventory: {
    title: "Quản lý kho lô",
    description: "Nhập lô, kiểm kê và khóa lô hết hạn",
  },
  approve_orders: {
    title: "Xử lý đơn hàng",
    description: "Xác nhận đơn, gán vận đơn và hoàn trả",
  },
  manage_crm: {
    title: "Quản lý khách hàng",
    description: "Phân nhóm giá sỉ và trả lời tư vấn",
  },
  manage_cms: {
    title: "Sửa nội dung App",
    description: "Banner, danh mục, voucher và thông báo",
  },
  export_data: {
    title: "Xuất file Excel/CSV",
    description: "Tải danh sách đơn hàng, kho, sản phẩm",
  },
  manage_staff: {
    title: "Phân quyền nhân sự",
    description: "Tạo tài khoản và cấp quyền nhân viên",
  },
};
