export type CustomerTier = "retail" | "clinic" | "pharmacy" | "distributor";

export interface CustomerTierInfo {
  id: CustomerTier;
  label: string;
  shortLabel: string;
  discountPercent: number;
  description: string;
}

export interface ProductUnitOption {
  id: string;
  unitName: string; // e.g., "Hộp", "Lọ", "Tuýp", "Combo 3 Hộp"
  specificationLabel: string; // e.g., "Hộp 60 viên", "Thùng 24 hộp"
  multiplier: number; // multiplier against base unit price
  extraSavePercent?: number;
}

export interface VolumePriceTier {
  minQty: number;
  maxQty?: number | null;
  unitPrice: number;
  label: string;
}

export interface ProductTagInfo {
  id: string;
  name: string;
  shortName: string;
  iconKey:
    | "supplement"
    | "derma"
    | "medical-supply"
    | "device"
    | "mom-baby"
    | "personal-care";
  description: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  tags?: string[];
  isPrescription?: boolean;
  promoBadge?: string;
  volumeTiers?: VolumePriceTier[];
  brand: string;
  origin: string;
  registrationNo: string; // Số ĐK công bố Bộ Y Tế
  declarationDocUrl?: string; // Hồ sơ PDF công bố BYT từ Web Admin
  baseUnit: string; // "Hộp" | "Chai" | "Lọ" | "Tuýp" | "Cái"
  specification: string; // Quy cách đóng gói
  retailPrice: number;
  originalPrice: number;
  inStock: boolean;
  stockCount: number;
  nearestExpDate?: string | null; // HSD lô gần nhất từ hệ thống FEFO
  soldCount: number;
  isNew?: boolean;
  isBestSeller?: boolean;
  isFlashPromo?: boolean;
  hasVideoPreview?: boolean;
  images: string[];
  shortSummary: string;
  ingredients: string;
  benefits: string[];
  dosage: string;
  targetUsers: string;
  storageNote: string;
  disclaimer: string;
  unitOptions: ProductUnitOption[];
}

export interface Category {
  id: string;
  name: string;
  shortName: string;
  iconKey:
    | "supplement"
    | "derma"
    | "medical-supply"
    | "device"
    | "mom-baby"
    | "personal-care";
  description: string;
}

export interface CartItem {
  productId: string;
  unitOptionId: string;
  quantity: number;
  checked: boolean;
}

export interface Voucher {
  id: string;
  code: string;
  title: string;
  description: string;
  discountType: "fixed" | "percent";
  discountValue: number;
  maxDiscount?: number;
  minOrderValue: number;
  expiryDate: string;
  forTier?: CustomerTier[];
}

export interface Address {
  id: string;
  recipientName: string;
  phone: string;
  street: string;
  ward: string;
  district: string;
  province: string;
  isDefault: boolean;
  tag: "Nhà riêng" | "Nhà thuốc / Cơ sở" | "Văn phòng";
}

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "shipping"
  | "completed"
  | "cancelled";

export interface HeroBanner {
  id: string;
  badge: string;
  title: string;
  points: string[];
  image: string;
  ctaLink: string;
}

export interface BatchAllocationItem {
  batchId?: string;
  batchCode?: string;
  batchNumber?: string;
  expDate: string;
  qty: number;
}

export interface OrderLineItem {
  productId: string;
  sku: string;
  name: string;
  image: string;
  unitName: string;
  specificationLabel: string;
  unitPrice: number;
  quantity: number;
  allocations?: BatchAllocationItem[];
}

export interface PublicPaymentConfig {
  bankBin: string;
  bankShortName: string;
  accountNo: string;
  accountName: string;
  transferPrefix: string;
  autoConfirmOnPaid?: boolean;
}

export interface Order {
  id: string;
  code: string;
  createdAt: string;
  status: OrderStatus;
  items: OrderLineItem[];
  subtotal: number;
  discountAmount: number;
  pointsRedeemed?: number;
  pointsDiscount?: number;
  pointsEarned?: number;
  shippingFee: number;
  totalAmount: number;
  voucherCode?: string;
  paymentMethod: "cod" | "vietqr" | "zalopay";
  paymentStatus?: "unpaid" | "paid" | "refunded";
  vietQrUrl?: string;
  shippingCarrier?: string;
  trackingCode?: string;
  returnStatus?: string;
  address: Address;
  note?: string;
  customerTierAtPurchase: CustomerTier;
}

export interface LoyaltyTransaction {
  id: string;
  type: "welcome" | "earn" | "redeem" | "refund" | "admin_adjust";
  pointsChange: number;
  balanceAfter: number;
  title: string;
  orderCode?: string;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  type: "order" | "promo" | "system";
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  targetLink?: string;
}

export interface ArticleItem {
  slug: string;
  group: "policy" | "about" | "health";
  categoryLabel: string;
  title: string;
  updatedAt: string;
  authorLocation: string;
  summary: string;
  bannerTone: "emerald" | "teal" | "mint" | "botanical";
  sections: {
    heading: string;
    paragraphs: string[];
  }[];
}
