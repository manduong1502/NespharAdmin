import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAtom, useAtomValue } from "jotai";
import {
  Award,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  LogIn,
  MapPin,
  PhoneCall,
  QrCode,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import {
  addressesAtom,
  cartAtom,
  cartSummaryAtom,
  customerIdAtom,
  loyaltyHistoryAtom,
  notificationsAtom,
  ordersAtom,
  paymentConfigAtom,
  selectedAddressIdAtom,
  useLoyaltyPointsAtom,
  userProfileAtom,
  zaloIdAtom,
} from "@/state/store";
import { Order } from "@/types";
import { formatVnd } from "@/utils/format";
import { useAppActions } from "@/hooks/useAppActions";
import {
  ApiBusinessError,
  createMiniAppOrderApi,
  IS_LIVE_BACKEND,
} from "@/services/api";
import { ZaloPreviewCapsule } from "@/components/ZaloPreviewCapsule";

const CheckoutPage: React.FC = () => {
  const navigate = useNavigate();
  const [customerId, setCustomerId] = useAtom(customerIdAtom);
  const zaloId = useAtomValue(zaloIdAtom);
  const paymentConfig = useAtomValue(paymentConfigAtom);
  const [user, setUser] = useAtom(userProfileAtom);
  const [loyaltyHistory, setLoyaltyHistory] = useAtom(loyaltyHistoryAtom);
  const [usePoints, setUsePoints] = useAtom(useLoyaltyPointsAtom);
  const addresses = useAtomValue(addressesAtom);
  const selectedAddressId = useAtomValue(selectedAddressIdAtom);
  const [cart, setCart] = useAtom(cartAtom);
  const summary = useAtomValue(cartSummaryAtom);
  const [orders, setOrders] = useAtom(ordersAtom);
  const [notifications, setNotifications] = useAtom(notificationsAtom);
  const { showToast, loginWithZalo, linkZaloPhone } = useAppActions();

  const [paymentMethod, setPaymentMethod] = useState<"cod" | "vietqr" | "zalopay">("cod");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const activeAddress =
    addresses.find((a) => a.id === selectedAddressId) ||
    addresses.find((a) => a.isDefault) ||
    addresses[0];

  // Zalo User Intent compliant phone authorization: ONLY triggered when user taps button during checkout
  const handleLinkZaloPhone = async () => {
    if (!user.zaloLoggedIn) {
      await loginWithZalo();
      return;
    }
    await linkZaloPhone(activeAddress?.phone);
  };

  const handlePlaceOrder = async () => {
    if (!activeAddress) {
      showToast("Vui lòng thêm địa chỉ nhận hàng trước khi đặt đơn");
      navigate("/addresses");
      return;
    }
    if (summary.checkedItems.length === 0) {
      showToast("Chưa có sản phẩm nào được chọn để đặt hàng");
      navigate("/cart");
      return;
    }

    setSubmitting(true);

    try {
      const apiRes = await createMiniAppOrderApi({
        customerId,
        zaloId: zaloId || undefined,
        items: summary.checkedItems.map((ci) => ({
          productId: ci.product.id,
          unitOptionId: ci.unitOpt.id,
          unitName: ci.unitOpt.unitName,
          unitPrice: ci.unitPrice,
          quantity: ci.quantity,
        })),
        address: activeAddress,
        voucherCode: summary.appliedVoucher?.code,
        redeemPoints: summary.redeemedPoints,
        paymentMethod,
        note: note.trim() || undefined,
        customerTier: user.customerTier,
      });

      if (apiRes) {
        if (apiRes.customerId && apiRes.customerId !== customerId) {
          setCustomerId(apiRes.customerId);
        }
        setOrders([apiRes.order, ...orders.filter((o) => o.id !== apiRes.order.id)]);
        setCart(cart.filter((c) => !c.checked));
        setUseLoyaltyPointsFallbackReset();
        setUser({
          loyaltyPoints:
            typeof apiRes.newLoyaltyBalance === "number"
              ? apiRes.newLoyaltyBalance
              : Math.max(
                  0,
                  user.loyaltyPoints -
                    (apiRes.redeemedPoints || 0) +
                    apiRes.earnedPoints
                ),
        });
        if (apiRes.loyaltyHistory) {
          setLoyaltyHistory(apiRes.loyaltyHistory);
        }
        window.dispatchEvent(new Event("nesphar:refresh-bootstrap"));
        setSubmitting(false);
        showToast(
          `Đặt đơn #${apiRes.order.code} thành công! (+${apiRes.earnedPoints} điểm)`
        );
        navigate("/orders");
        return;
      }
      if (IS_LIVE_BACKEND) {
        setSubmitting(false);
        showToast(
          "Kết nối mạng không ổn định, đơn hàng chưa gửi được. Vui lòng bấm Đặt hàng lại!"
        );
        return;
      }
    } catch (err) {
      if (err instanceof ApiBusinessError) {
        setSubmitting(false);
        showToast(err.message);
        return;
      }
      if (IS_LIVE_BACKEND) {
        setSubmitting(false);
        showToast(
          "Kết nối mạng không ổn định, đơn hàng chưa gửi được. Vui lòng bấm Đặt hàng lại!"
        );
        return;
      }
    }

    // Graceful Offline Fallback (when Zalo Cloud preview runs without backend connection)
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
      now.getDate()
    )} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const randomSuffix = String(Math.floor(100000 + Math.random() * 899999));
    const newCode = `00001${randomSuffix}`;
    const earnedPoints = Math.max(1, Math.floor(summary.total / 10000));
    const redeemed = summary.redeemedPoints;

    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      code: newCode,
      createdAt: timestamp,
      status: "pending",
      items: summary.checkedItems.map((ci) => ({
        productId: ci.product.id,
        sku: ci.product.sku,
        name: ci.product.name,
        image: ci.product.images[0],
        unitName: ci.unitOpt.unitName,
        specificationLabel: ci.unitOpt.specificationLabel,
        unitPrice: ci.unitPrice,
        quantity: ci.quantity,
      })),
      subtotal: summary.subtotal,
      discountAmount: summary.discountAmount,
      pointsRedeemed: redeemed,
      pointsDiscount: summary.pointsDiscount,
      pointsEarned: earnedPoints,
      shippingFee: summary.shippingFee,
      totalAmount: summary.total,
      voucherCode: summary.appliedVoucher?.code,
      paymentMethod,
      address: activeAddress,
      note: note.trim() || undefined,
      customerTierAtPurchase: user.customerTier,
    };

    setTimeout(() => {
      const balanceAfterRedeem = Math.max(0, user.loyaltyPoints - redeemed);
      const nextBalance = balanceAfterRedeem + earnedPoints;
      const nextTx = [
        {
          id: `ltx-earn-${Date.now()}`,
          type: "earn" as const,
          pointsChange: earnedPoints,
          balanceAfter: nextBalance,
          title: `Tích điểm đơn hàng #${newCode}`,
          orderCode: newCode,
          createdAt: timestamp,
        },
        ...(redeemed > 0
          ? [
              {
                id: `ltx-redeem-${Date.now() - 1}`,
                type: "redeem" as const,
                pointsChange: -redeemed,
                balanceAfter: balanceAfterRedeem,
                title: `Đổi ${redeemed} điểm giảm ${formatVnd(
                  summary.pointsDiscount
                )} đơn #${newCode}`,
                orderCode: newCode,
                createdAt: timestamp,
              },
            ]
          : []),
        ...loyaltyHistory,
      ];

      setOrders([newOrder, ...orders]);
      setCart(cart.filter((c) => !c.checked));
      setUseLoyaltyPointsFallbackReset();
      setUser({ loyaltyPoints: nextBalance });
      setLoyaltyHistory(nextTx);
      setNotifications([
        {
          id: `noti-${Date.now()}`,
          type: "order",
          title: `Đặt hàng thành công #${newCode}`,
          body: `Dược sĩ NESPHAR đã nhận đơn ${formatVnd(
            summary.total
          )} và cộng +${earnedPoints} điểm thành viên cho bạn.`,
          createdAt: "Vừa xong",
          read: false,
          targetLink: "/orders",
        },
        ...notifications,
      ]);
      setSubmitting(false);
      showToast(`Đặt đơn #${newCode} thành công! (+${earnedPoints} điểm)`);
      navigate("/orders");
    }, 350);
  };

  function setUseLoyaltyPointsFallbackReset() {
    setUsePoints(false);
  }

  return (
    <div className="min-h-screen bg-[#F3F5FB] pb-32">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#3E4095] text-white zmp-safe-top">
        <div className="flex h-[52px] items-center justify-between px-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Quay lại Giỏ hàng"
              onClick={() => navigate(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/15"
            >
              <ChevronLeft size={22} />
            </button>
            <h1 className="text-[17px] font-bold">Xác nhận đặt hàng</h1>
          </div>
          <ZaloPreviewCapsule tone="on-dark" />
        </div>
      </header>

      <main className="space-y-3 p-3.5">
        {/* Delivery Address Card */}
        <section className="rounded-xl border border-[#DCE1F0] bg-white p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5">
              <MapPin size={19} className="mt-0.5 shrink-0 text-[#3E4095]" />
              {activeAddress ? (
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-bold text-[#121833]">
                      {activeAddress.recipientName}
                    </span>
                    <span className="tabular-nums text-[13px] text-[#3E486B]">
                      {activeAddress.phone}
                    </span>
                    <span className="rounded bg-[#EEF0FD] px-2 py-0.5 text-[10.5px] font-semibold text-[#3E4095]">
                      {activeAddress.tag}
                    </span>
                  </div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-[#3E486B]">
                    {activeAddress.street}, {activeAddress.ward},{" "}
                    {activeAddress.district}, {activeAddress.province}
                  </p>
                </div>
              ) : (
                <p className="text-[13.5px] text-[#3E486B]">
                  Chưa có địa chỉ nhận hàng. Nhấn để thêm địa chỉ mới.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => navigate("/addresses?from=checkout")}
              className="flex shrink-0 items-center text-[12.5px] font-semibold text-[#3E4095]"
            >
              <span>Thay đổi</span>
              <ChevronRight size={16} />
            </button>
          </div>

          {/* User Intent Phone Confirmation (Contract Clause 4.1 Zalo Compliance) */}
          <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-[#EEF0FD] px-3 py-2.5">
            <div className="flex items-center gap-2 text-[12px] text-[#282A6E]">
              {user.phoneLinked ? (
                <>
                  <CheckCircle2 size={16} className="shrink-0 text-[#3E4095]" />
                  <span>Đã liên kết SĐT Zalo nhận thông báo hành trình đơn</span>
                </>
              ) : (
                <>
                  <PhoneCall size={15} className="shrink-0 text-[#3E4095]" />
                  <span>Liên kết SĐT Zalo để tích điểm & nhận tin giao hàng</span>
                </>
              )}
            </div>

            {!user.phoneLinked && (
              <button
                type="button"
                onClick={handleLinkZaloPhone}
                className="shrink-0 rounded-lg bg-[#3E4095] px-2.5 py-1 text-[11.5px] font-semibold text-white"
              >
                Đồng bộ SĐT
              </button>
            )}
          </div>
        </section>

        {/* Order Items Summary */}
        <section className="rounded-xl border border-[#DCE1F0] bg-white p-3.5">
          <h2 className="text-[14.5px] font-bold text-[#121833]">
            Sản phẩm đặt mua ({summary.checkedItems.length})
          </h2>

          <div className="mt-2.5 divide-y divide-[#EDF0F8]">
            {summary.checkedItems.map((item) => (
              <div
                key={`${item.productId}-${item.unitOptionId}`}
                className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <img
                  src={item.product.images[0]}
                  alt={item.product.name}
                  className="h-14 w-14 shrink-0 rounded-lg border border-[#EDF0F8] object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-[13px] font-semibold text-[#121833]">
                    {item.product.sku} - {item.product.name}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-[#5A658A]">
                    {item.unitOpt.specificationLabel} × {item.quantity}
                  </p>
                  <p className="tabular-nums mt-0.5 text-[13.5px] font-bold text-[#3E4095]">
                    {formatVnd(item.lineTotal)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 border-t border-[#EDF0F8] pt-3">
            <label
              htmlFor="order-note"
              className="block text-[12.5px] font-semibold text-[#121833]"
            >
              Ghi chú cho Dược sĩ / Giao hàng
            </label>
            <input
              id="order-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Giao giờ hành chính, cần tư vấn liều dùng hoặc xuất HĐ nhà thuốc..."
              className="mt-1.5 w-full rounded-xl border border-[#DCE1F0] bg-[#FAFBFF] px-3 py-2 text-[13px] text-[#121833] placeholder:text-[#5A658A]"
            />
          </div>
        </section>

        {/* Payment Method Selection */}
        <section className="rounded-xl border border-[#DCE1F0] bg-white p-3.5">
          <h2 className="text-[14.5px] font-bold text-[#121833]">
            Phương thức thanh toán
          </h2>

          <div className="mt-2.5 space-y-2">
            {[
              {
                id: "cod" as const,
                title: "Thanh toán khi nhận hàng (COD)",
                desc: "Đồng kiểm tem niêm phong & hạn dùng trước khi thanh toán",
                Icon: Wallet,
              },
              {
                id: "vietqr" as const,
                title: "Chuyển khoản Ngân hàng (VietQR)",
                desc: "Quét mã QR chuyển khoản tới Công ty TNHH Dược phẩm NESPHAR",
                Icon: QrCode,
              },
              {
                id: "zalopay" as const,
                title: "Ví điện tử ZaloPay",
                desc: "Thanh toán nhanh chóng ngay trên ứng dụng Zalo",
                Icon: CreditCard,
              },
            ].map(({ id, title, desc, Icon }) => {
              const active = paymentMethod === id;
              return (
                <label
                  key={id}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                    active
                      ? "border-[#3E4095] bg-[#EEF0FD]"
                      : "border-[#DCE1F0] bg-[#FAFBFF]"
                  }`}
                >
                  <input
                    type="radio"
                    name="payment-method"
                    checked={active}
                    onChange={() => setPaymentMethod(id)}
                    className="mt-1 h-4 w-4 accent-[#3E4095]"
                  />
                  <Icon size={19} className="mt-0.5 shrink-0 text-[#3E4095]" />
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-[#121833]">
                      {title}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-[#3E486B]">{desc}</p>
                  </div>
                </label>
              );
            })}
          </div>

          {paymentMethod === "vietqr" && (
            <div className="mt-3 rounded-xl border border-[#C5CAFA] bg-[#F6F8FF] p-3 text-[12px] text-[#121833]">
              <p className="font-bold text-[#282A6E]">
                Tài khoản nhận chuyển khoản VietQR tự động:
              </p>
              <p className="mt-1 text-[#3E486B]">
                • Ngân hàng:{" "}
                <strong className="text-[#121833]">
                  {paymentConfig.bankShortName} — STK{" "}
                  <span className="tabular-nums">{paymentConfig.accountNo}</span>
                </strong>
              </p>
              <p className="mt-0.5 text-[#3E486B]">
                • Chủ tài khoản:{" "}
                <strong className="text-[#121833]">
                  {paymentConfig.accountName}
                </strong>
              </p>
              <p className="mt-1 text-[11.5px] text-[#5A658A]">
                Ngay sau khi bấm Đặt hàng, màn hình Đơn hàng sẽ hiển thị mã QR quét tự điền sẵn số tiền {formatVnd(summary.total)} và mã đơn của bạn.
              </p>
            </div>
          )}
        </section>

        {/* Loyalty Points Redemption Section */}
        <section className="rounded-xl border border-[#DCE1F0] bg-white p-3.5">
          {user.zaloLoggedIn ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EEF0FD] text-[#3E4095]">
                  <Award size={18} />
                </span>
                <div>
                  <p className="text-[13.5px] font-bold text-[#121833]">
                    Ví điểm thành viên ({user.loyaltyPoints} điểm)
                  </p>
                  <p className="text-[12px] text-[#3E486B]">
                    {summary.maxRedeemablePoints > 0
                      ? `Dùng ${summary.maxRedeemablePoints} điểm giảm trực tiếp ${formatVnd(
                          summary.maxRedeemablePoints * 1000
                        )}`
                      : "Chưa đủ điểm đổi ưu đãi • Đơn này tích thêm điểm mới"}
                  </p>
                </div>
              </div>
              {summary.maxRedeemablePoints > 0 && (
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#EEF0FD] px-2.5 py-1.5 text-[12px] font-bold text-[#3E4095]">
                  <input
                    type="checkbox"
                    checked={usePoints}
                    onChange={(e) => setUsePoints(e.target.checked)}
                    className="h-4 w-4 accent-[#3E4095]"
                  />
                  <span>Dùng điểm</span>
                </label>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EEF0FD] text-[#3E4095]">
                  <Award size={18} />
                </span>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-bold text-[#121833]">
                    Đăng nhập Zalo nhận +50 điểm (= 50.000đ)
                  </p>
                  <p className="truncate text-[12px] text-[#3E486B]">
                    Dùng điểm giảm ngay cho đơn hàng này
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void loginWithZalo()}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#3E4095] px-3 py-1.5 text-[12px] font-bold text-white"
              >
                <LogIn size={13} />
                <span>Đăng nhập</span>
              </button>
            </div>
          )}
        </section>

        {/* Final Totals */}
        <section className="space-y-2 rounded-xl border border-[#DCE1F0] bg-white p-3.5 text-[13.5px]">
          <div className="flex justify-between text-[#3E486B]">
            <span>Tổng tiền hàng</span>
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
              <span>Đổi {summary.redeemedPoints} điểm tích lũy</span>
              <span className="tabular-nums font-semibold text-[#3E4095]">
                -{formatVnd(summary.pointsDiscount)}
              </span>
            </div>
          )}
          <div className="flex justify-between text-[#3E486B]">
            <span>Phí giao hàng</span>
            <span className="tabular-nums font-medium text-[#121833]">
              {summary.shippingFee === 0
                ? "Miễn phí"
                : formatVnd(summary.shippingFee)}
            </span>
          </div>
          <div className="flex justify-between border-t border-[#EDF0F8] pt-2.5 text-[15px] font-bold text-[#121833]">
            <span>Tổng thanh toán</span>
            <span className="tabular-nums text-[17.5px] text-[#3E4095]">
              {formatVnd(summary.total)}
            </span>
          </div>
          {summary.estimatedEarnedPoints > 0 && (
            <div className="flex justify-between text-[12px] font-medium text-[#3E4095]">
              <span>Điểm thưởng cộng sau đơn này</span>
              <span className="tabular-nums font-bold">
                +{summary.estimatedEarnedPoints} điểm
              </span>
            </div>
          )}

          <p className="flex items-center gap-1.5 pt-1 text-[11.5px] text-[#3E486B]">
            <ShieldCheck size={14} className="shrink-0 text-[#3E4095]" />
            <span>
              Bằng việc Đặt hàng, bạn đồng ý với Điều khoản & Chính sách bảo mật của NESPHAR.
            </span>
          </p>
        </section>
      </main>

      {/* Bottom Place Order Bar */}
      <div className="fixed bottom-0 left-1/2 z-40 w-full max-w-[440px] -translate-x-1/2 border-t border-[#DCE1F0] bg-white px-3.5 py-2.5 zmp-safe-bottom">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11.5px] text-[#3E486B]">Cần thanh toán:</p>
            <p className="tabular-nums text-[18px] font-extrabold text-[#3E4095]">
              {formatVnd(summary.total)}
            </p>
          </div>
          <button
            type="button"
            disabled={submitting || summary.checkedItems.length === 0}
            onClick={handlePlaceOrder}
            className="rounded-xl bg-[#3E4095] px-6 py-3 text-[14.5px] font-bold text-white hover:bg-[#31337A] disabled:opacity-50"
          >
            {submitting ? "Đang xử lý..." : "Đặt hàng ngay"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CheckoutPage;
