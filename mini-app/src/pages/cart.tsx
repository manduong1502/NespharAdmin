import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAtom, useAtomValue } from "jotai";
import {
  ChevronLeft,
  ChevronRight,
  LogIn,
  Minus,
  Plus,
  ShoppingBag,
  TicketPercent,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import {
  cartAtom,
  cartSummaryAtom,
  selectedVoucherCodeAtom,
  useLoyaltyPointsAtom,
  userProfileAtom,
  vouchersAtom,
} from "@/state/store";
import { formatVnd } from "@/utils/format";
import { useAppActions } from "@/hooks/useAppActions";
import { ZaloPreviewCapsule } from "@/components/ZaloPreviewCapsule";

const CartPage: React.FC = () => {
  const navigate = useNavigate();
  const [cart, setCart] = useAtom(cartAtom);
  const [voucherCode, setVoucherCode] = useAtom(selectedVoucherCodeAtom);
  const [usePoints, setUsePoints] = useAtom(useLoyaltyPointsAtom);
  const user = useAtomValue(userProfileAtom);
  const vouchers = useAtomValue(vouchersAtom);
  const summary = useAtomValue(cartSummaryAtom);
  const { showToast, loginWithZalo } = useAppActions();

  const [voucherDrawerOpen, setVoucherDrawerOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");

  const allChecked =
    summary.detailedItems.length > 0 &&
    summary.detailedItems.every((i) => i.checked);

  const toggleAll = (checked: boolean) => {
    setCart(cart.map((item) => ({ ...item, checked })));
  };

  const toggleOne = (productId: string, unitOptionId: string) => {
    setCart(
      cart.map((item) =>
        item.productId === productId && item.unitOptionId === unitOptionId
          ? { ...item, checked: !item.checked }
          : item
      )
    );
  };

  const changeQty = (productId: string, unitOptionId: string, delta: number) => {
    setCart(
      cart
        .map((item) => {
          if (item.productId === productId && item.unitOptionId === unitOptionId) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter(Boolean) as typeof cart
    );
  };

  const removeItem = (productId: string, unitOptionId: string) => {
    setCart(
      cart.filter(
        (item) =>
          !(item.productId === productId && item.unitOptionId === unitOptionId)
      )
    );
    showToast("Đã xóa sản phẩm khỏi giỏ hàng");
  };

  const handleApplyManualCode = () => {
    const clean = manualCode.trim().toUpperCase();
    const found = vouchers.find((v) => v.code === clean);
    if (!found) {
      showToast("Mã ưu đãi không tồn tại hoặc đã hết hạn");
      return;
    }
    if (summary.subtotal < found.minOrderValue) {
      showToast(
        `Đơn tối thiểu ${formatVnd(found.minOrderValue)} để dùng mã ${found.code}`
      );
      return;
    }
    setVoucherCode(found.code);
    setVoucherDrawerOpen(false);
    setManualCode("");
    showToast(`Đã áp dụng mã ${found.code}`);
  };

  return (
    <div className="min-h-screen bg-[#F3F5FB] pb-36">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#3E4095] text-white zmp-safe-top">
        <div className="flex h-[52px] items-center justify-between px-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Quay lại"
              onClick={() => navigate(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/15"
            >
              <ChevronLeft size={22} />
            </button>
            <h1 className="text-[17px] font-bold">
              Giỏ hàng ({summary.detailedItems.length})
            </h1>
          </div>
          <ZaloPreviewCapsule tone="on-dark" />
        </div>
      </header>

      {summary.detailedItems.length === 0 ? (
        <div className="mx-3.5 mt-10 flex flex-col items-center rounded-2xl border border-[#DCE1F0] bg-white px-6 py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#EEF0FD] text-[#3E4095]">
            <ShoppingBag size={30} />
          </div>
          <h2 className="mt-3 text-[16px] font-bold text-[#121833]">
            Giỏ hàng của bạn đang trống
          </h2>
          <p className="mt-1 text-[13px] text-[#3E486B]">
            Khám phá các sản phẩm bảo vệ sức khỏe & vật tư y tế chính hãng từ NESPHAR.
          </p>
          <button
            type="button"
            onClick={() => navigate("/categories")}
            className="mt-5 rounded-full bg-[#3E4095] px-6 py-2.5 text-[13.5px] font-semibold text-white hover:bg-[#31337A]"
          >
            Xem danh mục sản phẩm
          </button>
        </div>
      ) : (
        <main className="space-y-3 p-3.5">
          {/* Select All Strip */}
          <div className="flex items-center justify-between rounded-xl border border-[#DCE1F0] bg-white px-3.5 py-2.5">
            <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px] font-medium text-[#121833]">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={(e) => toggleAll(e.target.checked)}
                className="h-4 w-4 accent-[#3E4095]"
              />
              <span>Chọn tất cả ({summary.detailedItems.length} sản phẩm)</span>
            </label>

            {summary.subtotal >= 250000 ? (
              <span className="text-[11.5px] font-semibold text-[#3E4095]">
                Đủ điều kiện Miễn phí giao hàng
              </span>
            ) : (
              <span className="tabular-nums text-[11.5px] text-[#3E486B]">
                Mua thêm {formatVnd(250000 - summary.subtotal)} để Freeship
              </span>
            )}
          </div>

          {/* Cart Items */}
          <div className="space-y-2.5">
            {summary.detailedItems.map((item) => (
              <div
                key={`${item.productId}-${item.unitOptionId}`}
                className="flex gap-2.5 rounded-xl border border-[#DCE1F0] bg-white p-3"
              >
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => toggleOne(item.productId, item.unitOptionId)}
                  aria-label={`Chọn ${item.product.name}`}
                  className="mt-7 h-4 w-4 shrink-0 accent-[#3E4095]"
                />

                <img
                  src={item.product.images[0]}
                  alt={item.product.name}
                  onClick={() => navigate(`/product/${item.product.id}`)}
                  className="h-20 w-20 shrink-0 cursor-pointer rounded-lg border border-[#EDF0F8] object-cover"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-1">
                    <h2
                      onClick={() => navigate(`/product/${item.product.id}`)}
                      className="line-clamp-2 cursor-pointer text-[13.5px] font-semibold leading-snug text-[#121833]"
                    >
                      {item.product.sku} - {item.product.name}
                    </h2>
                    <button
                      type="button"
                      aria-label="Xóa sản phẩm"
                      onClick={() =>
                        removeItem(item.productId, item.unitOptionId)
                      }
                      className="p-1 text-[#5A658A] hover:text-[#D92D20]"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  <p className="mt-1 text-[11.5px] text-[#5A658A]">
                    Quy cách: {item.unitOpt.specificationLabel}
                  </p>

                  <div className="mt-2.5 flex items-center justify-between">
                    <div>
                      <span className="tabular-nums text-[14.5px] font-bold text-[#3E4095]">
                        {formatVnd(item.unitPrice)}
                      </span>
                      {item.originalUnitPrice > item.unitPrice && (
                        <span className="tabular-nums ml-1.5 text-[11.5px] text-[#5A658A] line-through">
                          {formatVnd(item.originalUnitPrice)}
                        </span>
                      )}
                    </div>

                    <div className="inline-flex items-center rounded-lg border border-[#DCE1F0] bg-[#FAFBFF]">
                      <button
                        type="button"
                        aria-label="Giảm số lượng"
                        onClick={() =>
                          changeQty(item.productId, item.unitOptionId, -1)
                        }
                        className="flex h-7 w-7 items-center justify-center text-[#121833] hover:bg-[#E6E9FC]"
                      >
                        <Minus size={13} />
                      </button>
                      <span className="tabular-nums min-w-[28px] text-center text-[13px] font-semibold text-[#121833]">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label="Tăng số lượng"
                        onClick={() =>
                          changeQty(item.productId, item.unitOptionId, 1)
                        }
                        className="flex h-7 w-7 items-center justify-center text-[#121833] hover:bg-[#E6E9FC]"
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Voucher Selector Card (Contract Item 4) */}
          <button
            type="button"
            onClick={() => setVoucherDrawerOpen(true)}
            className="flex w-full items-center justify-between rounded-xl border border-[#DCE1F0] bg-white px-3.5 py-3 text-left"
          >
            <div className="flex items-center gap-2.5">
              <TicketPercent size={19} className="text-[#3E4095]" />
              <div>
                <p className="text-[13.5px] font-semibold text-[#121833]">
                  Mã ưu đãi / Chiết khấu NESPHAR
                </p>
                <p className="text-[12px] text-[#3E4095]">
                  {summary.appliedVoucher
                    ? `Đang áp dụng ${summary.appliedVoucher.code} (-${formatVnd(
                        summary.voucherDiscount
                      )})`
                    : "Chọn hoặc nhập mã giảm giá"}
                </p>
              </div>
            </div>
            <ChevronRight size={18} className="text-[#5A658A]" />
          </button>

          {/* Zalo Login & Loyalty Points Redemption Card */}
          <div className="rounded-xl border border-[#DCE1F0] bg-white px-3.5 py-3">
            {user.zaloLoggedIn ? (
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5">
                  <Wallet size={19} className="shrink-0 text-[#3E4095]" />
                  <div>
                    <p className="text-[13.5px] font-semibold text-[#121833]">
                      Dùng điểm tích lũy ({user.loyaltyPoints} điểm)
                    </p>
                    <p className="text-[12px] text-[#3E486B]">
                      {summary.maxRedeemablePoints > 0
                        ? `Đổi ${summary.maxRedeemablePoints} điểm giảm ngay ${formatVnd(
                            summary.maxRedeemablePoints * 1000
                          )}`
                        : "Đặt hàng để tích thêm điểm thưởng (10.000đ = +1 điểm)"}
                    </p>
                  </div>
                </div>
                {summary.maxRedeemablePoints > 0 && (
                  <input
                    type="checkbox"
                    aria-label="Sử dụng điểm tích lũy"
                    checked={usePoints}
                    onChange={(e) => setUsePoints(e.target.checked)}
                    className="h-5 w-5 shrink-0 accent-[#3E4095]"
                  />
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Wallet size={19} className="shrink-0 text-[#3E4095]" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-[#121833]">
                      Đăng nhập Zalo nhận +50 điểm (= 50.000đ)
                    </p>
                    <p className="truncate text-[11.5px] text-[#3E486B]">
                      Và tích thêm +{summary.estimatedEarnedPoints} điểm cho đơn này
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void loginWithZalo()}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#3E4095] px-2.5 py-1.5 text-[11.5px] font-bold text-white"
                >
                  <LogIn size={13} />
                  <span>Đăng nhập</span>
                </button>
              </div>
            )}
          </div>

          {/* Price Breakdown */}
          <div className="space-y-2 rounded-xl border border-[#DCE1F0] bg-white p-3.5 text-[13.5px]">
            <div className="flex justify-between text-[#3E486B]">
              <span>Tạm tính ({summary.checkedItems.length} món)</span>
              <span className="tabular-nums font-medium text-[#121833]">
                {formatVnd(summary.subtotal)}
              </span>
            </div>
            <div className="flex justify-between text-[#3E486B]">
              <span>Chiết khấu Voucher</span>
              <span className="tabular-nums font-medium text-[#3E4095]">
                -{formatVnd(summary.voucherDiscount)}
              </span>
            </div>
            {summary.pointsDiscount > 0 && (
              <div className="flex justify-between text-[#3E486B]">
                <span>Đổi {summary.redeemedPoints} điểm thành viên</span>
                <span className="tabular-nums font-semibold text-[#3E4095]">
                  -{formatVnd(summary.pointsDiscount)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-[#3E486B]">
              <span>Phí vận chuyển dự kiến</span>
              <span className="tabular-nums font-medium text-[#121833]">
                {summary.shippingFee === 0
                  ? "Miễn phí"
                  : formatVnd(summary.shippingFee)}
              </span>
            </div>
            <div className="flex justify-between border-t border-[#EDF0F8] pt-2.5 text-[15px] font-bold text-[#121833]">
              <span>Tổng thanh toán</span>
              <span className="tabular-nums text-[17px] text-[#3E4095]">
                {formatVnd(summary.total)}
              </span>
            </div>
            {summary.estimatedEarnedPoints > 0 && (
              <div className="flex justify-between text-[12px] font-medium text-[#3E4095]">
                <span>Điểm tích lũy nhận sau đơn này</span>
                <span className="tabular-nums font-bold">
                  +{summary.estimatedEarnedPoints} điểm
                </span>
              </div>
            )}
          </div>
        </main>
      )}

      {/* Sticky Checkout Bar */}
      {summary.detailedItems.length > 0 && (
        <div className="fixed bottom-0 left-1/2 z-40 w-full max-w-[440px] -translate-x-1/2 border-t border-[#DCE1F0] bg-white px-3.5 py-2.5 zmp-safe-bottom">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11.5px] text-[#3E486B]">Tổng cộng:</p>
              <p className="tabular-nums text-[18px] font-extrabold text-[#3E4095]">
                {formatVnd(summary.total)}
              </p>
            </div>

            <button
              type="button"
              disabled={summary.checkedItems.length === 0}
              onClick={() => navigate("/checkout")}
              className="rounded-xl bg-[#3E4095] px-6 py-3 text-[14.5px] font-bold text-white hover:bg-[#31337A] disabled:opacity-45"
            >
              Mua hàng ({summary.checkedItems.length})
            </button>
          </div>
        </div>
      )}

      {/* Voucher Drawer */}
      {voucherDrawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Chọn mã ưu đãi"
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#121536]/50"
          onClick={() => setVoucherDrawerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[440px] rounded-t-2xl bg-white p-4 zmp-safe-bottom"
          >
            <div className="flex items-center justify-between border-b border-[#DCE1F0] pb-3">
              <h2 className="text-[16px] font-bold text-[#121833]">
                Chọn Voucher NESPHAR
              </h2>
              <button
                type="button"
                aria-label="Đóng"
                onClick={() => setVoucherDrawerOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F3F5FB]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Nhập mã ưu đãi (VD: NESPHAR30)"
                className="flex-1 rounded-xl border border-[#DCE1F0] bg-[#FAFBFF] px-3 py-2 text-[13.5px] uppercase text-[#121833] placeholder:normal-case placeholder:text-[#5A658A]"
              />
              <button
                type="button"
                onClick={handleApplyManualCode}
                className="rounded-xl bg-[#3E4095] px-4 py-2 text-[13px] font-semibold text-white"
              >
                Áp dụng
              </button>
            </div>

            <div className="mt-3 max-h-[52vh] space-y-2.5 overflow-y-auto pr-0.5">
              {vouchers.map((v) => {
                const eligible = summary.subtotal >= v.minOrderValue;
                const selected = voucherCode === v.code;
                return (
                  <div
                    key={v.id}
                    className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${
                      selected
                        ? "border-[#3E4095] bg-[#EEF0FD]"
                        : "border-[#DCE1F0] bg-white"
                    } ${!eligible ? "opacity-60" : ""}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-[#3E4095] px-2 py-0.5 text-[11px] font-bold text-white">
                          {v.code}
                        </span>
                        <span className="truncate text-[13.5px] font-bold text-[#121833]">
                          {v.title}
                        </span>
                      </div>
                      <p className="mt-1 text-[12px] text-[#3E486B]">
                        {v.description}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#5A658A]">
                        Đơn tối thiểu {formatVnd(v.minOrderValue)} • HSD: {v.expiryDate}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={!eligible}
                      onClick={() => {
                        setVoucherCode(selected ? null : v.code);
                        setVoucherDrawerOpen(false);
                      }}
                      className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-semibold ${
                        selected
                          ? "border border-[#3E4095] bg-white text-[#3E4095]"
                          : "bg-[#3E4095] text-white disabled:bg-[#BEC4DE]"
                      }`}
                    >
                      {selected ? "Bỏ chọn" : "Dùng ngay"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CartPage;
