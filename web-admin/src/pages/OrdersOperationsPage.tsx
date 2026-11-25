import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  CheckSquare,
  Clock,
  Download,
  Eye,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Trash2,
  Truck,
  Wallet,
} from "lucide-react";
import { apiRequest, downloadAdminCsv } from "../api/client";
import { ModalDialog, SlideDrawer } from "../components/OverlayPortal";
import { useAuth } from "../context/AuthContext";
import {
  AdminCustomer,
  AdminOrder,
  AdminProduct,
  CustomerTier,
  OrderStatus,
} from "../types";
import {
  formatDateTimeVi,
  formatDateVi,
  formatVnd,
  ORDER_STATUS_PILL,
  TIER_META,
} from "../utils/format";

type TabFilter = "all" | OrderStatus;

const PAYMENT_LABELS: Record<string, string> = {
  cod: "Tiền mặt (COD)",
  vietqr: "Chuyển khoản VietQR",
  bank_transfer: "Chuyển khoản VietQR",
  zalopay: "Ví ZaloPay",
};

export const OrdersOperationsPage: React.FC = () => {
  const { hasPermission, showToast } = useAuth();
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabFilter>(
    () => (searchParams.get("status") as TabFilter) || "all"
  );
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q") || "");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkUpdating, setBulkUpdating] = useState(false);

  // POS / Quick Wholesale Order Modal
  const [posOpen, setPosOpen] = useState(false);
  const [posCustomers, setPosCustomers] = useState<AdminCustomer[]>([]);
  const [posProducts, setPosProducts] = useState<AdminProduct[]>([]);
  const [posCustomerId, setPosCustomerId] = useState("");
  const [posPaymentMethod, setPosPaymentMethod] = useState<"cod" | "vietqr">("vietqr");
  const [posPaymentStatus, setPosPaymentStatus] = useState<"unpaid" | "paid">("unpaid");
  const [posNote, setPosNote] = useState("");
  const [posItems, setPosItems] = useState<
    Array<{ productId: string; unitOptionId: string; quantity: number }>
  >([]);
  const [creatingPos, setCreatingPos] = useState(false);

  useEffect(() => {
    const st = searchParams.get("status") as TabFilter | null;
    const q = searchParams.get("q");
    if (st && ["all", "pending", "confirmed", "shipping", "completed", "cancelled"].includes(st)) {
      setTab(st);
    }
    if (q !== null) setSearchQuery(q);
  }, [searchParams]);

  // Order Detail Drawer
  const [activeOrder, setActiveOrder] = useState<AdminOrder | null>(null);
  const [detailForm, setDetailForm] = useState({
    status: "pending" as OrderStatus,
    paymentStatus: "unpaid" as "unpaid" | "paid" | "refunded",
    shippingCarrier: "",
    trackingCode: "",
    note: "",
  });
  const [returnReason, setReturnReason] = useState(
    "Khách đổi trả theo chính sách 07 ngày"
  );
  const [savingDetail, setSavingDetail] = useState(false);

  const canApprove = hasPermission("approve_orders");

  const loadOrders = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ orders: AdminOrder[] }>("/orders");
      setOrders(res.orders);
      if (activeOrder) {
        const refreshed = res.orders.find((o) => o.id === activeOrder.id) || null;
        setActiveOrder(refreshed);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Không thể tải danh sách đơn hàng", "negative");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (tab !== "all" && o.status !== tab) return false;
      if (tierFilter !== "all" && o.customerTierSnapshot !== tierFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          o.code.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          o.customerPhone.toLowerCase().includes(q) ||
          o.trackingCode.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [orders, tab, tierFilter, searchQuery]);

  const openOrderDetail = (o: AdminOrder) => {
    setActiveOrder(o);
    setDetailForm({
      status: o.status,
      paymentStatus: o.paymentStatus,
      shippingCarrier: o.shippingCarrier || "NESPHAR Express Nội Tỉnh",
      trackingCode: o.trackingCode || "",
      note: o.note || "",
    });
  };

  const toggleSelectOrder = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAllFiltered = () => {
    const visibleIds = filteredOrders.map((o) => o.id);
    const allSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedIds(Array.from(new Set([...selectedIds, ...visibleIds])));
    }
  };

  const handleBulkStatus = async (nextStatus: OrderStatus) => {
    if (!canApprove || selectedIds.length === 0) return;
    setBulkUpdating(true);
    try {
      const res = await apiRequest<{ updatedCount: number }>("/orders/bulk-status", {
        method: "POST",
        body: JSON.stringify({ orderIds: selectedIds, status: nextStatus }),
      });
      showToast(
        `Đã chuyển ${res.updatedCount} đơn sang "${ORDER_STATUS_PILL[nextStatus].label}"`
      );
      setSelectedIds([]);
      await loadOrders();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Cập nhật hàng loạt thất bại", "negative");
    } finally {
      setBulkUpdating(false);
    }
  };

  const handleSaveSingleOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrder) return;
    setSavingDetail(true);
    try {
      await apiRequest(`/orders/${activeOrder.id}/status`, {
        method: "PATCH",
        body: JSON.stringify(detailForm),
      });
      showToast(`Đã cập nhật đơn hàng #${activeOrder.code}`);
      await loadOrders();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Không thể cập nhật đơn hàng", "negative");
    } finally {
      setSavingDetail(false);
    }
  };

  const handleProcessReturn = async () => {
    if (!activeOrder) return;
    setSavingDetail(true);
    try {
      await apiRequest(`/orders/${activeOrder.id}/return`, {
        method: "POST",
        body: JSON.stringify({ reason: returnReason }),
      });
      showToast(`Đã hoàn trả đơn #${activeOrder.code} và nhập lại lô gốc`);
      await loadOrders();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Xử lý hoàn trả thất bại", "negative");
    } finally {
      setSavingDetail(false);
    }
  };

  const openPosModal = async () => {
    try {
      const [cRes, pRes] = await Promise.all([
        apiRequest<{ customers: AdminCustomer[] }>("/customers"),
        apiRequest<{ products: AdminProduct[] }>("/products"),
      ]);
      const availProds = pRes.products.filter((p) => p.stock.availableStock > 0);
      setPosCustomers(cRes.customers);
      setPosProducts(availProds);
      const firstCust = cRes.customers[0];
      const firstProd = availProds[0];
      setPosCustomerId(firstCust?.id || "");
      setPosItems(
        firstProd
          ? [
              {
                productId: firstProd.id,
                unitOptionId: firstProd.unitOptions[0]?.id || "u-base",
                quantity: 1,
              },
            ]
          : []
      );
      setPosNote("");
      setPosOpen(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Không thể tải danh mục POS", "negative");
    }
  };

  const handleCreatePosOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!posCustomerId || posItems.length === 0) return;
    setCreatingPos(true);
    try {
      const res = await apiRequest<{ code: string }>("/orders", {
        method: "POST",
        body: JSON.stringify({
          customerId: posCustomerId,
          items: posItems,
          paymentMethod: posPaymentMethod,
          paymentStatus: posPaymentStatus,
          note: posNote,
        }),
      });
      showToast(`Đã tạo đơn #${res.code}`);
      setPosOpen(false);
      await loadOrders();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Không thể tạo đơn", "negative");
    } finally {
      setCreatingPos(false);
    }
  };

  const pointsDiscount = Number(activeOrder?.pointsDiscount || 0);
  const voucherDiscountOnly = activeOrder
    ? Math.max(0, activeOrder.discountAmount - pointsDiscount)
    : 0;
  const pendingCount = orders.filter((o) => o.status === "pending").length;
  const shippingCount = orders.filter((o) => o.status === "shipping").length;
  const completedCount = orders.filter((o) => o.status === "completed").length;
  const validRevenue = orders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + o.totalAmount, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-[22px] font-bold tracking-tight text-ink-primary">Đơn hàng</h1>
          <span className="rounded-full bg-[#EEF0FD] px-2.5 py-0.5 text-[12px] font-semibold text-pharma-600 tabular-nums">
            {orders.length} đơn
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasPermission("export_data") && (
            <button
              type="button"
              onClick={() => downloadAdminCsv("orders")}
              className="btn-press inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#DCE2F0] bg-white px-3.5 text-[13px] font-medium text-ink-secondary hover:bg-[#F5F7FC]"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Xuất CSV</span>
            </button>
          )}
          {canApprove && (
            <button
              type="button"
              onClick={openPosModal}
              className="btn-press inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl bg-gradient-to-r from-[#3E4095] to-[#2F317B] px-4 text-[13px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(62,64,149,0.55)] hover:from-[#343683] hover:to-[#252766]"
            >
              <Plus className="h-4 w-4" />
              <span>Tạo đơn mới</span>
            </button>
          )}
        </div>
      </div>

      {/* Interactive Metric Ribbon */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => setTab("all")}
          className={`admin-card anim-kpi-interactive flex items-center justify-between p-4 text-left ${
            tab === "all" ? "border-pharma-600 ring-1 ring-pharma-600/20" : ""
          }`}
        >
          <div className="min-w-0">
            <div className="text-[12px] font-medium text-ink-muted">Giá trị đơn hợp lệ</div>
            <div className="mt-1 truncate text-[20px] font-bold text-ink-primary tabular-nums">
              {formatVnd(validRevenue)}
            </div>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EEF0FD] text-pharma-600">
            <Wallet className="h-[18px] w-[18px]" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab("pending")}
          className={`admin-card anim-kpi-interactive flex items-center justify-between p-4 text-left ${
            tab === "pending" ? "border-[#D97706] ring-1 ring-[#D97706]/25" : ""
          }`}
        >
          <div>
            <div className="text-[12px] font-medium text-ink-muted">Chờ duyệt</div>
            <div className="mt-1 text-[22px] font-bold text-[#B45309] tabular-nums">
              {pendingCount}
            </div>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF6E5] text-[#B45309]">
            <Clock className="h-[18px] w-[18px]" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab("shipping")}
          className={`admin-card anim-kpi-interactive flex items-center justify-between p-4 text-left ${
            tab === "shipping" ? "border-[#2563EB] ring-1 ring-[#2563EB]/25" : ""
          }`}
        >
          <div>
            <div className="text-[12px] font-medium text-ink-muted">Đang giao hàng</div>
            <div className="mt-1 text-[22px] font-bold text-[#1D4ED8] tabular-nums">
              {shippingCount}
            </div>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EBF3FF] text-[#1D4ED8]">
            <Truck className="h-[18px] w-[18px]" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab("completed")}
          className={`admin-card anim-kpi-interactive flex items-center justify-between p-4 text-left ${
            tab === "completed" ? "border-[#136C3E] ring-1 ring-[#136C3E]/25" : ""
          }`}
        >
          <div>
            <div className="text-[12px] font-medium text-ink-muted">Hoàn thành</div>
            <div className="mt-1 text-[22px] font-bold text-[#136C3E] tabular-nums">
              {completedCount}
            </div>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E8F8EE] text-[#136C3E]">
            <CheckCircle2 className="h-[18px] w-[18px]" />
          </span>
        </button>
      </div>

      {/* Main White Card */}
      <div className="admin-card space-y-4 p-5">
        <div className="overflow-x-auto">
          <div className="admin-tabs">
            {(
              [
                { id: "all", label: `Tất cả (${orders.length})` },
                { id: "pending", label: `Chờ duyệt (${pendingCount})` },
                {
                  id: "confirmed",
                  label: `Đã xác nhận (${orders.filter((o) => o.status === "confirmed").length})`,
                },
                { id: "shipping", label: `Đang giao (${shippingCount})` },
                { id: "completed", label: `Hoàn thành (${completedCount})` },
                {
                  id: "cancelled",
                  label: `Đã hủy (${orders.filter((o) => o.status === "cancelled").length})`,
                },
              ] as Array<{ id: TabFilter; label: string }>
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`admin-tab-btn ${tab === t.id ? "admin-tab-active" : ""}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative w-full sm:w-[290px]">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm mã đơn, tên khách, SĐT..."
                className="h-9 w-full pl-9 pr-3 text-[13.5px]"
              />
            </div>

            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              className="h-9 pl-3 text-[13.5px]"
            >
              <option value="all">Tất cả khách hàng</option>
              <option value="retail">Khách lẻ</option>
              <option value="clinic">Phòng khám</option>
              <option value="pharmacy">Nhà thuốc</option>
              <option value="distributor">Đại lý</option>
            </select>
          </div>

          <div className="text-[13px] text-ink-muted tabular-nums">
            {filteredOrders.length} kết quả
          </div>
        </div>

        {/* BULK ACTION BAR */}
        {selectedIds.length > 0 && canApprove && (
          <div className="anim-banner-slide flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pharma-200 bg-[#EEF0FD] px-4 py-2.5">
            <div className="flex items-center gap-2 text-[13.5px] font-semibold text-pharma-800">
              <CheckSquare className="h-4 w-4 text-pharma-600" />
              <span>Đã chọn {selectedIds.length} đơn:</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={bulkUpdating}
                onClick={() => handleBulkStatus("confirmed")}
                className="btn-press rounded-lg bg-pharma-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-pharma-700"
              >
                Xác nhận
              </button>
              <button
                type="button"
                disabled={bulkUpdating}
                onClick={() => handleBulkStatus("shipping")}
                className="btn-press rounded-lg bg-white px-3 py-1.5 text-[12.5px] font-semibold text-pharma-700 hover:bg-[#E6E9FC]"
              >
                Đang giao
              </button>
              <button
                type="button"
                disabled={bulkUpdating}
                onClick={() => handleBulkStatus("completed")}
                className="btn-press rounded-lg bg-[#E8F8EE] px-3 py-1.5 text-[12.5px] font-semibold text-[#136C3E]"
              >
                Hoàn thành
              </button>
              <button
                type="button"
                disabled={bulkUpdating}
                onClick={() => handleBulkStatus("cancelled")}
                className="btn-press rounded-lg bg-[#FFECEB] px-3 py-1.5 text-[12.5px] font-semibold text-[#B42318]"
              >
                Hủy đơn
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="px-2 text-[12.5px] text-ink-muted hover:text-ink-primary"
              >
                Bỏ chọn
              </button>
            </div>
          </div>
        )}

        {/* Orders Table */}
        <div className="table-shell">
          {loading ? (
            <div className="py-12 text-center text-[13.5px] text-ink-muted">
              Đang tải đơn hàng...
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="py-12 text-center text-[13.5px] text-ink-muted">
              Không có đơn hàng phù hợp.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th className="w-9">
                    <input
                      type="checkbox"
                      checked={
                        filteredOrders.length > 0 &&
                        filteredOrders.every((o) => selectedIds.includes(o.id))
                      }
                      onChange={toggleSelectAllFiltered}
                      aria-label="Chọn tất cả"
                    />
                  </th>
                  <th>Mã đơn</th>
                  <th>Khách hàng</th>
                  <th>Số lượng</th>
                  <th>Thanh toán</th>
                  <th className="text-right">Tổng tiền</th>
                  <th>Trạng thái</th>
                  <th className="text-right">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="anim-rows">
                {filteredOrders.map((o) => {
                  const statusMeta = ORDER_STATUS_PILL[o.status] || ORDER_STATUS_PILL.pending;
                  const tierMeta =
                    TIER_META[o.customerTierSnapshot as CustomerTier] || TIER_META.retail;
                  const batchCodes = Array.from(
                    new Set(
                      o.items.flatMap((it) => it.allocations.map((a) => a.batchCode)).filter(Boolean)
                    )
                  );

                  return (
                    <tr key={o.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(o.id)}
                          onChange={() => toggleSelectOrder(o.id)}
                          aria-label={`Chọn đơn ${o.code}`}
                        />
                      </td>

                      <td className="whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openOrderDetail(o)}
                          className="text-left font-semibold text-pharma-600 hover:underline tabular-nums"
                        >
                          #{o.code}
                        </button>
                        <div className="text-[11.5px] text-ink-muted tabular-nums">
                          {formatDateTimeVi(o.createdAt)}
                        </div>
                      </td>

                      <td>
                        <div className="font-semibold text-ink-primary">
                          {o.businessName || o.customerName}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span
                            className="whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium"
                            style={{ backgroundColor: tierMeta.bg, color: tierMeta.ink }}
                          >
                            {tierMeta.shortLabel}
                          </span>
                          {o.address?.phone && (
                            <span className="text-[12px] text-ink-muted tabular-nums">
                              {o.address.phone}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="whitespace-nowrap">
                        <div className="text-[13px] font-medium text-ink-primary tabular-nums">
                          {o.items.length} sản phẩm
                        </div>
                        {batchCodes.length > 0 && (
                          <div className="mt-0.5 text-[11.5px] text-ink-muted tabular-nums">
                            Lô: {batchCodes.slice(0, 2).join(", ")}
                            {batchCodes.length > 2 ? ` +${batchCodes.length - 2}` : ""}
                          </div>
                        )}
                      </td>

                      <td className="whitespace-nowrap">
                        <div className="text-[13px] text-ink-primary">
                          {PAYMENT_LABELS[o.paymentMethod] || o.paymentMethod}
                        </div>
                        <span
                          className="text-[11.5px] font-medium"
                          style={{
                            color:
                              o.paymentStatus === "paid"
                                ? "#136C3E"
                                : o.paymentStatus === "refunded"
                                  ? "#B42318"
                                  : "#9A5B00",
                          }}
                        >
                          {o.paymentStatus === "paid"
                            ? "Đã thu"
                            : o.paymentStatus === "refunded"
                              ? "Đã hoàn"
                              : "Chưa thu"}
                        </span>
                      </td>

                      <td className="whitespace-nowrap text-right font-semibold text-ink-primary tabular-nums">
                        {formatVnd(o.totalAmount)}
                      </td>

                      <td>
                        <span
                          className="inline-block whitespace-nowrap rounded-lg px-2.5 py-1 text-[12px] font-medium"
                          style={{ backgroundColor: statusMeta.bg, color: statusMeta.ink }}
                        >
                          {statusMeta.label}
                        </span>
                      </td>

                      <td className="whitespace-nowrap text-right">
                        <button
                          type="button"
                          onClick={() => openOrderDetail(o)}
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-pharma-600 hover:bg-[#EEF0FD]"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Xem</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* PORTALED SLIDE-OVER ORDER DETAIL */}
      <SlideDrawer
        open={Boolean(activeOrder)}
        onClose={() => setActiveOrder(null)}
        widthClass="max-w-[700px]"
        title={
          activeOrder && (
            <>
              <span>
                Đơn hàng <code className="text-pharma-600">#{activeOrder.code}</code>
              </span>
              <span
                className="whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold"
                style={{
                  backgroundColor: ORDER_STATUS_PILL[activeOrder.status].bg,
                  color: ORDER_STATUS_PILL[activeOrder.status].ink,
                }}
              >
                {ORDER_STATUS_PILL[activeOrder.status].label}
              </span>
            </>
          )
        }
        subtitle={
          activeOrder && (
            <span className="tabular-nums">
              {formatDateTimeVi(activeOrder.createdAt)} · Phụ trách: {activeOrder.handledByName}
            </span>
          )
        }
        headerActions={
          <button
            type="button"
            onClick={() => window.print()}
            className="btn-press inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border border-borderline bg-white px-3 text-[12.5px] font-medium text-ink-primary hover:bg-[#F3F5FB]"
          >
            <Printer className="h-3.5 w-3.5 text-pharma-600" />
            <span>In phiếu GPP</span>
          </button>
        }
        footer={
          activeOrder && (
            <>
              <button
                type="button"
                onClick={() => setActiveOrder(null)}
                className="h-9 rounded-xl border border-borderline bg-white px-4 text-[13px] font-medium text-ink-secondary hover:bg-frame"
              >
                Đóng
              </button>
              {canApprove && (
                <button
                  type="submit"
                  form="order-detail-form"
                  disabled={savingDetail}
                  className="btn-press h-9 rounded-xl bg-pharma-600 px-5 text-[13px] font-semibold text-white hover:bg-pharma-700 disabled:opacity-60"
                >
                  {savingDetail ? "Đang lưu..." : "Cập nhật đơn hàng"}
                </button>
              )}
            </>
          )
        }
      >
        {activeOrder && (
          <div className="space-y-5">
            {/* Recipient Info */}
            <div className="admin-subtle-panel grid grid-cols-1 gap-3.5 p-4 sm:grid-cols-2">
              <div>
                <div className="text-[12px] font-medium text-ink-muted">Người nhận</div>
                <div className="mt-0.5 font-semibold text-ink-primary">
                  {activeOrder.address?.recipientName || activeOrder.customerName}
                </div>
                <div className="mt-0.5 text-[13px] text-ink-secondary tabular-nums">
                  SĐT: {activeOrder.address?.phone || activeOrder.customerPhone}
                </div>
              </div>
              <div>
                <div className="text-[12px] font-medium text-ink-muted">Địa chỉ giao hàng</div>
                <div className="mt-0.5 text-[13px] leading-relaxed text-ink-primary">
                  {[
                    activeOrder.address?.street,
                    activeOrder.address?.ward,
                    activeOrder.address?.district,
                    activeOrder.address?.province,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </div>
              </div>
            </div>

            {/* Line Items & FEFO Batches */}
            <div>
              <h3 className="text-[14px] font-semibold text-ink-primary">
                Sản phẩm & Lô xuất (FEFO)
              </h3>
              <div className="admin-card mt-2 overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Sản phẩm</th>
                      <th>Lô & Hạn dùng</th>
                      <th className="text-right">SL</th>
                      <th className="text-right">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeOrder.items.map((it) => (
                      <tr key={it.id}>
                        <td>
                          <div className="font-medium text-ink-primary">{it.name}</div>
                          <div className="text-[11.5px] text-ink-muted tabular-nums">
                            {it.sku} · {it.unitName} ({it.specificationLabel})
                          </div>
                        </td>
                        <td>
                          {it.allocations.length === 0 ? (
                            <span className="text-[12px] text-ink-muted">Tự động</span>
                          ) : (
                            <div className="space-y-1">
                              {it.allocations.map((al, idx) => (
                                <div
                                  key={idx}
                                  className="inline-block whitespace-nowrap rounded-md bg-[#F3F5FB] px-2 py-0.5 text-[11.5px] text-ink-primary tabular-nums"
                                >
                                  Lô <strong>{al.batchCode}</strong> · {formatDateVi(al.expDate)} (×
                                  {al.qty})
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap text-right font-medium tabular-nums">
                          {it.quantity}
                        </td>
                        <td className="whitespace-nowrap text-right font-semibold text-ink-primary tabular-nums">
                          {formatVnd(it.unitPrice * it.quantity)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex flex-col items-end space-y-1 text-[13px] tabular-nums">
                <div className="text-ink-muted">
                  Tạm tính:{" "}
                  <span className="font-medium text-ink-primary">
                    {formatVnd(activeOrder.subtotal)}
                  </span>
                </div>
                {voucherDiscountOnly > 0 && (
                  <div className="text-[#136C3E]">
                    Mã giảm giá ({activeOrder.voucherCode || "Voucher"}): -
                    {formatVnd(voucherDiscountOnly)}
                  </div>
                )}
                {pointsDiscount > 0 && (
                  <div className="text-pharma-600">
                    Đổi điểm tích lũy ({activeOrder.pointsRedeemed || Math.round(pointsDiscount / 1000)} điểm): -{formatVnd(pointsDiscount)}
                  </div>
                )}
                <div className="text-ink-muted">
                  Phí giao hàng:{" "}
                  <span className="font-medium text-ink-primary">
                    {activeOrder.shippingFee === 0
                      ? "Miễn phí"
                      : formatVnd(activeOrder.shippingFee)}
                  </span>
                </div>
                <div className="pt-0.5 text-[16px] font-bold text-pharma-600">
                  Tổng thanh toán: {formatVnd(activeOrder.totalAmount)}
                </div>
              </div>
            </div>

            {/* Operations Update Form */}
            <form
              id="order-detail-form"
              onSubmit={handleSaveSingleOrder}
              className="admin-card space-y-4 p-4"
            >
              <div className="flex items-center gap-2 text-[14px] font-semibold text-ink-primary">
                <Truck className="h-4 w-4 text-pharma-600" />
                <span>Xử lý trạng thái & Vận chuyển</span>
              </div>

              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <div>
                  <label className="block text-[12.5px] font-medium text-ink-secondary">
                    Trạng thái đơn hàng
                  </label>
                  <select
                    value={detailForm.status}
                    onChange={(e) =>
                      setDetailForm({ ...detailForm, status: e.target.value as OrderStatus })
                    }
                    className="mt-1 h-9 w-full pl-3"
                  >
                    <option value="pending">Chờ duyệt</option>
                    <option value="confirmed">Đã xác nhận (Đóng gói)</option>
                    <option value="shipping">Đang giao hàng</option>
                    <option value="completed">Hoàn thành</option>
                    <option value="cancelled">Hủy đơn (Hoàn tồn lô)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[12.5px] font-medium text-ink-secondary">
                    Trạng thái thu tiền
                  </label>
                  <select
                    value={detailForm.paymentStatus}
                    onChange={(e) =>
                      setDetailForm({
                        ...detailForm,
                        paymentStatus: e.target.value as "unpaid" | "paid" | "refunded",
                      })
                    }
                    className="mt-1 h-9 w-full pl-3"
                  >
                    <option value="unpaid">Chưa thanh toán</option>
                    <option value="paid">Đã thu tiền / Đã đối soát</option>
                    <option value="refunded">Đã hoàn tiền</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[12.5px] font-medium text-ink-secondary">
                    Đơn vị vận chuyển
                  </label>
                  <input
                    type="text"
                    value={detailForm.shippingCarrier}
                    onChange={(e) =>
                      setDetailForm({ ...detailForm, shippingCarrier: e.target.value })
                    }
                    className="mt-1 h-9 w-full px-3"
                  />
                </div>

                <div>
                  <label className="block text-[12.5px] font-medium text-ink-secondary">
                    Mã vận đơn
                  </label>
                  <input
                    type="text"
                    value={detailForm.trackingCode}
                    onChange={(e) =>
                      setDetailForm({ ...detailForm, trackingCode: e.target.value })
                    }
                    placeholder="VD: NSP-HT-88499"
                    className="mt-1 h-9 w-full px-3"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12.5px] font-medium text-ink-secondary">
                  Ghi chú đơn hàng
                </label>
                <input
                  type="text"
                  value={detailForm.note}
                  onChange={(e) => setDetailForm({ ...detailForm, note: e.target.value })}
                  placeholder="Ghi chú giao nhận hoặc hướng dẫn dùng thuốc..."
                  className="mt-1 h-9 w-full px-3"
                />
              </div>
            </form>

            {/* Return & Restock Panel */}
            {activeOrder.returnStatus !== "returned" && canApprove && (
              <div
                className="admin-card space-y-2.5 p-4"
                style={{ backgroundColor: "#FFFDFB" }}
              >
                <div className="flex items-center gap-2 text-[13.5px] font-semibold text-[#92400E]">
                  <RotateCcw className="h-4 w-4" />
                  <span>Hoàn trả & Nhập lại lô gốc</span>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    placeholder="Nhập lý do hoàn trả..."
                    className="h-9 flex-1 px-3 text-[13px]"
                  />
                  <button
                    type="button"
                    disabled={savingDetail}
                    onClick={handleProcessReturn}
                    className="btn-press h-9 shrink-0 whitespace-nowrap rounded-lg bg-[#FFEDEA] px-4 text-[12.5px] font-semibold text-[#831C1E] hover:bg-[#FADCD7]"
                  >
                    Xác nhận hoàn trả
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </SlideDrawer>

      {/* PRINTABLE GPP / GDP PACKING SLIP (Portaled to body for clean printing) */}
      {activeOrder &&
        typeof document !== "undefined" &&
        createPortal(
          <div id="nesphar-print-slip" className="hidden text-black">
            <div className="flex items-start justify-between border-b border-black pb-3">
              <div>
                <div className="text-[16px] font-bold">CÔNG TY TNHH DƯỢC PHẨM NESPHAR</div>
                <div className="text-[12px]">
                  MST: 3002297464 · Đ/c: Số 90 Đường Hà Hoàng, P. Trần Phú, Tỉnh Hà Tĩnh
                </div>
                <div className="text-[12px]">Hotline Dược sĩ: 0926.090.668 – 0978.420.766</div>
              </div>
              <div className="text-right">
                <div className="text-[15px] font-bold">PHIẾU XUẤT KHO KIÊM GIAO HÀNG (GPP/GDP)</div>
                <div className="text-[12px]">Mã đơn: #{activeOrder.code}</div>
                <div className="text-[12px]">Ngày lập: {activeOrder.createdAt}</div>
              </div>
            </div>

            <div className="mt-3 space-y-1 text-[12.5px]">
              <div>
                <strong>Khách hàng / Đơn vị nhận:</strong>{" "}
                {activeOrder.businessName || activeOrder.customerName} (SĐT:{" "}
                {activeOrder.address?.phone || activeOrder.customerPhone})
              </div>
              <div>
                <strong>Địa chỉ giao:</strong>{" "}
                {[
                  activeOrder.address?.street,
                  activeOrder.address?.ward,
                  activeOrder.address?.district,
                  activeOrder.address?.province,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </div>
            </div>

            <table className="mt-4 w-full border border-black text-[12px]">
              <thead>
                <tr>
                  <th className="border border-black p-1.5">SKU</th>
                  <th className="border border-black p-1.5">Tên sản phẩm & Quy cách</th>
                  <th className="border border-black p-1.5">Số Lô & Hạn dùng (FEFO)</th>
                  <th className="border border-black p-1.5 text-right">SL</th>
                  <th className="border border-black p-1.5 text-right">Đơn giá</th>
                  <th className="border border-black p-1.5 text-right">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {activeOrder.items.map((it) => (
                  <tr key={it.id}>
                    <td className="border border-black p-1.5">{it.sku}</td>
                    <td className="border border-black p-1.5">
                      {it.name} ({it.unitName})
                    </td>
                    <td className="border border-black p-1.5">
                      {it.allocations
                        .map((a) => `${a.batchCode} (HSD ${formatDateVi(a.expDate)})`)
                        .join(", ")}
                    </td>
                    <td className="border border-black p-1.5 text-right">{it.quantity}</td>
                    <td className="border border-black p-1.5 text-right">
                      {formatVnd(it.unitPrice)}
                    </td>
                    <td className="border border-black p-1.5 text-right">
                      {formatVnd(it.unitPrice * it.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-3 text-right text-[13px] font-bold">
              Tổng thanh toán: {formatVnd(activeOrder.totalAmount)} (
              {PAYMENT_LABELS[activeOrder.paymentMethod] || activeOrder.paymentMethod})
            </div>

            <div className="mt-8 grid grid-cols-3 text-center text-[12px]">
              <div>
                <strong>Thủ kho GSP</strong>
                <div className="mt-12">(Ký, ghi rõ họ tên)</div>
              </div>
              <div>
                <strong>Dược sĩ kiểm soát</strong>
                <div className="mt-12">(Ký, ghi rõ họ tên)</div>
              </div>
              <div>
                <strong>Người nhận đồng kiểm</strong>
                <div className="mt-12">(Ký xác nhận đủ Lô & nguyên tem)</div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* PORTALED QUICK WHOLESALE / POS ORDER CREATOR MODAL */}
      <ModalDialog
        open={posOpen}
        onClose={() => setPosOpen(false)}
        widthClass="max-w-2xl"
        title="Tạo đơn sỉ / Bán tại quầy"
        subtitle="Tự động áp mức chiết khấu theo khách hàng và phân bổ lô hạn gần nhất"
        footer={
          <>
            <button
              type="button"
              onClick={() => setPosOpen(false)}
              className="h-9 rounded-xl border border-borderline bg-white px-4 text-[13px] font-medium text-ink-secondary hover:bg-frame"
            >
              Hủy
            </button>
            <button
              type="submit"
              form="pos-order-form"
              disabled={creatingPos || posItems.length === 0}
              className="btn-press h-9 rounded-xl bg-pharma-600 px-5 text-[13px] font-semibold text-white hover:bg-pharma-700 disabled:opacity-50"
            >
              {creatingPos ? "Đang tạo đơn..." : "Tạo đơn & Xuất lô"}
            </button>
          </>
        }
      >
        <form id="pos-order-form" onSubmit={handleCreatePosOrder} className="space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-ink-secondary">
              Khách hàng / Nhà thuốc
            </label>
            <select
              value={posCustomerId}
              onChange={(e) => setPosCustomerId(e.target.value)}
              className="mt-1 h-10 w-full pl-3"
            >
              {posCustomers.map((c) => {
                const tm = TIER_META[c.customerTier] || TIER_META.retail;
                return (
                  <option key={c.id} value={c.id}>
                    {c.businessName || c.name} ({c.phone}) — {tm.shortLabel}
                    {c.customDiscountPercent !== null
                      ? ` [-${c.customDiscountPercent}%]`
                      : ""}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-ink-secondary">
                Sản phẩm xuất kho ({posItems.length})
              </span>
              <button
                type="button"
                onClick={() => {
                  const p0 = posProducts[0];
                  if (!p0) return;
                  setPosItems([
                    ...posItems,
                    {
                      productId: p0.id,
                      unitOptionId: p0.unitOptions[0]?.id || "u-base",
                      quantity: 1,
                    },
                  ]);
                }}
                className="inline-flex items-center gap-1 text-[13px] font-semibold text-pharma-600 hover:underline"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Thêm sản phẩm</span>
              </button>
            </div>

            <div className="mt-2 space-y-2">
              {posItems.map((line, idx) => {
                const selectedProd =
                  posProducts.find((p) => p.id === line.productId) || posProducts[0];
                const units = selectedProd?.unitOptions || [];
                return (
                  <div
                    key={idx}
                    className="admin-subtle-panel grid grid-cols-12 items-center gap-2 p-2.5"
                  >
                    <select
                      value={line.productId}
                      onChange={(e) => {
                        const np = posProducts.find((p) => p.id === e.target.value);
                        const next = [...posItems];
                        next[idx] = {
                          productId: e.target.value,
                          unitOptionId: np?.unitOptions[0]?.id || "u-base",
                          quantity: line.quantity,
                        };
                        setPosItems(next);
                      }}
                      className="col-span-12 h-9 pl-2.5 text-[13px] sm:col-span-7"
                    >
                      {posProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          [{p.sku}] {p.name} (Tồn: {p.stock.availableStock})
                        </option>
                      ))}
                    </select>

                    <select
                      value={line.unitOptionId}
                      onChange={(e) => {
                        const next = [...posItems];
                        next[idx] = { ...line, unitOptionId: e.target.value };
                        setPosItems(next);
                      }}
                      className="col-span-6 h-9 pl-2.5 text-[13px] sm:col-span-2"
                    >
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.multiplier > 1
                            ? `${u.unitName} (×${u.multiplier})`
                            : u.unitName}
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) => {
                        const next = [...posItems];
                        next[idx] = {
                          ...line,
                          quantity: Math.max(1, Number(e.target.value) || 1),
                        };
                        setPosItems(next);
                      }}
                      className="col-span-4 h-9 px-2.5 text-right text-[13px] tabular-nums sm:col-span-2"
                    />

                    <button
                      type="button"
                      disabled={posItems.length <= 1}
                      onClick={() => setPosItems(posItems.filter((_, i) => i !== idx))}
                      className="col-span-2 flex h-9 items-center justify-center rounded-lg text-ink-muted hover:text-[#B42318] disabled:opacity-30 sm:col-span-1"
                      aria-label="Xóa dòng"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[13px] font-medium text-ink-secondary">
                Hình thức thanh toán
              </label>
              <select
                value={posPaymentMethod}
                onChange={(e) => setPosPaymentMethod(e.target.value as "cod" | "vietqr")}
                className="mt-1 h-10 w-full pl-3"
              >
                <option value="vietqr">Chuyển khoản VietQR</option>
                <option value="cod">Tiền mặt (COD)</option>
              </select>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-ink-secondary">
                Trạng thái thu tiền
              </label>
              <select
                value={posPaymentStatus}
                onChange={(e) => setPosPaymentStatus(e.target.value as "unpaid" | "paid")}
                className="mt-1 h-10 w-full pl-3"
              >
                <option value="unpaid">Chưa thanh toán / Công nợ</option>
                <option value="paid">Đã thu đủ tiền</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-medium text-ink-secondary">
              Ghi chú đơn hàng
            </label>
            <input
              type="text"
              value={posNote}
              onChange={(e) => setPosNote(e.target.value)}
              placeholder="VD: Xuất kèm hóa đơn GTGT nhà thuốc..."
              className="mt-1 h-10 w-full px-3"
            />
          </div>
        </form>
      </ModalDialog>
    </div>
  );
};
