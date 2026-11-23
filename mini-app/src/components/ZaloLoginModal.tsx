import React, { useEffect, useState } from "react";
import { useAtom } from "jotai";
import { Award, CheckCircle2, Phone, ShieldCheck, X } from "lucide-react";
import {
  addressesAtom,
  customerIdAtom,
  loyaltyHistoryAtom,
  notificationsAtom,
  ordersAtom,
  selectedAddressIdAtom,
  userProfileAtom,
  zaloIdAtom,
  zaloLoginModalAtom,
} from "@/state/store";
import { loginWithZaloApi } from "@/services/api";
import { useAppActions } from "@/hooks/useAppActions";

function makeInitials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "KH";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

export const ZaloLoginModal: React.FC = () => {
  const [modal, setModal] = useAtom(zaloLoginModalAtom);
  const [customerId, setCustomerId] = useAtom(customerIdAtom);
  const [zaloId, setZaloId] = useAtom(zaloIdAtom);
  const [user, setUser] = useAtom(userProfileAtom);
  const [addresses, setAddresses] = useAtom(addressesAtom);
  const [, setSelectedAddressId] = useAtom(selectedAddressIdAtom);
  const [, setOrders] = useAtom(ordersAtom);
  const [loyaltyHistory, setLoyaltyHistory] = useAtom(loyaltyHistoryAtom);
  const [notifications, setNotifications] = useAtom(notificationsAtom);
  const { showToast } = useAppActions();

  const [nameInput, setNameInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (modal.open) {
      setNameInput(user.name === "Khách hàng Zalo" ? "" : user.name);
      setPhoneInput(user.phone || "");
    }
  }, [modal.open, user.name, user.phone]);

  if (!modal.open) return null;

  const isPhoneOnly = modal.mode === "phone";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phoneInput.replace(/\D/g, "");
    const finalPhone = cleanPhone.startsWith("84") && cleanPhone.length >= 11
      ? `0${cleanPhone.slice(2)}`
      : cleanPhone;
    const finalName =
      (isPhoneOnly ? user.name : nameInput.trim()) || "Thành viên Zalo";

    if (finalPhone.length < 9 || finalPhone.length > 12) {
      showToast("Vui lòng nhập số điện thoại Zalo hợp lệ (10 số)");
      return;
    }

    setSubmitting(true);
    const effectiveZaloId = zaloId || `zmp-phone-${finalPhone}`;

    try {
      const res = await loginWithZaloApi({
        customerId,
        zaloId: effectiveZaloId,
        name: finalName,
        avatarUrl: user.avatarUrl || "",
        phone: finalPhone,
      });

      if (res?.customer) {
        setCustomerId(res.customer.id);
        if (res.customer.zaloId) setZaloId(res.customer.zaloId);
        setUser({
          name: res.customer.name,
          avatarUrl: res.customer.avatarUrl || user.avatarUrl || "",
          avatarInitials: makeInitials(res.customer.name),
          zaloLoggedIn: true,
          welcomeBonusClaimed: Boolean(res.customer.welcomeBonusClaimed),
          phone: res.customer.phone,
          phoneLinked: true,
          loyaltyPoints: res.customer.loyaltyPoints,
          customerTier: res.customer.customerTier,
          customDiscountPercent: res.customer.customDiscountPercent ?? null,
          businessName: res.customer.businessName,
        });
        if (res.addresses?.length) {
          setAddresses(res.addresses);
          const def = res.addresses.find((a) => a.isDefault) || res.addresses[0];
          if (def) setSelectedAddressId(def.id);
        }
        if (res.orders) setOrders(res.orders);
        if (res.loyaltyHistory) setLoyaltyHistory(res.loyaltyHistory);
        window.dispatchEvent(new Event("nesphar:refresh-bootstrap"));
        setSubmitting(false);
        setModal({ open: false, mode: "login" });
        showToast(
          res.welcomeBonusGranted > 0
            ? `Đăng nhập Zalo thành công! Tặng +${res.welcomeBonusGranted} điểm chào mừng`
            : `Chào mừng ${res.customer.name} quay lại NESPHAR!`
        );
        return;
      }
    } catch {
      // Offline / Cloud Preview fallback below
    }

    const bonus = user.welcomeBonusClaimed ? 0 : 50;
    const nextBalance = user.loyaltyPoints + bonus;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
      now.getDate()
    )} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    setZaloId(effectiveZaloId);
    setUser({
      name: finalName,
      avatarInitials: makeInitials(finalName),
      zaloLoggedIn: true,
      welcomeBonusClaimed: true,
      phone: finalPhone,
      phoneLinked: true,
      loyaltyPoints: nextBalance,
    });

    if (bonus > 0) {
      setLoyaltyHistory([
        {
          id: `ltx-local-${Date.now()}`,
          type: "welcome",
          pointsChange: bonus,
          balanceAfter: nextBalance,
          title: "Thưởng chào mừng đăng nhập thành viên Zalo lần đầu",
          createdAt: ts,
        },
        ...loyaltyHistory,
      ]);
      setNotifications([
        {
          id: `noti-welcome-${Date.now()}`,
          type: "promo",
          title: "Tặng +50 điểm thành viên Zalo NESPHAR!",
          body: "Bạn vừa nhận +50 điểm tích lũy (= 50.000đ ưu đãi). Có thể dùng giảm giá trực tiếp khi thanh toán.",
          createdAt: "Vừa xong",
          read: false,
          targetLink: "/profile?openPoints=1",
        },
        ...notifications,
      ]);
    }

    if (addresses.length === 0) {
      const defId = `addr-${Date.now()}`;
      setAddresses([
        {
          id: defId,
          recipientName: finalName,
          phone: finalPhone,
          street: "Số 90 Đường Hà Hoàng",
          ward: "Phường Trần Phú",
          district: "TP. Hà Tĩnh",
          province: "Tỉnh Hà Tĩnh",
          tag: "Nhà riêng",
          isDefault: true,
        },
      ]);
      setSelectedAddressId(defId);
    }

    setSubmitting(false);
    setModal({ open: false, mode: "login" });
    showToast(
      bonus > 0
        ? `Đăng nhập Zalo thành công! Tặng +${bonus} điểm chào mừng`
        : `Đã liên kết SĐT Zalo ${finalPhone} thành công!`
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Đăng nhập thành viên Zalo NESPHAR"
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#121536]/55"
      onClick={() => setModal({ open: false, mode: "login" })}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] rounded-t-2xl bg-white p-4 zmp-safe-bottom"
      >
        <div className="flex items-start justify-between border-b border-[#DCE1F0] pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#3E4095] text-[13px] font-extrabold text-white">
              Zalo
            </span>
            <div>
              <h2 className="text-[16px] font-bold text-[#121833]">
                {isPhoneOnly
                  ? "Xác nhận SĐT nhận tích điểm"
                  : "Đăng nhập Thành viên Zalo"}
              </h2>
              <p className="text-[12px] text-[#3E486B]">
                Đồng bộ điểm thưởng & hạng khách hàng NESPHAR
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Đóng"
            onClick={() => setModal({ open: false, mode: "login" })}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F3F5FB] text-[#121833]"
          >
            <X size={18} />
          </button>
        </div>

        {!user.welcomeBonusClaimed && (
          <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-[#C5CAFA] bg-[#EEF0FD] px-3 py-2.5">
            <Award size={18} className="shrink-0 text-[#3E4095]" />
            <p className="text-[12px] font-medium text-[#1E2059]">
              Thành viên đăng nhập lần đầu được tặng ngay{" "}
              <strong className="font-extrabold text-[#3E4095]">
                +50 điểm (= 50.000đ)
              </strong>{" "}
              vào Ví tích điểm!
            </p>
          </div>
        )}

        <div className="mt-3.5 space-y-3">
          {!isPhoneOnly && (
            <div>
              <label className="block text-[12.5px] font-semibold text-[#121833]">
                Họ tên hiển thị trên Zalo
              </label>
              <input
                type="text"
                required
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="VD: Nguyễn Văn Minh / Nhà thuốc Minh Tâm"
                className="mt-1 w-full rounded-xl border border-[#DCE1F0] bg-[#FAFBFF] px-3 py-2.5 text-[14px] text-[#121833] placeholder:text-[#5A658A]"
              />
            </div>
          )}

          <div>
            <label className="block text-[12.5px] font-semibold text-[#121833]">
              Số điện thoại tài khoản Zalo
            </label>
            <div className="relative mt-1">
              <Phone
                size={15}
                className="pointer-events-none absolute left-3 top-3 text-[#5A658A]"
              />
              <input
                type="tel"
                required
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="Nhập SĐT Zalo (VD: 0912345678)"
                className="w-full rounded-xl border border-[#DCE1F0] bg-[#FAFBFF] py-2.5 pl-9 pr-3 text-[14px] text-[#121833] placeholder:text-[#5A658A]"
              />
            </div>
            <p className="mt-1 flex items-center gap-1 text-[11px] text-[#5A658A]">
              <ShieldCheck size={13} className="shrink-0 text-[#3E4095]" />
              <span>
                Dùng để tự động cộng điểm mỗi đơn hàng & đối chiếu bảng giá sỉ Nhà thuốc GPP.
              </span>
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#3E4095] py-3 text-[14px] font-bold text-white hover:bg-[#31337A] disabled:opacity-50"
          >
            <CheckCircle2 size={17} />
            <span>
              {submitting
                ? "Đang đồng bộ tài khoản..."
                : isPhoneOnly
                  ? "Liên kết SĐT & Lưu điểm thưởng"
                  : user.welcomeBonusClaimed
                    ? "Đăng nhập Zalo ngay"
                    : "Đăng nhập Zalo · Nhận +50 điểm"}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
};
