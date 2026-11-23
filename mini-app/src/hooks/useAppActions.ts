import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  addressesAtom,
  cartAtom,
  companyInfoAtom,
  customerIdAtom,
  GUEST_USER_PROFILE,
  loyaltyHistoryAtom,
  notificationsAtom,
  ordersAtom,
  selectedAddressIdAtom,
  supportModalOpenAtom,
  toastMessageAtom,
  useLoyaltyPointsAtom,
  userProfileAtom,
  zaloIdAtom,
  zaloLoginModalAtom,
} from "@/state/store";
import { Product } from "@/types";
import { isPrescriptionProduct } from "@/utils/format";
import { loginWithZaloApi, syncMiniAppPhoneApi } from "@/services/api";
import {
  authorize,
  createShortcut,
  getAccessToken,
  getPhoneNumber,
  getUserInfo,
  openChat,
  openPhone,
  openShareSheet,
} from "zmp-sdk/apis";

let toastTimer: ReturnType<typeof setTimeout> | null = null;

function computeInitials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "KH";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

export function useAppActions() {
  const [cart, setCart] = useAtom(cartAtom);
  const [customerId, setCustomerId] = useAtom(customerIdAtom);
  const [zaloId, setZaloId] = useAtom(zaloIdAtom);
  const [user, setUser] = useAtom(userProfileAtom);
  const [, setAddresses] = useAtom(addressesAtom);
  const [, setSelectedAddressId] = useAtom(selectedAddressIdAtom);
  const [, setOrders] = useAtom(ordersAtom);
  const [loyaltyHistory, setLoyaltyHistory] = useAtom(loyaltyHistoryAtom);
  const [notifications, setNotifications] = useAtom(notificationsAtom);
  const setUseLoyaltyPoints = useSetAtom(useLoyaltyPointsAtom);
  const setZaloLoginModal = useSetAtom(zaloLoginModalAtom);
  const companyInfo = useAtomValue(companyInfoAtom);
  const setToast = useSetAtom(toastMessageAtom);
  const setSupportOpen = useSetAtom(supportModalOpenAtom);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      setToast(null);
    }, 2400);
  };

  const addToCart = (
    product: Product,
    unitOptionId?: string,
    qty = 1,
    silent = false
  ) => {
    if (!product.inStock) {
      showToast("Sản phẩm hiện tạm hết hàng, vui lòng liên hệ Dược sĩ!");
      return false;
    }
    if (isPrescriptionProduct(product) && user.customerTier === "retail") {
      showToast("Thuốc kê đơn (Rx) — Chuyển sang tư vấn Dược sĩ NESPHAR");
      void chatZaloOA(
        `Chào Dược sĩ NESPHAR, tôi cần tư vấn đơn thuốc sản phẩm ${product.sku} - ${product.name}`
      );
      return false;
    }
    const targetUnitId = unitOptionId || product.unitOptions[0].id;
    const existingIdx = cart.findIndex(
      (c) => c.productId === product.id && c.unitOptionId === targetUnitId
    );
    if (existingIdx >= 0) {
      const updated = [...cart];
      updated[existingIdx] = {
        ...updated[existingIdx],
        quantity: updated[existingIdx].quantity + qty,
        checked: true,
      };
      setCart(updated);
    } else {
      setCart([
        ...cart,
        {
          productId: product.id,
          unitOptionId: targetUnitId,
          quantity: qty,
          checked: true,
        },
      ]);
    }
    if (!silent) {
      showToast(`Đã thêm "${product.sku}" vào giỏ hàng`);
    }
    return true;
  };

  const callHotline = async () => {
    try {
      await openPhone({ phoneNumber: companyInfo.hotline });
    } catch {
      window.location.href = `tel:${companyInfo.hotline}`;
      showToast(`Đang kết nối Hotline ${companyInfo.hotlineDisplay}`);
    }
  };

  const chatZaloOA = async (message?: string) => {
    try {
      await openChat({
        type: "oa",
        id: companyInfo.zaloOaId,
        message: message || "Xin chào Dược sĩ NESPHAR, tôi cần tư vấn sản phẩm!",
      });
    } catch {
      setSupportOpen(true);
      showToast("Mở kênh tư vấn Dược sĩ Zalo OA NESPHAR");
    }
  };

  const shareContent = async (title: string, description?: string) => {
    try {
      await openShareSheet({
        type: "link",
        data: {
          link: window.location.href,
          chatOnly: false,
        },
      });
    } catch {
      try {
        await navigator.clipboard.writeText(window.location.href);
        showToast(`Đã sao chép liên kết chia sẻ: ${title}`);
      } catch {
        showToast(description || `Đã sẵn sàng chia sẻ "${title}" qua Zalo`);
      }
    }
  };

  const pinHomeShortcut = async () => {
    try {
      await createShortcut({
        params: {
          utm_source: "zalo_shortcut",
        },
      });
      showToast("Đã gửi yêu cầu tạo lối tắt NESPHAR ra Màn hình chính");
    } catch {
      showToast("Tính năng tạo lối tắt hoạt động trực tiếp trên ứng dụng Zalo điện thoại");
    }
  };

  // Zalo User-Intent Compliant Login: ONLY called from an explicit user button click!
  const loginWithZalo = async () => {
    let sdkUserId = "";
    let sdkName = "";
    let sdkAvatar = "";
    let phoneToken = "";
    let directPhone = "";
    let accessToken = "";
    const isInsideZaloWebView =
      typeof window !== "undefined" &&
      (/Zalo/i.test(navigator.userAgent || "") ||
        Boolean((window as unknown as Record<string, unknown>).ZaloJavaScriptInterface));

    try {
      await authorize({
        scopes: ["scope.userInfo", "scope.userPhonenumber"],
      });
    } catch {
      try {
        await authorize({
          scopes: ["scope.userInfo"],
        });
      } catch {
        // Handled below depending on environment
      }
    }

    try {
      const [uRes, pRes, aRes] = await Promise.all([
        getUserInfo({ autoRequestPermission: true }).catch(() => null),
        getPhoneNumber({}).catch(() => null),
        getAccessToken({}).catch(() => ""),
      ]);
      if (uRes?.userInfo) {
        sdkUserId = String(uRes.userInfo.id || "").trim();
        sdkName = String(uRes.userInfo.name || "").trim();
        sdkAvatar = String(uRes.userInfo.avatar || "").trim();
      }
      if (pRes) {
        phoneToken = String(pRes.token || "");
        directPhone = String(pRes.number || "");
      }
      if (typeof aRes === "string") {
        accessToken = aRes;
      }
    } catch {
      // Outside Zalo native runtime
    }

    // If running on Desktop Browser / Simulator where native Zalo SDK identity is unavailable,
    // open the clean Zalo Member Login bottom sheet so testing & web preview work 100%.
    if (!sdkName && !sdkUserId) {
      if (isInsideZaloWebView) {
        showToast("Vui lòng nhấn Cho phép trên Zalo để đăng nhập & tích điểm");
      } else {
        setZaloLoginModal({ open: true, mode: "login" });
      }
      return false;
    }

    // If inside Zalo WebView and user declined scope.userInfo (so sdkName is empty)
    if (isInsideZaloWebView && !sdkName) {
      showToast("Vui lòng cấp quyền Thông tin Zalo để kích hoạt Ví tích điểm");
      return false;
    }

    const effectiveZid = sdkUserId || zaloId;
    const effectiveName = sdkName || user.name || "Thành viên Zalo";

    try {
      const apiRes = await loginWithZaloApi({
        customerId,
        zaloId: effectiveZid || undefined,
        name: effectiveName,
        avatarUrl: sdkAvatar || undefined,
        phone: directPhone || user.phone || undefined,
        accessToken: accessToken || undefined,
        phoneToken: phoneToken || undefined,
      });

      if (apiRes?.customer) {
        setCustomerId(apiRes.customer.id);
        if (apiRes.customer.zaloId) setZaloId(apiRes.customer.zaloId);
        setUser({
          name: apiRes.customer.name,
          avatarUrl: apiRes.customer.avatarUrl || sdkAvatar || "",
          avatarInitials: computeInitials(apiRes.customer.name),
          zaloLoggedIn: true,
          welcomeBonusClaimed: Boolean(apiRes.customer.welcomeBonusClaimed),
          phone: apiRes.customer.phone,
          phoneLinked: apiRes.customer.phoneLinked,
          loyaltyPoints: apiRes.customer.loyaltyPoints,
          customerTier: apiRes.customer.customerTier,
          customDiscountPercent: apiRes.customer.customDiscountPercent ?? null,
          businessName: apiRes.customer.businessName,
        });
        if (apiRes.addresses?.length) {
          setAddresses(apiRes.addresses);
          const def = apiRes.addresses.find((a) => a.isDefault) || apiRes.addresses[0];
          if (def) setSelectedAddressId(def.id);
        }
        if (apiRes.orders) setOrders(apiRes.orders);
        if (apiRes.loyaltyHistory) setLoyaltyHistory(apiRes.loyaltyHistory);
        window.dispatchEvent(new Event("nesphar:refresh-bootstrap"));
        showToast(
          apiRes.welcomeBonusGranted > 0
            ? `Đăng nhập Zalo thành công! Tặng +${apiRes.welcomeBonusGranted} điểm chào mừng`
            : `Chào mừng ${apiRes.customer.name} quay lại NESPHAR!`
        );
        return true;
      }
    } catch {
      // Cloud preview offline fallback below
    }

    const bonus = user.welcomeBonusClaimed ? 0 : 50;
    const nextPoints = user.loyaltyPoints + bonus;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
      now.getDate()
    )} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    if (effectiveZid) setZaloId(effectiveZid);
    setUser({
      name: effectiveName,
      avatarUrl: sdkAvatar || user.avatarUrl || "",
      avatarInitials: computeInitials(effectiveName),
      zaloLoggedIn: true,
      welcomeBonusClaimed: true,
      phone: directPhone || user.phone,
      phoneLinked: Boolean(directPhone) || user.phoneLinked,
      loyaltyPoints: nextPoints,
    });

    if (bonus > 0) {
      setLoyaltyHistory([
        {
          id: `ltx-zalo-${Date.now()}`,
          type: "welcome",
          pointsChange: bonus,
          balanceAfter: nextPoints,
          title: "Thưởng chào mừng đăng nhập thành viên Zalo lần đầu",
          createdAt: ts,
        },
        ...loyaltyHistory,
      ]);
      setNotifications([
        {
          id: `noti-zalo-${Date.now()}`,
          type: "promo",
          title: "Tặng +50 điểm thành viên Zalo NESPHAR!",
          body: "Bạn vừa nhận +50 điểm tích lũy (= 50.000đ ưu đãi). Dùng điểm trừ trực tiếp khi đặt hàng.",
          createdAt: "Vừa xong",
          read: false,
          targetLink: "/profile?openPoints=1",
        },
        ...notifications,
      ]);
    }

    showToast(
      bonus > 0
        ? `Xin chào ${effectiveName}! Đã cộng +${bonus} điểm thành viên Zalo`
        : `Đăng nhập Zalo thành công: ${effectiveName}`
    );
    return true;
  };

  const linkZaloPhone = async (fallbackPhone?: string) => {
    let phoneToken = "";
    let accessToken = "";
    let directSdkPhone = "";
    try {
      await authorize({ scopes: ["scope.userPhonenumber"] }).catch(() => null);
      const [pVal, aVal] = await Promise.all([
        getPhoneNumber({}).catch(() => null),
        getAccessToken({}).catch(() => ""),
      ]);
      if (pVal) {
        phoneToken = pVal.token || "";
        directSdkPhone = pVal.number || "";
      }
      if (typeof aVal === "string") {
        accessToken = aVal;
      }
    } catch {
      // Fallback
    }

    const candidatePhone = directSdkPhone || fallbackPhone || user.phone;
    if (!candidatePhone && !phoneToken) {
      setZaloLoginModal({ open: true, mode: "phone" });
      return false;
    }

    try {
      const synced = await syncMiniAppPhoneApi({
        customerId,
        zaloId: zaloId || undefined,
        phone: candidatePhone || undefined,
        name: user.name,
        accessToken: accessToken || undefined,
        phoneToken: phoneToken || undefined,
      });
      if (synced?.customer) {
        setCustomerId(synced.customer.id);
        setUser({
          name: synced.customer.name,
          avatarUrl: synced.customer.avatarUrl || user.avatarUrl || "",
          avatarInitials: computeInitials(synced.customer.name),
          zaloLoggedIn: true,
          welcomeBonusClaimed: Boolean(synced.customer.welcomeBonusClaimed),
          phone: synced.customer.phone,
          phoneLinked: true,
          loyaltyPoints: synced.customer.loyaltyPoints,
          customerTier: synced.customer.customerTier,
          customDiscountPercent: synced.customer.customDiscountPercent ?? null,
          businessName: synced.customer.businessName,
        });
        if (synced.addresses.length > 0) setAddresses(synced.addresses);
        if (synced.orders.length > 0) setOrders(synced.orders);
        if (synced.loyaltyHistory) setLoyaltyHistory(synced.loyaltyHistory);
        showToast("Đã liên kết SĐT Zalo & đồng bộ hạng thành viên NESPHAR!");
        return true;
      }
    } catch {
      // If server couldn't decode phoneToken without ZALO_APP_SECRET and no manual phone yet, prompt quick phone input
    }

    if (candidatePhone && candidatePhone.replace(/\D/g, "").length >= 9) {
      setUser({ phone: candidatePhone, phoneLinked: true, zaloLoggedIn: true });
      showToast("Đã liên kết SĐT nhận thông báo & tích điểm NESPHAR!");
      return true;
    }

    setZaloLoginModal({ open: true, mode: "phone" });
    return false;
  };

  const logoutZalo = () => {
    const freshGuestId = `cust-zmp-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    setCustomerId(freshGuestId);
    setZaloId("");
    setUser(GUEST_USER_PROFILE);
    setUseLoyaltyPoints(false);
    setLoyaltyHistory([]);
    setOrders([]);
    showToast("Đã đăng xuất khỏi tài khoản thành viên Zalo");
  };

  return {
    addToCart,
    showToast,
    callHotline,
    chatZaloOA,
    shareContent,
    pinHomeShortcut,
    loginWithZalo,
    linkZaloPhone,
    logoutZalo,
    openSupportSheet: () => setSupportOpen(true),
  };
}
