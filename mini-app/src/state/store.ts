import { atom } from "jotai";
import {
  Address,
  ArticleItem,
  CartItem,
  Category,
  CustomerTier,
  HeroBanner,
  LoyaltyTransaction,
  NotificationItem,
  Order,
  Product,
  ProductTagInfo,
  PublicPaymentConfig,
  Voucher,
} from "@/types";
import {
  ARTICLES,
  CATEGORIES,
  HERO_BANNERS,
  INITIAL_ADDRESSES,
  INITIAL_NOTIFICATIONS,
  INITIAL_ORDERS,
  NESPHAR_INFO,
  PRODUCT_TAGS,
  PRODUCTS,
  VOUCHERS,
} from "@/data/mockData";
import { CUSTOMER_TIERS, getUnitPriceForTier } from "@/utils/format";

function loadStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage quota errors
  }
}

export interface UserProfile {
  name: string;
  phone: string;
  phoneLinked: boolean;
  zaloLoggedIn?: boolean;
  welcomeBonusClaimed?: boolean;
  avatarUrl?: string;
  avatarInitials: string;
  loyaltyPoints: number;
  customerTier: CustomerTier;
  customDiscountPercent?: number | null;
  businessName?: string;
}

function resolveInitialCustomerId(): string {
  const saved = loadStorage<string>("nesphar_customer_id_v3", "");
  if (saved) return saved;
  const generated = `cust-zmp-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;
  saveStorage("nesphar_customer_id_v3", generated);
  return generated;
}

export const GUEST_USER_PROFILE: UserProfile = {
  name: "Khách hàng Zalo",
  phone: "",
  phoneLinked: false,
  zaloLoggedIn: false,
  welcomeBonusClaimed: false,
  avatarUrl: "",
  avatarInitials: "KH",
  loyaltyPoints: 0,
  customerTier: "retail",
};

const baseCustomerIdAtom = atom<string>(resolveInitialCustomerId());
export const customerIdAtom = atom(
  (get) => get(baseCustomerIdAtom),
  (_get, set, nextId: string) => {
    set(baseCustomerIdAtom, nextId);
    saveStorage("nesphar_customer_id_v3", nextId);
  }
);

const baseZaloIdAtom = atom<string>(loadStorage("nesphar_zalo_id_v2", ""));
export const zaloIdAtom = atom(
  (get) => get(baseZaloIdAtom),
  (_get, set, nextZaloId: string) => {
    set(baseZaloIdAtom, nextZaloId);
    saveStorage("nesphar_zalo_id_v2", nextZaloId);
  }
);

const baseUserAtom = atom<UserProfile>(
  loadStorage("nesphar_user_v2", GUEST_USER_PROFILE)
);
export const userProfileAtom = atom(
  (get) => get(baseUserAtom),
  (get, set, update: Partial<UserProfile>) => {
    const next = { ...get(baseUserAtom), ...update };
    set(baseUserAtom, next);
    saveStorage("nesphar_user_v2", next);
  }
);

const baseLoyaltyHistoryAtom = atom<LoyaltyTransaction[]>(
  loadStorage("nesphar_loyalty_history_v1", [])
);
export const loyaltyHistoryAtom = atom(
  (get) => get(baseLoyaltyHistoryAtom),
  (_get, set, next: LoyaltyTransaction[]) => {
    set(baseLoyaltyHistoryAtom, next);
    saveStorage("nesphar_loyalty_history_v1", next);
  }
);

export const useLoyaltyPointsAtom = atom<boolean>(false);

export const zaloLoginModalAtom = atom<{
  open: boolean;
  mode: "login" | "phone";
}>({
  open: false,
  mode: "login",
});

// Live CMS & Catalog Atoms (initialized with instant offline mockData fallbacks, hydrated live from Backend API)
export const productsAtom = atom<Product[]>(PRODUCTS);
export const categoriesAtom = atom<Category[]>(CATEGORIES);
export const productTagsAtom = atom<ProductTagInfo[]>(PRODUCT_TAGS);
export const bannersAtom = atom<HeroBanner[]>(HERO_BANNERS);
export const vouchersAtom = atom<Voucher[]>(VOUCHERS);
export const articlesAtom = atom<ArticleItem[]>(ARTICLES);
export const companyInfoAtom = atom<typeof NESPHAR_INFO>(NESPHAR_INFO);
export const paymentConfigAtom = atom<PublicPaymentConfig>({
  bankBin: "970436",
  bankShortName: "Vietcombank",
  accountNo: "0201000686868",
  accountName: "CONG TY TNHH DUOC PHAM NESPHAR",
  transferPrefix: "NESPHAR",
});
export const tierDiscountsAtom = atom<Record<CustomerTier, number>>({
  retail: 0,
  clinic: 8,
  pharmacy: 12,
  distributor: 18,
});
export const effectiveDiscountPercentAtom = atom((get) => {
  const user = get(userProfileAtom);
  const map = get(tierDiscountsAtom);
  if (typeof user.customDiscountPercent === "number") {
    return user.customDiscountPercent;
  }
  return map[user.customerTier] ?? CUSTOMER_TIERS[user.customerTier].discountPercent;
});
export const backendSyncedAtom = atom<boolean>(false);

const DEFAULT_CART: CartItem[] = [
  {
    productId: "bio-001",
    unitOptionId: "bc001-u1",
    quantity: 1,
    checked: true,
  },
];

const baseCartAtom = atom<CartItem[]>(loadStorage("nesphar_cart_v2", DEFAULT_CART));
export const cartAtom = atom(
  (get) => get(baseCartAtom),
  (_get, set, next: CartItem[]) => {
    set(baseCartAtom, next);
    saveStorage("nesphar_cart_v2", next);
  }
);

export const cartTotalCountAtom = atom((get) =>
  get(cartAtom).reduce((sum, item) => sum + item.quantity, 0)
);

export const selectedVoucherCodeAtom = atom<string | null>("NESPHAR30");

export const cartSummaryAtom = atom((get) => {
  const cart = get(cartAtom);
  const user = get(userProfileAtom);
  const effectivePct = get(effectiveDiscountPercentAtom);
  const voucherCode = get(selectedVoucherCodeAtom);
  const usePoints = get(useLoyaltyPointsAtom);
  const products = get(productsAtom);
  const vouchers = get(vouchersAtom);

  const detailedItems = cart
    .map((item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product) return null;
      const unitOpt =
        product.unitOptions.find((u) => u.id === item.unitOptionId) ||
        product.unitOptions[0];
      const { price, originalPrice } = getUnitPriceForTier(
        product,
        user.customerTier,
        unitOpt,
        effectivePct,
        item.quantity
      );
      return {
        ...item,
        product,
        unitOpt,
        unitPrice: price,
        originalUnitPrice: originalPrice,
        lineTotal: price * item.quantity,
      };
    })
    .filter(Boolean) as {
    productId: string;
    unitOptionId: string;
    quantity: number;
    checked: boolean;
    product: Product;
    unitOpt: Product["unitOptions"][number];
    unitPrice: number;
    originalUnitPrice: number;
    lineTotal: number;
  }[];

  const checkedItems = detailedItems.filter((i) => i.checked);
  const subtotal = checkedItems.reduce((acc, i) => acc + i.lineTotal, 0);

  let voucherDiscount = 0;
  const appliedVoucher = vouchers.find((v) => v.code === voucherCode) || null;
  if (appliedVoucher && subtotal >= appliedVoucher.minOrderValue) {
    if (appliedVoucher.discountType === "fixed") {
      voucherDiscount = appliedVoucher.discountValue;
    } else {
      const raw = Math.round((subtotal * appliedVoucher.discountValue) / 100);
      voucherDiscount = appliedVoucher.maxDiscount
        ? Math.min(raw, appliedVoucher.maxDiscount)
        : raw;
    }
  }

  const shippingFee = subtotal === 0 || subtotal >= 250000 ? 0 : 25000;
  const isFreeshipVoucher =
    appliedVoucher?.code === "FREESHIPHT" && subtotal >= appliedVoucher.minOrderValue;
  const finalShipping = isFreeshipVoucher ? 0 : shippingFee;
  const finalVoucherDiscount = isFreeshipVoucher ? 0 : voucherDiscount;

  // Loyalty Points Redemption: 1 điểm = 1.000đ, max 50% of after-voucher subtotal
  const afterVoucherSubtotal = Math.max(0, subtotal - finalVoucherDiscount);
  const maxRedeemablePoints =
    subtotal > 0 && user.loyaltyPoints > 0
      ? Math.min(
          Math.max(0, Math.floor(user.loyaltyPoints)),
          Math.floor((afterVoucherSubtotal * 0.5) / 1000)
        )
      : 0;
  const redeemedPoints = usePoints ? maxRedeemablePoints : 0;
  const pointsDiscount = redeemedPoints * 1000;
  const finalDiscount = finalVoucherDiscount + pointsDiscount;
  const total = Math.max(0, subtotal - finalDiscount + finalShipping);
  const estimatedEarnedPoints =
    subtotal > 0 ? Math.max(1, Math.floor(total / 10000)) : 0;

  return {
    detailedItems,
    checkedItems,
    subtotal,
    voucherDiscount: finalVoucherDiscount,
    maxRedeemablePoints,
    redeemedPoints,
    pointsDiscount,
    discountAmount: finalDiscount,
    shippingFee: finalShipping,
    total,
    estimatedEarnedPoints,
    appliedVoucher:
      appliedVoucher && subtotal >= appliedVoucher.minOrderValue
        ? appliedVoucher
        : null,
  };
});

const baseAddressesAtom = atom<Address[]>(
  loadStorage("nesphar_addresses_v1", INITIAL_ADDRESSES)
);
export const addressesAtom = atom(
  (get) => get(baseAddressesAtom),
  (_get, set, next: Address[]) => {
    set(baseAddressesAtom, next);
    saveStorage("nesphar_addresses_v1", next);
  }
);

export const selectedAddressIdAtom = atom<string>(INITIAL_ADDRESSES[0].id);

const baseOrdersAtom = atom<Order[]>(loadStorage("nesphar_orders_v2", INITIAL_ORDERS));
export const ordersAtom = atom(
  (get) => get(baseOrdersAtom),
  (_get, set, next: Order[]) => {
    set(baseOrdersAtom, next);
    saveStorage("nesphar_orders_v2", next);
  }
);

const baseNotificationsAtom = atom<NotificationItem[]>(
  loadStorage("nesphar_noti_v1", INITIAL_NOTIFICATIONS)
);
export const notificationsAtom = atom(
  (get) => get(baseNotificationsAtom),
  (_get, set, next: NotificationItem[]) => {
    set(baseNotificationsAtom, next);
    saveStorage("nesphar_noti_v1", next);
  }
);

export const toastMessageAtom = atom<string | null>(null);
export const supportModalOpenAtom = atom<boolean>(false);
