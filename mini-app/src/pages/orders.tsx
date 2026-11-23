import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAtom, useAtomValue } from "jotai";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Copy,
  PackageSearch,
  RotateCcw,
  ShoppingCart,
  Truck,
  XCircle,
} from "lucide-react";
import {
  cartAtom,
  companyInfoAtom,
  customerIdAtom,
  loyaltyHistoryAtom,
  ordersAtom,
  paymentConfigAtom,
  productsAtom,
  userProfileAtom,
} from "@/state/store";
import { ORDER_STATUS_META, formatVnd } from "@/utils/format";
import { Order, OrderStatus } from "@/types";
import { useAppActions } from "@/hooks/useAppActions";
import { ApiBusinessError, cancelMiniAppOrderApi } from "@/services/api";
import { ZaloPreviewCapsule } from "@/components/ZaloPreviewCapsule";

const STATUS_TABS: { id: "all" | OrderStatus; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "pending", label: "Chờ xác nhận" },
  { id: "confirmed", label: "Đã xác nhận" },
  { id: "shipping", label: "Đang giao" },
  { id: "completed", label: "Hoàn thành" },
  { id: "cancelled", label: "Đã hủy" },
];

const OrdersPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const customerId = useAtomValue(customerIdAtom);
  const [user, setUser] = useAtom(userProfileAtom);
  const [, setLoyaltyHistory] = useAtom(loyaltyHistoryAtom);
  const [orders, setOrders] = useAtom(ordersAtom);
  const [cart, setCart] = useAtom(cartAtom);
  const products = useAtomValue(productsAtom);
  const companyInfo = useAtomValue(companyInfoAtom);
  const paymentConfig = useAtomValue(paymentConfigAtom);
  const { showToast } = useAppActions();

  const initialTab = (searchParams.get("status") as "all" | OrderStatus) || "all";
  const [activeTab, setActiveTab] = useState<"all" | OrderStatus>(initialTab);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(
    orders[0]?.id || null
  );

  const visibleOrders =
    activeTab === "all"
      ? orders
      : orders.filter((o) => o.status === activeTab);

  const handleSelectTab = (tabId: "all" | OrderStatus) => {
    setActiveTab(tabId);
    if (tabId === "all") setSearchParams({}, { replace: true });
    else setSearchParams({ status: tabId }, { replace: true });
  };

  const handleCancelOrder = async (order: Order) => {
    try {
      const apiRes = await cancelMiniAppOrderApi(
        order.id,
        customerId,
        "Khách chủ động hủy đơn trên Zalo Mini App"
      );
      if (apiRes) {
        if (apiRes.orders) {
          setOrders(apiRes.orders);
        } else {
          setOrders(
            orders.map((o) =>
              o.id === order.id ? { ...o, status: "cancelled" } : o
            )
          );
        }
        if (typeof apiRes.loyaltyPoints === "number") {
          setUser({ loyaltyPoints: apiRes.loyaltyPoints });
        }
        if (apiRes.loyaltyHistory) {
          setLoyaltyHistory(apiRes.loyaltyHistory);
        }
        window.dispatchEvent(new Event("nesphar:refresh-bootstrap"));
        showToast(`Đã hủy đơn #${order.code} & hoàn tồn lô FEFO`);
        return;
      }
    } catch (err) {
      if (err instanceof ApiBusinessError) {
        showToast(err.message);
        return;
      }
    }

    const refunded = order.pointsRedeemed || 0;
    const reclaimed = order.pointsEarned || 0;
    if (refunded > 0 || reclaimed > 0) {
      setUser({
        loyaltyPoints: Math.max(0, user.loyaltyPoints + refunded - reclaimed),
      });
    }
    setOrders(
      orders.map((o) =>
        o.id === order.id ? { ...o, status: "cancelled" } : o
      )
    );
    showToast(`Đã hủy đơn hàng #${order.code}`);
  };

  const handleReorder = (order: Order) => {
    const nextCart = [...cart];
    order.items.forEach((line) => {
      const prod = products.find((p) => p.id === line.productId);
      if (!prod || !prod.inStock) return;
      const unitOpt = prod.unitOptions[0];
      const idx = nextCart.findIndex(
        (c) => c.productId === prod.id && c.unitOptionId === unitOpt.id
      );
      if (idx >= 0) {
        nextCart[idx] = {
          ...nextCart[idx],
          quantity: nextCart[idx].quantity + line.quantity,
          checked: true,
        };
      } else {
        nextCart.push({
          productId: prod.id,
          unitOptionId: unitOpt.id,
          quantity: line.quantity,
          checked: true,
        });
      }
    });
    setCart(nextCart);
    showToast(`Đã thêm lại sản phẩm từ đơn #${order.code} vào giỏ`);
    navigate("/cart");
  };

  return (
    <div className="min-h-screen bg-[#F3F5FB] pb-24">
      {/* Header matching Screenshot 5 */}
      <header className="sticky top-0 z-30 bg-[#3E4095] text-white zmp-safe-top">
        <div className="flex h-[52px] items-center justify-between px-3.5">
          <h1 className="text-[18px] font-bold">Đơn hàng</h1>
          <ZaloPreviewCapsule tone="on-dark" />
        </div>

        {/* 5-Status Filter Bar (Contract Item 6) */}
        <div className="no-scrollbar flex overflow-x-auto border-b border-[#DCE1F0] bg-white px-2">
          {STATUS_TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectTab(tab.id)}
                className={`relative shrink-0 px-3 py-2.5 text-[13px] transition-colors ${
                  active
                    ? "font-bold text-[#3E4095]"
                    : "font-medium text-[#3E486B]"
                }`}
              >
                <span>{tab.label}</span>
                {active && (
                  <span className="absolute bottom-0 left-2.5 right-2.5 h-0.5 rounded-full bg-[#3E4095]" />
                )}
              </button>
            );
          })}
        </div>
      </header>

      <main className="space-y-3 p-3.5">
        {visibleOrders.length === 0 ? (
          <div className="mt-10 flex flex-col items-center rounded-2xl border border-[#DCE1F0] bg-white px-6 py-12 text-center">
            <PackageSearch size={38} className="text-[#5A658A]" />
            <h2 className="mt-3 text-[15.5px] font-bold text-[#121833]">
              Chưa có đơn hàng ở trạng thái này
            </h2>
            <p className="mt-1 text-[12.5px] text-[#3E486B]">
              Các đơn thuốc & sản phẩm chăm sóc sức khỏe bạn đặt sẽ hiển thị đầy đủ tại đây.
            </p>
            <button
              type="button"
              onClick={() => navigate("/categories")}
              className="mt-4 rounded-full bg-[#3E4095] px-5 py-2 text-[13px] font-semibold text-white"
            >
              Mua sắm ngay
            </button>
          </div>
        ) : (
          visibleOrders.map((order) => {
            const statusMeta = ORDER_STATUS_META[order.status];
            const isOpen = expandedOrderId === order.id;
            const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);

            return (
              <section
                key={order.id}
                className="overflow-hidden rounded-xl border border-[#DCE1F0] bg-white"
              >
                {/* Store Name & Item Count Row (Screenshot 5 top row) */}
                <div className="flex items-center justify-between border-b border-[#EDF0F8] px-3.5 py-2.5">
                  <span className="text-[14.5px] font-semibold text-[#121833]">
                    {companyInfo.shortName}
                  </span>
                  <span className="tabular-nums rounded-full bg-[#EDF0F8] px-2.5 py-0.5 text-[12px] font-semibold text-[#121833]">
                    {itemCount}
                  </span>
                </div>

                {/* Order Code, Status Pill, Timestamp & Store Button (Screenshot 5 middle row) */}
                <div className="px-3.5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ShoppingCart size={15} className="text-[#5A658A]" />
                      <span
                        style={{
                          backgroundColor: statusMeta.chipBg,
                          color: statusMeta.chipText,
                        }}
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      >
                        {statusMeta.label}
                      </span>
                      <span className="tabular-nums text-[15px] font-bold text-[#121833]">
                        #{order.code}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => navigate("/categories")}
                      className="inline-flex items-center gap-0.5 rounded-lg bg-[#3E4095] px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-[#31337A]"
                    >
                      <span>Cửa hàng</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between text-[12px] text-[#5A658A]">
                    <span className="tabular-nums inline-flex items-center gap-1">
                      <Clock size={13} />
                      <span>{order.createdAt}</span>
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedOrderId(isOpen ? null : order.id)
                      }
                      className="inline-flex items-center gap-1 font-medium text-[#3E4095]"
                    >
                      <span>{isOpen ? "Thu gọn" : "Xem chi tiết"}</span>
                      {isOpen ? (
                        <ChevronUp size={14} />
                      ) : (
                        <ChevronDown size={14} />
                      )}
                    </button>
                  </div>

                  {/* Live Carrier Tracking & Payment Status synced from Web Admin */}
                  {(order.trackingCode || order.paymentStatus || order.returnStatus === "returned") && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {order.paymentStatus && (
                        <span
                          className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                            order.paymentStatus === "paid"
                              ? "bg-[#DCFCE7] text-[#166534]"
                              : order.paymentStatus === "refunded"
                                ? "bg-[#FEE2E2] text-[#991B1B]"
                                : "bg-[#F3F5FB] text-[#3E486B]"
                          }`}
                        >
                          {order.paymentStatus === "paid"
                            ? "Đã thanh toán"
                            : order.paymentStatus === "refunded"
                              ? "Đã hoàn tiền & hoàn kho FEFO"
                              : "Chưa thanh toán"}
                        </span>
                      )}

                      {order.trackingCode && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(order.trackingCode || "");
                              showToast(`Đã sao chép mã vận đơn: ${order.trackingCode}`);
                            } catch {
                              showToast(`Mã vận đơn: ${order.trackingCode}`);
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-md bg-[#EEF0FD] px-2 py-0.5 text-[11px] font-semibold text-[#282A6E]"
                        >
                          <Truck size={11} />
                          <span className="tabular-nums">
                            {order.shippingCarrier ? `${order.shippingCarrier}: ` : ""}
                            {order.trackingCode}
                          </span>
                          <Copy size={10} />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Expanded Order Detail */}
                  {isOpen && (
                    <div className="mt-3 space-y-2.5 border-t border-[#EDF0F8] pt-3">
                      {order.items.map((line, idx) => (
                        <div
                          key={idx}
                          onClick={() => navigate(`/product/${line.productId}`)}
                          className="flex cursor-pointer items-center gap-2.5"
                        >
                          <img
                            src={line.image}
                            alt={line.name}
                            className="h-12 w-12 shrink-0 rounded-lg border border-[#EDF0F8] object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-1 text-[12.5px] font-medium text-[#121833]">
                              {line.sku} - {line.name}
                            </p>
                            <p className="text-[11px] text-[#5A658A]">
                              {line.specificationLabel} × {line.quantity}
                            </p>
                            {line.allocations && line.allocations.length > 0 && (
                              <p className="tabular-nums mt-0.5 text-[10.5px] font-medium text-[#3E4095]">
                                Lô xuất FEFO:{" "}
                                {line.allocations
                                  .map(
                                    (a) =>
                                      `${a.batchCode || a.batchNumber} (HSD ${a.expDate})`
                                  )
                                  .join(", ")}
                              </p>
                            )}
                          </div>
                          <span className="tabular-nums text-[12.5px] font-semibold text-[#121833]">
                            {formatVnd(line.unitPrice * line.quantity)}
                          </span>
                        </div>
                      ))}

                      <div className="rounded-lg bg-[#F3F5FB] p-2.5 text-[11.5px] text-[#3E486B]">
                        <p className="font-semibold text-[#121833]">
                          Giao tới: {order.address.recipientName} ({order.address.phone})
                        </p>
                        <p className="mt-0.5">
                          {order.address.street}, {order.address.ward},{" "}
                          {order.address.district}, {order.address.province}
                        </p>
                        {order.note && (
                          <p className="mt-1 italic text-[#282A6E]">
                            Ghi chú: {order.note}
                          </p>
                        )}
                        {(Boolean(order.pointsEarned) || Boolean(order.pointsRedeemed)) && (
                          <p className="tabular-nums mt-1 font-semibold text-[#3E4095]">
                            Điểm thành viên:{" "}
                            {order.pointsRedeemed
                              ? `Đã dùng -${order.pointsRedeemed} điểm (${formatVnd(
                                  (order.pointsDiscount || order.pointsRedeemed * 1000)
                                )}) • `
                              : ""}
                            {order.pointsEarned ? `Tích lũy +${order.pointsEarned} điểm` : ""}
                          </p>
                        )}
                      </div>

                      {/* Dynamic Scannable Napas / VietQR Box for Unpaid VietQR Orders */}
                      {order.paymentMethod === "vietqr" &&
                        order.paymentStatus !== "paid" &&
                        order.status !== "cancelled" && (
                          <div className="rounded-xl border border-[#C5CAFA] bg-[#F6F8FF] p-3 text-center">
                            <p className="text-[12.5px] font-bold text-[#282A6E]">
                              Quét mã VietQR để thanh toán tự động
                            </p>
                            <img
                              src={
                                order.vietQrUrl ||
                                `https://img.vietqr.io/image/${encodeURIComponent(
                                  paymentConfig.bankBin
                                )}-${encodeURIComponent(
                                  paymentConfig.accountNo
                                )}-compact2.png?amount=${Math.round(
                                  order.totalAmount
                                )}&addInfo=${encodeURIComponent(
                                  `${paymentConfig.transferPrefix || "NESPHAR"} ${order.code}`
                                )}&accountName=${encodeURIComponent(paymentConfig.accountName)}`
                              }
                              alt={`Mã VietQR đơn #${order.code}`}
                              className="mx-auto mt-2 h-48 w-48 rounded-lg border border-[#DCE1F0] bg-white object-contain p-1"
                            />
                            <div className="mt-2 space-y-1 text-left text-[11.5px] text-[#3E486B]">
                              <div className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5">
                                <span>
                                  {paymentConfig.bankShortName}:{" "}
                                  <strong className="tabular-nums text-[#121833]">
                                    {paymentConfig.accountNo}
                                  </strong>
                                </span>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(paymentConfig.accountNo);
                                      showToast("Đã sao chép Số tài khoản");
                                    } catch {
                                      showToast(`STK: ${paymentConfig.accountNo}`);
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 font-semibold text-[#3E4095]"
                                >
                                  <Copy size={11} />
                                  <span>Chép</span>
                                </button>
                              </div>
                              <div className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5">
                                <span>
                                  Nội dung:{" "}
                                  <strong className="tabular-nums text-[#3E4095]">
                                    {paymentConfig.transferPrefix || "NESPHAR"} {order.code}
                                  </strong>
                                </span>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const memo = `${paymentConfig.transferPrefix || "NESPHAR"} ${order.code}`;
                                    try {
                                      await navigator.clipboard.writeText(memo);
                                      showToast("Đã sao chép Nội dung chuyển khoản");
                                    } catch {
                                      showToast(memo);
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 font-semibold text-[#3E4095]"
                                >
                                  <Copy size={11} />
                                  <span>Chép</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                    </div>
                  )}
                </div>

                {/* Total & Actions Footer Row (Screenshot 5 bottom row) */}
                <div className="flex items-center justify-between border-t border-[#EDF0F8] bg-[#FAFBFF] px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    {order.status === "pending" && (
                      <button
                        type="button"
                        onClick={() => handleCancelOrder(order)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#DCE1F0] bg-white px-2.5 py-1 text-[12px] font-medium text-[#D92D20]"
                      >
                        <XCircle size={13} />
                        <span>Hủy đơn</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleReorder(order)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#9AA0E6] bg-[#EEF0FD] px-2.5 py-1 text-[12px] font-semibold text-[#3E4095]"
                    >
                      <RotateCcw size={12} />
                      <span>Mua lại</span>
                    </button>
                  </div>

                  <div className="text-right text-[14px] text-[#121833]">
                    <span>Tổng: </span>
                    <span className="tabular-nums font-bold text-[#3E4095]">
                      {formatVnd(order.totalAmount)}
                    </span>
                  </div>
                </div>
              </section>
            );
          })
        )}
      </main>
    </div>
  );
};

export default OrdersPage;
