import React, { useCallback, useEffect } from "react";
import { useAtom, useSetAtom } from "jotai";
import { getUserInfo } from "zmp-sdk/apis";
import {
  addressesAtom,
  articlesAtom,
  backendSyncedAtom,
  bannersAtom,
  categoriesAtom,
  companyInfoAtom,
  customerIdAtom,
  loyaltyHistoryAtom,
  notificationsAtom,
  ordersAtom,
  paymentConfigAtom,
  productsAtom,
  productTagsAtom,
  selectedAddressIdAtom,
  tierDiscountsAtom,
  userProfileAtom,
  vouchersAtom,
  zaloIdAtom,
} from "@/state/store";
import { NESPHAR_INFO } from "@/data/mockData";
import { fetchMiniAppBootstrap } from "@/services/api";

function computeInitials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "KH";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

export const BackendSyncBridge: React.FC = () => {
  const [customerId, setCustomerId] = useAtom(customerIdAtom);
  const [zaloId, setZaloId] = useAtom(zaloIdAtom);
  const [user, setUser] = useAtom(userProfileAtom);
  const setProducts = useSetAtom(productsAtom);
  const setCategories = useSetAtom(categoriesAtom);
  const setProductTags = useSetAtom(productTagsAtom);
  const setBanners = useSetAtom(bannersAtom);
  const setVouchers = useSetAtom(vouchersAtom);
  const setArticles = useSetAtom(articlesAtom);
  const setCompanyInfo = useSetAtom(companyInfoAtom);
  const setPaymentConfig = useSetAtom(paymentConfigAtom);
  const setTierDiscounts = useSetAtom(tierDiscountsAtom);
  const setAddresses = useSetAtom(addressesAtom);
  const setSelectedAddressId = useSetAtom(selectedAddressIdAtom);
  const setOrders = useSetAtom(ordersAtom);
  const setLoyaltyHistory = useSetAtom(loyaltyHistoryAtom);
  const setNotifications = useSetAtom(notificationsAtom);
  const setBackendSynced = useSetAtom(backendSyncedAtom);

  // Silently read non-intrusive Zalo User ID (autoRequestPermission: false NEVER prompts popup)
  useEffect(() => {
    let active = true;
    getUserInfo({ autoRequestPermission: false })
      .then((res) => {
        if (!active || !res?.userInfo?.id) return;
        const realZid = String(res.userInfo.id).trim();
        if (realZid && realZid !== zaloId) {
          setZaloId(realZid);
        }
        // Only hydrate name/avatar silently if the user ALREADY granted scope.userInfo earlier
        if (res.userInfo.name) {
          setUser({
            name: res.userInfo.name,
            avatarUrl: res.userInfo.avatar || user.avatarUrl || "",
            avatarInitials: computeInitials(res.userInfo.name),
            zaloLoggedIn: true,
          });
        }
      })
      .catch(() => {
        // Outside Zalo WebView (e.g., desktop browser) -> ignore silently
      });
    return () => {
      active = false;
    };
  }, [setUser, setZaloId, user.avatarUrl, zaloId]);

  const syncNow = useCallback(async () => {
    try {
      const data = await fetchMiniAppBootstrap(
        customerId,
        user.phoneLinked ? user.phone : undefined,
        zaloId || undefined
      );
      if (!data) return;

      if (data.products?.length) setProducts(data.products);
      if (data.categories?.length) setCategories(data.categories);
      if (data.productTags?.length) setProductTags(data.productTags);
      if (Array.isArray(data.banners)) setBanners(data.banners);
      if (Array.isArray(data.vouchers)) setVouchers(data.vouchers);
      if (data.articles?.length) setArticles(data.articles);

      if (data.companyInfo && Object.keys(data.companyInfo).length > 0) {
        setCompanyInfo({
          ...NESPHAR_INFO,
          companyName: data.companyInfo.companyName || NESPHAR_INFO.companyName,
          shortName: data.companyInfo.shortName || NESPHAR_INFO.shortName,
          taxCode: data.companyInfo.taxCode || NESPHAR_INFO.taxCode,
          representative:
            data.companyInfo.representative || NESPHAR_INFO.representative,
          address: data.companyInfo.address || NESPHAR_INFO.address,
          hotline: data.companyInfo.hotline || NESPHAR_INFO.hotline,
          hotlineDisplay:
            data.companyInfo.hotlineDisplay || NESPHAR_INFO.hotlineDisplay,
          secondaryHotline:
            data.companyInfo.secondaryHotline || NESPHAR_INFO.secondaryHotline,
          email: data.companyInfo.email || NESPHAR_INFO.email,
          zaloOaId: data.companyInfo.zaloOaId || NESPHAR_INFO.zaloOaId,
          workingHours:
            data.companyInfo.workingHours || NESPHAR_INFO.workingHours,
        });
      }

      if (data.paymentConfig) {
        setPaymentConfig(data.paymentConfig);
      }

      if (data.tierDiscounts) {
        setTierDiscounts({
          retail: Number(data.tierDiscounts.retail ?? 0),
          clinic: Number(data.tierDiscounts.clinic ?? 8),
          pharmacy: Number(data.tierDiscounts.pharmacy ?? 12),
          distributor: Number(data.tierDiscounts.distributor ?? 18),
        });
      }

      if (data.customer) {
        if (data.customer.id !== customerId) {
          setCustomerId(data.customer.id);
        }
        setUser({
          name: data.customer.name,
          avatarUrl: data.customer.avatarUrl || user.avatarUrl || "",
          zaloLoggedIn:
            Boolean(data.customer.zaloLoggedIn) || Boolean(user.zaloLoggedIn),
          welcomeBonusClaimed:
            Boolean(data.customer.welcomeBonusClaimed) ||
            Boolean(user.welcomeBonusClaimed),
          phone: data.customer.phone,
          phoneLinked: data.customer.phoneLinked || user.phoneLinked,
          avatarInitials: computeInitials(data.customer.name),
          loyaltyPoints: data.customer.loyaltyPoints,
          customerTier: data.customer.customerTier,
          customDiscountPercent: data.customer.customDiscountPercent ?? null,
          businessName: data.customer.businessName,
        });
        setAddresses(data.addresses || []);
        const def =
          (data.addresses || []).find((a) => a.isDefault) || data.addresses?.[0];
        if (def) setSelectedAddressId(def.id);
        setOrders(data.orders || []);
        if (Array.isArray(data.loyaltyHistory)) {
          setLoyaltyHistory(data.loyaltyHistory);
        }
      } else {
        // Brand-new real visitor on live server -> clean empty personal state (never leak demo orders)
        setAddresses([]);
        setOrders([]);
        setLoyaltyHistory([]);
      }

      if (Array.isArray(data.notifications)) {
        setNotifications(data.notifications);
      }

      setBackendSynced(true);
    } catch {
      // Keep local fallback seamlessly
    }
  }, [
    customerId,
    zaloId,
    user.phone,
    user.phoneLinked,
    user.avatarUrl,
    user.zaloLoggedIn,
    user.welcomeBonusClaimed,
    setAddresses,
    setArticles,
    setBackendSynced,
    setBanners,
    setCategories,
    setProductTags,
    setCompanyInfo,
    setCustomerId,
    setLoyaltyHistory,
    setNotifications,
    setOrders,
    setPaymentConfig,
    setProducts,
    setSelectedAddressId,
    setTierDiscounts,
    setUser,
    setVouchers,
  ]);

  useEffect(() => {
    void syncNow();
  }, [syncNow, user.customerTier]);

  useEffect(() => {
    const onFocus = () => {
      void syncNow();
    };
    const onCustomRefresh = () => {
      void syncNow();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("nesphar:refresh-bootstrap", onCustomRefresh);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("nesphar:refresh-bootstrap", onCustomRefresh);
    };
  }, [syncNow]);

  return null;
};
