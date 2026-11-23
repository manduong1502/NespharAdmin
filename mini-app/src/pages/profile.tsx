import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAtom, useAtomValue } from "jotai";
import {
  ArrowRight,
  Award,
  CheckCircle2,
  ChevronRight,
  Clock,
  Edit3,
  Gift,
  Headset,
  Info,
  Layers,
  LogIn,
  LogOut,
  MapPin,
  Package,
  Phone,
  Share2,
  Shield,
  Star,
  TicketPercent,
  Truck,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";
import {
  companyInfoAtom,
  customerIdAtom,
  loyaltyHistoryAtom,
  ordersAtom,
  userProfileAtom,
  vouchersAtom,
  zaloIdAtom,
} from "@/state/store";
import { CUSTOMER_TIERS, formatVnd } from "@/utils/format";
import { CustomerTier } from "@/types";
import { BrandLogo } from "@/components/BrandLogo";
import { StoreQrSvg } from "@/components/StoreQrSvg";
import { ZaloPreviewCapsule } from "@/components/ZaloPreviewCapsule";
import { useAppActions } from "@/hooks/useAppActions";
import { updateMiniAppProfileApi } from "@/services/api";

const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const customerId = useAtomValue(customerIdAtom);
  const zaloId = useAtomValue(zaloIdAtom);
  const [user, setUser] = useAtom(userProfileAtom);
  const loyaltyHistory = useAtomValue(loyaltyHistoryAtom);
  const orders = useAtomValue(ordersAtom);
  const vouchers = useAtomValue(vouchersAtom);
  const companyInfo = useAtomValue(companyInfoAtom);
  const {
    shareContent,
    pinHomeShortcut,
    openSupportSheet,
    showToast,
    loginWithZalo,
    linkZaloPhone,
    logoutZalo,
  } = useAppActions();

  const [tierModalOpen, setTierModalOpen] = useState(false);
  const [pointsModalOpen, setPointsModalOpen] = useState(
    () => searchParams.get("openPoints") === "1"
  );
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editName, setEditName] = useState(user.name);
  const [editPhone, setEditPhone] = useState(user.phone);
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    if (searchParams.get("openPoints") === "1") {
      setPointsModalOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const tierInfo = CUSTOMER_TIERS[user.customerTier];

  const pendingCount = orders.filter((o) => o.status === "pending").length;
  const confirmedCount = orders.filter((o) => o.status === "confirmed").length;
  const shippingCount = orders.filter((o) => o.status === "shipping").length;
  const completedCount = orders.filter((o) => o.status === "completed").length;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;
    const initials = editName
      .trim()
      .split(/\s+/)
      .map((w) => w[0]?.toUpperCase() || "")
      .slice(0, 2)
      .join("");
    const nextName = editName.trim();
    const nextPhone = editPhone.trim() || user.phone;
    setUser({
      name: nextName,
      phone: nextPhone,
      avatarInitials: initials || "KH",
    });
    try {
      await updateMiniAppProfileApi({
        customerId,
        zaloId: zaloId || undefined,
        name: nextName,
        phone: nextPhone,
      });
    } catch {
      // local state kept
    }
    setEditModalOpen(false);
    showToast("Đã cập nhật hồ sơ cá nhân");
  };

  return (
    <div className="min-h-screen bg-[#F3F5FB] pb-28">
      {/* White Top Header matching Screenshot 8 & 9 */}
      <header className="sticky top-0 z-30 border-b border-[#DCE1F0] bg-white zmp-safe-top">
        <div className="flex h-[52px] items-center justify-between px-3.5">
          <h1 className="text-[19px] font-bold text-[#121833]">Tài khoản</h1>

          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Chỉnh sửa hồ sơ"
              onClick={() => {
                setEditName(user.name);
                setEditPhone(user.phone);
                setEditModalOpen(true);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E6E9FC] text-[#3E4095] hover:bg-[#DDE1FA]"
            >
              <Edit3 size={15} />
            </button>

            <button
              type="button"
              aria-label="Chia sẻ cửa hàng"
              onClick={() => shareContent(companyInfo.shortName)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E6E9FC] text-[#3E4095] hover:bg-[#DDE1FA]"
            >
              <Share2 size={15} />
            </button>

            <ZaloPreviewCapsule tone="on-light" />
          </div>
        </div>
      </header>

      <main className="space-y-3 p-3.5">
        {/* Pharma Emerald Membership Card (Screenshot 8 signature card) */}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#282A6E] via-[#3E4095] to-[#4f52b5] p-4 text-white">
          {/* Decorative geometric wave lines */}
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-4 -right-4 h-36 w-56 opacity-20"
            viewBox="0 0 240 140"
            fill="none"
          >
            <path
              d="M10 120C70 80 130 140 230 40"
              stroke="#FFFFFF"
              strokeWidth="2"
            />
            <path
              d="M10 132C75 92 135 152 235 52"
              stroke="#FFFFFF"
              strokeWidth="1.5"
            />
            <circle cx="195" cy="24" r="38" fill="#FFFFFF" fillOpacity="0.16" />
          </svg>

          <div className="relative z-10 flex items-start justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold tracking-wider text-[#DDE1FA]">
                THẺ THÀNH VIÊN NESPHAR
              </span>
              {user.zaloLoggedIn && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10.5px] font-bold text-white">
                  <CheckCircle2 size={11} />
                  <span>Đã kết nối Zalo</span>
                </span>
              )}
            </div>
            <BrandLogo size={36} variant="light-box" />
          </div>

          <div className="relative z-10 mt-3 flex items-center gap-3.5">
            {user.avatarUrl && !avatarFailed ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                onError={() => setAvatarFailed(true)}
                className="h-16 w-16 shrink-0 rounded-full border-2 border-white/85 bg-[#1E2059] object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-white/80 bg-[#1E2059] text-[19px] font-extrabold text-white">
                {user.avatarInitials}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-[17px] font-bold text-white">
                {user.name}
              </p>

              {user.zaloLoggedIn ? (
                user.phone ? (
                  <p className="tabular-nums mt-0.5 text-[13.5px] text-[#DDE1FA]">
                    SĐT Zalo: {user.phone}
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => void linkZaloPhone()}
                    className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-[11.5px] font-semibold text-white hover:bg-white/25"
                  >
                    <Phone size={11} />
                    <span>Liên kết SĐT nhận ưu đãi</span>
                  </button>
                )
              ) : (
                <p className="mt-0.5 text-[12.5px] text-[#DDE1FA]">
                  Đăng nhập Zalo để tích điểm & lưu lịch sử đơn
                </p>
              )}

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setTierModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#FEF3C7] px-3 py-0.5 text-[11.5px] font-bold text-[#92400E]"
                >
                  <Award size={13} className="text-[#D97706]" />
                  <span>{tierInfo.label}</span>
                </button>
              </div>
            </div>
          </div>

          {!user.zaloLoggedIn && (
            <button
              type="button"
              onClick={() => void loginWithZalo()}
              className="relative z-10 mt-3.5 flex w-full items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-[13.5px] font-extrabold text-[#282A6E] transition-colors hover:bg-[#EEF0FD]"
            >
              <LogIn size={16} />
              <span>
                {user.welcomeBonusClaimed
                  ? "Đăng nhập nhanh bằng Zalo"
                  : "Đăng nhập bằng Zalo · Tặng +50 điểm"}
              </span>
            </button>
          )}

          <div className="relative z-10 mt-3.5 flex items-center justify-between border-t border-white/15 pt-2.5">
            <button
              type="button"
              onClick={() => setTierModalOpen(true)}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#EEF0FD] hover:underline"
            >
              <span>Xem quyền lợi & Nhóm khách hàng</span>
              <ArrowRight size={14} />
            </button>

            {user.zaloLoggedIn && (
              <button
                type="button"
                onClick={logoutZalo}
                className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[11.5px] font-medium text-[#EEF0FD] hover:bg-white/20"
              >
                <LogOut size={12} />
                <span>Đăng xuất</span>
              </button>
            )}
          </div>
        </section>

        {/* Points Wallet & Vouchers 2-Column Row (Screenshot 8) */}
        <section className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => setPointsModalOpen(true)}
            className="flex items-center justify-between rounded-xl border border-[#DCE1F0] bg-white p-3 text-left transition-colors hover:border-[#9AA0E6]"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E6E9FC] text-[#3E4095]">
                <Wallet size={18} />
              </span>
              <div>
                <p className="text-[12.5px] font-semibold text-[#121833]">
                  Ví tích điểm
                </p>
                <p className="tabular-nums text-[14px] font-bold text-[#3E4095]">
                  {user.loyaltyPoints} điểm
                </p>
              </div>
            </div>
            <ChevronRight size={16} className="text-[#5A658A]" />
          </button>

          <button
            type="button"
            onClick={() => navigate("/vouchers")}
            className="flex items-center justify-between rounded-xl border border-[#DCE1F0] bg-white p-3 text-left transition-colors hover:border-[#9AA0E6]"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FEE2E2] text-[#D92D20]">
                <TicketPercent size={18} />
              </span>
              <div>
                <p className="text-[12.5px] font-semibold text-[#121833]">
                  Voucher của tôi
                </p>
                <p className="text-[12px] font-medium text-[#3E4095]">
                  Xem {vouchers.length} voucher
                </p>
              </div>
            </div>
            <ChevronRight size={16} className="text-[#5A658A]" />
          </button>
        </section>

        {/* Share, Address Book & Pharmacist Support Group (Screenshot 8 + Contract Item 7, 8) */}
        <section className="divide-y divide-[#EDF0F8] rounded-xl border border-[#DCE1F0] bg-white">
          <button
            type="button"
            onClick={() => shareContent(companyInfo.shortName)}
            className="flex w-full items-center justify-between px-3.5 py-3.5 text-left hover:bg-[#FAFBFF]"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EEF0FD] text-[#3E4095]">
                <UserPlus size={18} />
              </span>
              <div>
                <p className="text-[14px] font-semibold text-[#121833]">
                  Chia sẻ ứng dụng
                </p>
                <p className="mt-0.5 text-[12px] text-[#3E486B]">
                  Nhận điểm thưởng khi giới thiệu bạn bè quan tâm sức khỏe
                </p>
              </div>
            </div>
            <ChevronRight size={18} className="shrink-0 text-[#5A658A]" />
          </button>

          <button
            type="button"
            onClick={() => navigate("/addresses")}
            className="flex w-full items-center justify-between px-3.5 py-3.5 text-left hover:bg-[#FAFBFF]"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EEF0FD] text-[#3E4095]">
                <MapPin size={18} />
              </span>
              <div>
                <p className="text-[14px] font-semibold text-[#121833]">
                  Địa chỉ của tôi
                </p>
                <p className="mt-0.5 text-[12px] text-[#3E486B]">
                  Quản lý sổ địa chỉ nhận hàng cá nhân & nhà thuốc
                </p>
              </div>
            </div>
            <ChevronRight size={18} className="shrink-0 text-[#5A658A]" />
          </button>

          <button
            type="button"
            onClick={openSupportSheet}
            className="flex w-full items-center justify-between px-3.5 py-3.5 text-left hover:bg-[#FAFBFF]"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EEF0FD] text-[#3E4095]">
                <Headset size={18} />
              </span>
              <div>
                <p className="text-[14px] font-semibold text-[#121833]">
                  Hỗ trợ & Tư vấn Dược sĩ
                </p>
                <p className="mt-0.5 text-[12px] text-[#3E486B]">
                  Hotline {companyInfo.hotlineDisplay} • Chat Zalo OA • Gửi phản hồi
                </p>
              </div>
            </div>
            <ChevronRight size={18} className="shrink-0 text-[#5A658A]" />
          </button>
        </section>

        {/* Order Status Quick Strip (Screenshot 8) */}
        <section className="rounded-xl border border-[#DCE1F0] bg-white p-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-[14.5px] font-bold text-[#3E4095]">
              Đơn hàng
            </h2>
            <button
              type="button"
              onClick={() => navigate("/orders")}
              className="inline-flex items-center gap-0.5 text-[12.5px] font-medium text-[#3E486B]"
            >
              <span>Xem tất cả</span>
              <ChevronRight size={15} />
            </button>
          </div>

          <div className="mt-3.5 grid grid-cols-4 gap-2 text-center">
            {[
              {
                status: "pending",
                label: "Chờ xác nhận",
                count: pendingCount,
                Icon: Clock,
              },
              {
                status: "confirmed",
                label: "Đã xác nhận",
                count: confirmedCount,
                Icon: Package,
              },
              {
                status: "shipping",
                label: "Đang giao",
                count: shippingCount,
                Icon: Truck,
              },
              {
                status: "completed",
                label: "Hoàn thành",
                count: completedCount,
                Icon: Star,
              },
            ].map(({ status, label, count, Icon }) => (
              <button
                key={status}
                type="button"
                onClick={() => navigate(`/orders?status=${status}`)}
                className="flex flex-col items-center"
              >
                <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-[#F3F5FB] text-[#121833] hover:bg-[#E6E9FC] hover:text-[#3E4095]">
                  <Icon size={20} strokeWidth={1.85} />
                  {count > 0 && (
                    <span className="tabular-nums absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#D92D20] px-1 text-[10px] font-bold text-white">
                      {count}
                    </span>
                  )}
                </span>
                <span className="mt-1.5 text-[11.5px] font-medium leading-tight text-[#3E486B]">
                  {label}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Shortcut & Policies Group (Screenshot 9) */}
        <section className="divide-y divide-[#EDF0F8] rounded-xl border border-[#DCE1F0] bg-white">
          <button
            type="button"
            onClick={pinHomeShortcut}
            className="flex w-full items-center justify-between px-3.5 py-3.5 text-left hover:bg-[#FAFBFF]"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EEF0FD] text-[#3E4095]">
                <Layers size={18} />
              </span>
              <div>
                <p className="text-[14px] font-semibold text-[#121833]">
                  Tạo lối tắt ra Màn hình chính
                </p>
                <p className="mt-0.5 text-[12px] text-[#3E486B]">
                  Đưa Mini App NESPHAR ra màn hình chính điện thoại
                </p>
              </div>
            </div>
            <ChevronRight size={18} className="shrink-0 text-[#5A658A]" />
          </button>

          <button
            type="button"
            onClick={() => navigate("/policy/chinh-sach-bao-mat")}
            className="flex w-full items-center justify-between px-3.5 py-3.5 text-left hover:bg-[#FAFBFF]"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EEF0FD] text-[#3E4095]">
                <Shield size={18} />
              </span>
              <div>
                <p className="text-[14px] font-semibold text-[#121833]">
                  Chính sách bảo mật & Điều khoản
                </p>
                <p className="mt-0.5 text-[12px] text-[#3E486B]">
                  Bảo mật dữ liệu, đổi trả, vận chuyển & thanh toán
                </p>
              </div>
            </div>
            <ChevronRight size={18} className="shrink-0 text-[#5A658A]" />
          </button>
        </section>

        {/* App Version Info Card (Screenshot 9) */}
        <section className="rounded-xl border border-[#DCE1F0] bg-white p-3.5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF0FD] text-[#3E4095]">
              <Info size={17} />
            </span>
            <div>
              <h2 className="text-[14px] font-semibold text-[#121833]">
                Thông tin ứng dụng
              </h2>
              <p className="mt-0.5 text-[12px] leading-relaxed text-[#3E486B]">
                © {companyInfo.companyName} – MST: {companyInfo.taxCode}
              </p>
              <p className="tabular-nums text-[11.5px] text-[#5A658A]">
                Phiên bản: {companyInfo.appVersion}
              </p>
            </div>
          </div>
        </section>

        {/* Store QR Share Card (Screenshot 9 bottom card) */}
        <section className="rounded-2xl border border-[#DCE1F0] bg-white px-4 py-5 text-center">
          <h2 className="text-[15.5px] font-bold text-[#121833]">
            Chia sẻ cửa hàng của bạn
          </h2>

          <div className="my-4">
            <StoreQrSvg size={188} />
          </div>

          <p className="mx-auto max-w-[300px] text-[13px] leading-relaxed text-[#121833]">
            Mời bạn tham gia{" "}
            <span className="font-bold text-[#3E4095]">
              &ldquo;{companyInfo.shortName}&rdquo;
            </span>{" "}
            qua đường dẫn hoặc Quét mã QR để truy cập.
          </p>
        </section>
      </main>

      {/* Loyalty Points Wallet & History Modal */}
      {pointsModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ví tích điểm thành viên NESPHAR"
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#121536]/55"
          onClick={() => setPointsModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-[440px] flex-col rounded-t-2xl bg-white p-4 zmp-safe-bottom"
          >
            <div className="flex items-center justify-between border-b border-[#DCE1F0] pb-3">
              <div>
                <h2 className="text-[16px] font-bold text-[#121833]">
                  Ví tích điểm thành viên NESPHAR
                </h2>
                <p className="text-[12px] text-[#3E486B]">
                  Tích điểm tự động mỗi đơn · Đổi giảm tiền trực tiếp
                </p>
              </div>
              <button
                type="button"
                aria-label="Đóng"
                onClick={() => setPointsModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F3F5FB]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-3 overflow-y-auto pr-0.5">
              {/* Balance Hero Card */}
              <div className="rounded-2xl bg-gradient-to-r from-[#282A6E] to-[#3E4095] p-4 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[12px] font-medium text-[#DDE1FA]">
                      Số dư điểm khả dụng
                    </p>
                    <p className="tabular-nums mt-0.5 text-[26px] font-extrabold leading-tight">
                      {user.loyaltyPoints} điểm
                    </p>
                    <p className="tabular-nums mt-0.5 text-[12.5px] text-[#EEF0FD]">
                      Quy đổi ưu đãi:{" "}
                      <strong>{formatVnd(user.loyaltyPoints * 1000)}</strong>
                    </p>
                  </div>
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                    <Gift size={24} />
                  </span>
                </div>

                {!user.zaloLoggedIn ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPointsModalOpen(false);
                      void loginWithZalo();
                    }}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-white py-2.5 text-[13px] font-extrabold text-[#282A6E]"
                  >
                    <LogIn size={15} />
                    <span>Đăng nhập Zalo nhận ngay +50 điểm</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setPointsModalOpen(false);
                      navigate("/cart");
                    }}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-white py-2.5 text-[13px] font-extrabold text-[#282A6E]"
                  >
                    <span>Dùng điểm giảm giá tại Giỏ hàng</span>
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>

              {/* Earn & Redeem Rules */}
              <div className="mt-3 rounded-xl border border-[#DCE1F0] bg-[#FAFBFF] p-3 text-[12px] text-[#3E486B]">
                <p className="font-bold text-[#121833]">
                  Cơ chế Tích & Đổi điểm NESPHAR:
                </p>
                <ul className="mt-1.5 space-y-1">
                  <li>
                    • Đăng nhập thành viên Zalo lần đầu:{" "}
                    <strong className="text-[#3E4095]">+50 điểm</strong>
                  </li>
                  <li>
                    • Đặt hàng thành công:{" "}
                    <strong className="text-[#3E4095]">10.000đ = +1 điểm</strong>
                  </li>
                  <li>
                    • Đổi điểm khi thanh toán:{" "}
                    <strong className="text-[#3E4095]">1 điểm = 1.000đ</strong>{" "}
                    (giảm tối đa 50% giá trị đơn hàng)
                  </li>
                </ul>
              </div>

              {/* Loyalty Transaction History */}
              <div className="mt-3.5">
                <h3 className="text-[13.5px] font-bold text-[#121833]">
                  Lịch sử biến động điểm ({loyaltyHistory.length})
                </h3>
                {loyaltyHistory.length === 0 ? (
                  <div className="mt-2 rounded-xl border border-dashed border-[#DCE1F0] px-4 py-6 text-center text-[12.5px] text-[#5A658A]">
                    Chưa có giao dịch điểm thưởng. Đăng nhập Zalo và đặt đơn để bắt đầu tích lũy điểm!
                  </div>
                ) : (
                  <div className="mt-2 divide-y divide-[#EDF0F8] rounded-xl border border-[#DCE1F0] bg-white">
                    {loyaltyHistory.map((tx) => {
                      const isPlus = tx.pointsChange >= 0;
                      return (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between gap-2.5 px-3 py-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-[12.5px] font-semibold text-[#121833]">
                              {tx.title}
                            </p>
                            <p className="tabular-nums mt-0.5 text-[11px] text-[#5A658A]">
                              {tx.createdAt} • Số dư: {tx.balanceAfter} điểm
                            </p>
                          </div>
                          <span
                            className={`tabular-nums shrink-0 rounded-lg px-2 py-1 text-[12.5px] font-extrabold ${
                              isPlus
                                ? "bg-[#EEF0FD] text-[#3E4095]"
                                : "bg-[#FEE2E2] text-[#B42318]"
                            }`}
                          >
                            {isPlus ? `+${tx.pointsChange}` : tx.pointsChange} điểm
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customer Tier Switcher Modal (Demonstrating Contract Item 3: Automatic Price by Customer Group) */}
      {tierModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Quyền lợi & Phân nhóm khách hàng"
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#121536]/50"
          onClick={() => setTierModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[440px] rounded-t-2xl bg-white p-4 zmp-safe-bottom"
          >
            <div className="flex items-center justify-between border-b border-[#DCE1F0] pb-3">
              <div>
                <h2 className="text-[16px] font-bold text-[#121833]">
                  Quyền lợi & Nhóm khách hàng
                </h2>
                <p className="text-[12px] text-[#3E486B]">
                  Giá bán tự động hiển thị theo phân nhóm CRM trên Web Admin
                </p>
              </div>
              <button
                type="button"
                aria-label="Đóng"
                onClick={() => setTierModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F3F5FB]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {(Object.keys(CUSTOMER_TIERS) as CustomerTier[]).map((tierKey) => {
                const info = CUSTOMER_TIERS[tierKey];
                const active = user.customerTier === tierKey;
                return (
                  <button
                    key={tierKey}
                    type="button"
                    onClick={async () => {
                      setUser({ customerTier: tierKey });
                      setTierModalOpen(false);
                      showToast(`Đã chuyển chế độ hiển thị giá: ${info.label}`);
                      try {
                        await updateMiniAppProfileApi({
                          customerId,
                          customerTier: tierKey,
                        });
                        window.dispatchEvent(new Event("nesphar:refresh-bootstrap"));
                      } catch {
                        // local fallback
                      }
                    }}
                    className={`flex w-full items-start justify-between gap-3 rounded-xl border p-3 text-left ${
                      active
                        ? "border-[#3E4095] bg-[#EEF0FD]"
                        : "border-[#DCE1F0] bg-[#FAFBFF]"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[13.5px] font-bold text-[#121833]">
                          {info.label}
                        </span>
                        {info.discountPercent > 0 && (
                          <span className="rounded bg-[#3E4095] px-1.5 py-0.5 text-[10.5px] font-bold text-white">
                            -{info.discountPercent}% toàn sàn
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[12px] text-[#3E486B]">
                        {info.description}
                      </p>
                    </div>
                    {active && (
                      <CheckCircle2
                        size={19}
                        className="mt-0.5 shrink-0 text-[#3E4095]"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {editModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Cập nhật hồ sơ cá nhân"
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#121536]/50"
          onClick={() => setEditModalOpen(false)}
        >
          <form
            onSubmit={handleSaveProfile}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[440px] rounded-t-2xl bg-white p-4 zmp-safe-bottom"
          >
            <div className="flex items-center justify-between border-b border-[#DCE1F0] pb-3">
              <h2 className="text-[16px] font-bold text-[#121833]">
                Cập nhật hồ sơ cá nhân
              </h2>
              <button
                type="button"
                aria-label="Đóng"
                onClick={() => setEditModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F3F5FB]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-3.5 space-y-3">
              <div>
                <label className="block text-[12.5px] font-medium text-[#121833]">
                  Họ và tên hiển thị
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#DCE1F0] bg-[#FAFBFF] px-3 py-2 text-[14px] text-[#121833]"
                />
              </div>
              <div>
                <label className="block text-[12.5px] font-medium text-[#121833]">
                  Số điện thoại liên hệ
                </label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#DCE1F0] bg-[#FAFBFF] px-3 py-2 text-[14px] text-[#121833]"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-xl bg-[#3E4095] py-2.5 text-[14px] font-bold text-white hover:bg-[#31337A]"
              >
                Lưu thay đổi
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
