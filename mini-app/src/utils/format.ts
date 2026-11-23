import { CustomerTier, CustomerTierInfo, OrderStatus, Product, ProductUnitOption } from "@/types";

export const OFFICIAL_TAG_META: Record<
  string,
  { label: string; shortLabel: string; isRx?: boolean }
> = {
  "nhom-nhi-khoa": {
    label: "Nhóm Nhi khoa",
    shortLabel: "Nhi khoa",
  },
  "nhom-thuoc-nhap-khau": {
    label: "Nhóm thuốc Nhập Khẩu",
    shortLabel: "Thuốc Nhập khẩu",
  },
  "nhom-tpbvsk-nhap-khau": {
    label: "Nhóm Thực phẩm BVSK Nhập khẩu",
    shortLabel: "TPBVSK Nhập khẩu",
  },
  "nhom-thuoc-ke-don": {
    label: "Nhóm thuốc kê đơn",
    shortLabel: "Thuốc kê đơn (Rx)",
    isRx: true,
  },
  "nhom-thuoc-khong-ke-don": {
    label: "Nhóm thuốc không kê đơn",
    shortLabel: "Không kê đơn",
  },
};

export function isPrescriptionProduct(product: Product): boolean {
  return Boolean(
    product.isPrescription ||
      (Array.isArray(product.tags) && product.tags.indexOf("nhom-thuoc-ke-don") !== -1)
  );
}

export const CUSTOMER_TIERS: Record<CustomerTier, CustomerTierInfo> = {
  retail: {
    id: "retail",
    label: "Khách lẻ Thành viên",
    shortLabel: "Thành viên",
    discountPercent: 0,
    description: "Giá niêm yết ưu đãi trực tiếp cho khách hàng cá nhân & tích điểm đổi quà.",
  },
  clinic: {
    id: "clinic",
    label: "Đối tác Phòng khám",
    shortLabel: "Phòng khám (-8%)",
    discountPercent: 8,
    description: "Chiết khấu tự động 8% dành cho Phòng khám chuyên khoa đã xác thực.",
  },
  pharmacy: {
    id: "pharmacy",
    label: "Đối tác Nhà thuốc",
    shortLabel: "Nhà thuốc (-12%)",
    discountPercent: 12,
    description: "Bảng giá sỉ chiết khấu 12% dành cho Quầy thuốc / Nhà thuốc GPP.",
  },
  distributor: {
    id: "distributor",
    label: "Đại lý Phân phối",
    shortLabel: "Đại lý (-18%)",
    discountPercent: 18,
    description: "Bảng giá chiết khấu 18% theo hợp đồng Đại lý Dược phẩm NESPHAR.",
  },
};

export function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString("vi-VN")}đ`;
}

export function calcDiscountPercent(price: number, originalPrice: number): number {
  if (!originalPrice || originalPrice <= price) return 0;
  return Math.round(((originalPrice - price) / originalPrice) * 100);
}

export function getUnitPriceForTier(
  product: Product,
  tier: CustomerTier,
  unitOption?: ProductUnitOption,
  overrideDiscountPercent?: number | null,
  quantity = 1
): { price: number; originalPrice: number } {
  const opt = unitOption || product.unitOptions[0];
  const multiplier = opt && opt.multiplier > 0 ? opt.multiplier : 1;
  const extraSave = opt?.extraSavePercent ? (100 - opt.extraSavePercent) / 100 : 1;
  const pct =
    typeof overrideDiscountPercent === "number"
      ? overrideDiscountPercent
      : CUSTOMER_TIERS[tier].discountPercent;
  const tierDiscount = (100 - Math.max(0, pct)) / 100;

  const standardPrice =
    Math.round((product.retailPrice * multiplier * extraSave * tierDiscount) / 100) * 100;
  const roundedOriginal =
    Math.round((product.originalPrice * multiplier) / 100) * 100;

  let finalPrice = standardPrice;
  if (Array.isArray(product.volumeTiers) && product.volumeTiers.length > 0) {
    const totalBaseUnits = Math.max(1, Math.round(quantity * multiplier));
    let matchedBracketPrice: number | null = null;
    for (let i = 0; i < product.volumeTiers.length; i += 1) {
      const vt = product.volumeTiers[i];
      if (
        totalBaseUnits >= vt.minQty &&
        (vt.maxQty === null || vt.maxQty === undefined || totalBaseUnits <= vt.maxQty)
      ) {
        matchedBracketPrice = vt.unitPrice;
      }
    }
    if (matchedBracketPrice && matchedBracketPrice > 0) {
      const bracketPrice = Math.round((matchedBracketPrice * multiplier) / 100) * 100;
      finalPrice = Math.min(standardPrice, bracketPrice);
    }
  }

  return {
    price: finalPrice,
    originalPrice: roundedOriginal,
  };
}

export const ORDER_STATUS_META: Record<
  OrderStatus,
  { label: string; dotColor: string; chipBg: string; chipText: string }
> = {
  pending: {
    label: "Chờ xác nhận",
    dotColor: "#D97706",
    chipBg: "#FEF3C7",
    chipText: "#92400E",
  },
  confirmed: {
    label: "Đã xác nhận",
    dotColor: "#0284C7",
    chipBg: "#E0F2FE",
    chipText: "#075985",
  },
  shipping: {
    label: "Đang giao",
    dotColor: "#3E4095",
    chipBg: "#DDE1FA",
    chipText: "#282A6E",
  },
  completed: {
    label: "Hoàn thành",
    dotColor: "#15803D",
    chipBg: "#DCFCE7",
    chipText: "#166534",
  },
  cancelled: {
    label: "Đã hủy",
    dotColor: "#DC2626",
    chipBg: "#FEE2E2",
    chipText: "#991B1B",
  },
};
