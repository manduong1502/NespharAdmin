import {
  Address,
  ArticleItem,
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

const envApiBase = (
  import.meta.env.VITE_API_BASE_URL as string | undefined
)?.trim();

export const MINIAPP_API_BASE = envApiBase
  ? envApiBase.replace(/\/+$/, "")
  : typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1")
  ? "http://localhost:4000/api/v1/miniapp"
  : "";

export class ApiBusinessError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiBusinessError";
    this.status = status;
  }
}

async function requestJson<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = 5000
): Promise<T | null> {
  if (!MINIAPP_API_BASE) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${MINIAPP_API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new ApiBusinessError(
        (data && typeof data.error === "string" && data.error) ||
          `Lỗi kết nối máy chủ (${res.status})`,
        res.status
      );
    }
    return data as T;
  } catch (err) {
    if (err instanceof ApiBusinessError) {
      throw err;
    }
    // Network offline / CORS / timeout -> return null so caller falls back gracefully
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface BootstrapResponse {
  companyInfo?: Record<string, string>;
  paymentConfig?: PublicPaymentConfig;
  tierDiscounts?: Record<string, number>;
  productTags?: ProductTagInfo[];
  categories: Category[];
  banners: HeroBanner[];
  products: Product[];
  vouchers: Voucher[];
  articles: ArticleItem[];
  customer: {
    id: string;
    zaloId?: string | null;
    name: string;
    avatarUrl?: string;
    zaloLoggedIn?: boolean;
    welcomeBonusClaimed?: boolean;
    phone: string;
    phoneLinked: boolean;
    loyaltyPoints: number;
    customerTier: CustomerTier;
    customDiscountPercent?: number | null;
    businessName?: string;
  } | null;
  addresses: Address[];
  orders: Order[];
  loyaltyHistory?: LoyaltyTransaction[];
  notifications: NotificationItem[];
  syncedAt: string;
}

export function fetchMiniAppBootstrap(
  customerId: string,
  phone?: string,
  zaloId?: string
) {
  const qs = new URLSearchParams({ customerId });
  if (phone) qs.set("phone", phone);
  if (zaloId) qs.set("zaloId", zaloId);
  return requestJson<BootstrapResponse>(`/bootstrap?${qs.toString()}`);
}

export function loginWithZaloApi(payload: {
  customerId: string;
  zaloId?: string;
  name?: string;
  avatarUrl?: string;
  phone?: string;
  accessToken?: string;
  phoneToken?: string;
}) {
  return requestJson<{
    ok: boolean;
    welcomeBonusGranted: number;
    verifiedByZaloServer?: boolean;
    customer: NonNullable<BootstrapResponse["customer"]>;
    addresses: Address[];
    orders: Order[];
    loyaltyHistory: LoyaltyTransaction[];
  }>("/auth/zalo-login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function syncMiniAppPhoneApi(payload: {
  customerId: string;
  zaloId?: string;
  phone?: string;
  name?: string;
  accessToken?: string;
  phoneToken?: string;
}) {
  return requestJson<{
    verifiedByZaloServer?: boolean;
    customer: NonNullable<BootstrapResponse["customer"]>;
    addresses: Address[];
    orders: Order[];
    loyaltyHistory?: LoyaltyTransaction[];
  }>("/profile/sync-phone", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateMiniAppProfileApi(payload: {
  customerId: string;
  zaloId?: string;
  name?: string;
  phone?: string;
  customerTier?: CustomerTier;
}) {
  return requestJson<{ ok: boolean; customerId?: string }>("/profile", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function createMiniAppAddressApi(payload: {
  customerId: string;
  zaloId?: string;
  recipientName: string;
  phone: string;
  street: string;
  ward: string;
  district: string;
  province: string;
  tag: Address["tag"];
  isDefault: boolean;
}) {
  return requestJson<{
    addresses: Address[];
    createdId: string;
    customerId?: string;
  }>("/addresses", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateMiniAppAddressApi(
  addressId: string,
  payload: Partial<Address> & { customerId: string }
) {
  return requestJson<{ addresses: Address[] }>(
    `/addresses/${encodeURIComponent(addressId)}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    }
  );
}

export function deleteMiniAppAddressApi(addressId: string, customerId: string) {
  return requestJson<{ addresses: Address[] }>(
    `/addresses/${encodeURIComponent(addressId)}?customerId=${encodeURIComponent(
      customerId
    )}`,
    {
      method: "DELETE",
    }
  );
}

export function createMiniAppOrderApi(payload: {
  customerId: string;
  zaloId?: string;
  items: Array<{
    productId: string;
    unitOptionId: string;
    unitName: string;
    unitPrice: number;
    quantity: number;
  }>;
  address: Address;
  voucherCode?: string;
  redeemPoints?: number;
  paymentMethod: "cod" | "vietqr" | "zalopay";
  note?: string;
  customerTier: CustomerTier;
}) {
  return requestJson<{
    order: Order;
    earnedPoints: number;
    redeemedPoints?: number;
    pointsDiscount?: number;
    newLoyaltyBalance?: number;
    loyaltyHistory?: LoyaltyTransaction[];
    customerId?: string;
  }>("/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function cancelMiniAppOrderApi(
  orderId: string,
  customerId: string,
  reason?: string
) {
  return requestJson<{
    ok: boolean;
    loyaltyPoints?: number;
    loyaltyHistory?: LoyaltyTransaction[];
    orders?: Order[];
  }>(
    `/orders/${encodeURIComponent(orderId)}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({ customerId, reason }),
    }
  );
}

export function markNotificationReadApi(
  notificationId: string,
  customerId: string
) {
  return requestJson<{ ok: boolean }>(
    `/notifications/${encodeURIComponent(notificationId)}/read`,
    {
      method: "POST",
      body: JSON.stringify({ customerId }),
    }
  );
}

export function markAllNotificationsReadApi(customerId: string) {
  return requestJson<{ ok: boolean }>("/notifications/read-all", {
    method: "POST",
    body: JSON.stringify({ customerId }),
  });
}

export function submitSupportTicketApi(payload: {
  customerId: string;
  customerName: string;
  phone: string;
  topic: "tu-van" | "bao-gia-si" | "gop-y";
  content: string;
}) {
  return requestJson<{ ok: boolean; id: string; ticketId: string }>(
    "/support-tickets",
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}
