import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Clock,
  Download,
  Lock,
  LockOpen,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { apiRequest, downloadAdminCsv } from "../api/client";
import { ModalDialog } from "../components/OverlayPortal";
import { useAuth } from "../context/AuthContext";
import { AdminProduct, InventoryBatch, InventoryMovement } from "../types";
import { formatDateTimeVi, formatDateVi, formatVnd } from "../utils/format";

type InvTab = "batches" | "alerts" | "movements";
type BatchFilter = "all" | "healthy" | "near_expiry" | "quarantined_expired";

interface ProductAlertItem {
  productId: string;
  sku: string;
  name: string;
  baseUnit: string;
  minStockAlert: number;
  availableStock: number;
  nearExpiryStock: number;
  nearestExpDate: string | null;
}

export const InventoryBatchesPage: React.FC = () => {
  const { hasPermission, showToast } = useAuth();
  const [searchParams] = useSearchParams();
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [productAlerts, setProductAlerts] = useState<ProductAlertItem[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [thresholdDays, setThresholdDays] = useState(90);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<InvTab>(
    () => (searchParams.get("tab") as InvTab) || "batches"
  );
  const [batchFilter, setBatchFilter] = useState<BatchFilter>(
    () => (searchParams.get("filter") as BatchFilter) || "all"
  );
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q") || "");

  useEffect(() => {
    const t = searchParams.get("tab") as InvTab | null;
    const f = searchParams.get("filter") as BatchFilter | null;
    const q = searchParams.get("q");
    if (t && ["batches", "alerts", "movements"].includes(t)) setTab(t);
    if (f && ["all", "healthy", "near_expiry", "quarantined_expired"].includes(f)) {
      setBatchFilter(f);
    }
    if (q !== null) setSearchQuery(q);
  }, [searchParams]);

  // Import Batch Modal
  const [importOpen, setImportOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [importForm, setImportForm] = useState({
    productId: "",
    batchCode: "",
    mfgDate: new Date().toISOString().slice(0, 10),
    expDate: "2028-11-14",
    costPrice: 110000,
    initialQty: 100,
    shelfLocation: "Kệ A1-03 (Mát <30°C)",
    supplierInvoice: "",
  });

  // Adjust Batch Modal
  const [adjustTarget, setAdjustTarget] = useState<InventoryBatch | null>(null);
  const [adjustForm, setAdjustForm] = useState({
    remainingQty: 0,
    shelfLocation: "",
    status: "active" as "active" | "quarantined",
    reason: "Kiểm kê định kỳ tại kệ",
  });

  const canManage = hasPermission("manage_inventory");

  const loadInventory = async () => {
    setLoading(true);
    try {
      const [invRes, prodRes] = await Promise.all([
        apiRequest<{
          nearExpiryThresholdDays: number;
          batches: InventoryBatch[];
          movements: InventoryMovement[];
          productAlerts: ProductAlertItem[];
        }>("/inventory/overview"),
        apiRequest<{ products: AdminProduct[] }>("/products"),
      ]);
      setThresholdDays(invRes.nearExpiryThresholdDays);
      setBatches(invRes.batches);
      setMovements(invRes.movements);
      setProductAlerts(invRes.productAlerts);
      setProducts(prodRes.products);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Không thể tải dữ liệu kho", "negative");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, []);

  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      if (batchFilter === "healthy" && b.expiryState !== "healthy") return false;
      if (batchFilter === "near_expiry" && b.expiryState !== "near_expiry") return false;
      if (
        batchFilter === "quarantined_expired" &&
        b.expiryState !== "expired" &&
        b.expiryState !== "quarantined"
      ) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          b.batchCode.toLowerCase().includes(q) ||
          b.productSku.toLowerCase().includes(q) ||
          b.productName.toLowerCase().includes(q) ||
          b.shelfLocation.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [batches, batchFilter, searchQuery]);

  const openImportForProduct = (productId?: string) => {
    const chosen = products.find((p) => p.id === productId) || products[0];
    setImportForm({
      productId: chosen?.id || "",
      batchCode: `LO-${new Date().getFullYear().toString().slice(-2)}${String(
        new Date().getMonth() + 1
      ).padStart(2, "0")}-${Math.floor(10 + Math.random() * 89)}`,
      mfgDate: new Date().toISOString().slice(0, 10),
      expDate: "2028-11-15",
      costPrice: chosen?.costPrice || 100000,
      initialQty: 100,
      shelfLocation: "Kệ A2-02 (<30°C)",
      supplierInvoice: `HD-${Math.floor(1000 + Math.random() * 9000)}`,
    });
    setImportOpen(true);
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiRequest("/inventory/batches", {
        method: "POST",
        body: JSON.stringify(importForm),
      });
      showToast(`Đã nhập lô mới ${importForm.batchCode}`);
      setImportOpen(false);
      await loadInventory();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Nhập lô thất bại", "negative");
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickQuarantineToggle = async (b: InventoryBatch) => {
    if (!canManage) {
      showToast("Tài khoản của bạn không có quyền quản lý kho.", "negative");
      return;
    }
    const nextStatus = b.status === "quarantined" ? "active" : "quarantined";
    try {
      await apiRequest(`/inventory/batches/${b.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: nextStatus,
          reason:
            nextStatus === "quarantined"
              ? "Khóa xuất bán lô trên Mini App"
              : "Mở khóa xuất bán lô",
        }),
      });
      showToast(
        nextStatus === "quarantined"
          ? `Đã khóa lô ${b.batchCode}`
          : `Đã mở khóa lô ${b.batchCode}`
      );
      await loadInventory();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Không thể cập nhật lô", "negative");
    }
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTarget) return;
    setSubmitting(true);
    try {
      await apiRequest(`/inventory/batches/${adjustTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify(adjustForm),
      });
      showToast(`Đã lưu kiểm kê lô ${adjustTarget.batchCode}`);
      setAdjustTarget(null);
      await loadInventory();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Cập nhật kiểm kê thất bại", "negative");
    } finally {
      setSubmitting(false);
    }
  };

  const nearExpiryCount = batches.filter(
    (b) => b.expiryState === "near_expiry" && b.remainingQty > 0
  ).length;
  const expiredOrQuarantinedCount = batches.filter(
    (b) =>
      (b.expiryState === "expired" || b.expiryState === "quarantined") &&
      b.remainingQty > 0
  ).length;
  const healthyCount = batches.filter(
    (b) => b.expiryState === "healthy" && b.remainingQty > 0
  ).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <h1 className="text-[22px] font-bold text-ink-primary">Kho & Lô hạn</h1>

        <div className="flex flex-wrap items-center gap-2">
          {hasPermission("export_data") && (
            <>
              <button
                type="button"
                onClick={() => downloadAdminCsv("batches")}
                className="btn-press inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl border border-borderline bg-white px-3 text-[13px] font-medium text-ink-secondary hover:bg-frame"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Xuất Lô CSV</span>
              </button>
              <button
                type="button"
                onClick={() => downloadAdminCsv("movements")}
                className="btn-press inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl border border-borderline bg-white px-3 text-[13px] font-medium text-ink-secondary hover:bg-frame"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Thẻ kho CSV</span>
              </button>
            </>
          )}
          {canManage && (
            <button
              type="button"
              onClick={() => openImportForProduct()}
              className="btn-press inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl bg-gradient-to-r from-[#3E4095] to-[#2F317B] px-4 text-[13px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(62,64,149,0.55)] hover:from-[#343683] hover:to-[#252766]"
            >
              <Plus className="h-4 w-4" />
              <span>Nhập lô mới</span>
            </button>
          )}
        </div>
      </div>

      {/* Interactive Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => {
            setTab("batches");
            setBatchFilter("healthy");
          }}
          className={`admin-card anim-kpi-interactive flex items-center justify-between p-4 text-left ${
            tab === "batches" && batchFilter === "healthy"
              ? "border-[#136C3E] ring-1 ring-[#136C3E]/20"
              : ""
          }`}
        >
          <div>
            <div className="text-[12px] font-medium text-ink-muted">Đạt chuẩn</div>
            <div className="mt-1 text-[23px] font-bold text-[#136C3E] tabular-nums">
              {healthyCount}
            </div>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E8F8EE] text-[#136C3E]">
            <CheckCircle2 className="h-[18px] w-[18px]" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setTab("batches");
            setBatchFilter("near_expiry");
          }}
          className={`admin-card anim-kpi-interactive flex items-center justify-between p-4 text-left ${
            tab === "batches" && batchFilter === "near_expiry"
              ? "border-[#D97706] ring-1 ring-[#D97706]/25"
              : ""
          }`}
        >
          <div>
            <div className="text-[12px] font-medium text-ink-muted">
              Cận hạn (&le; {thresholdDays} ngày)
            </div>
            <div className="mt-1 text-[23px] font-bold text-[#B45309] tabular-nums">
              {nearExpiryCount}
            </div>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF6E5] text-[#B45309]">
            <Clock className="h-[18px] w-[18px]" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setTab("batches");
            setBatchFilter("quarantined_expired");
          }}
          className={`admin-card anim-kpi-interactive flex items-center justify-between p-4 text-left ${
            tab === "batches" && batchFilter === "quarantined_expired"
              ? "border-[#DC2626] ring-1 ring-[#DC2626]/25"
              : ""
          }`}
        >
          <div>
            <div className="text-[12px] font-medium text-ink-muted">Hết hạn / Đã khóa</div>
            <div className="mt-1 text-[23px] font-bold text-[#B42318] tabular-nums">
              {expiredOrQuarantinedCount}
            </div>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFECEB] text-[#B42318]">
            <Lock className="h-[18px] w-[18px]" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab("alerts")}
          className={`admin-card anim-kpi-interactive flex items-center justify-between p-4 text-left ${
            tab === "alerts" ? "border-pharma-600 ring-1 ring-pharma-600/20" : ""
          }`}
        >
          <div>
            <div className="text-[12px] font-medium text-ink-muted">Sắp hết tồn</div>
            <div className="mt-1 text-[23px] font-bold text-ink-primary tabular-nums">
              {productAlerts.length}
            </div>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EEF0FD] text-pharma-600">
            <Boxes className="h-[18px] w-[18px]" />
          </span>
        </button>
      </div>

      {/* Main White Card */}
      <div className="admin-card space-y-4 p-5">
        <div className="overflow-x-auto">
          <div className="admin-tabs">
            {[
              { id: "batches" as InvTab, label: `Danh sách lô (${batches.length})` },
              {
                id: "alerts" as InvTab,
                label: `Sắp hết hàng (${productAlerts.length})`,
              },
              {
                id: "movements" as InvTab,
                label: `Lịch sử xuất nhập (${movements.length})`,
              },
            ].map((t) => (
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

        {/* TAB 1: BATCHES LIST */}
        {tab === "batches" && (
          <div className="space-y-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative w-full sm:w-[290px]">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm mã lô, SKU, tên thuốc, vị trí kệ..."
                    className="h-9 w-full pl-9 pr-3 text-[13.5px]"
                  />
                </div>

                <select
                  value={batchFilter}
                  onChange={(e) => setBatchFilter(e.target.value as BatchFilter)}
                  className="h-9 pl-3 text-[13.5px]"
                >
                  <option value="all">Tất cả hạn dùng</option>
                  <option value="near_expiry">Cận hạn (&le; {thresholdDays} ngày)</option>
                  <option value="quarantined_expired">Hết hạn / Đang khóa</option>
                  <option value="healthy">Dài hạn đạt chuẩn</option>
                </select>
              </div>

              <div className="text-[13px] text-ink-muted tabular-nums">
                {filteredBatches.length} lô hàng
              </div>
            </div>

            <div className="table-shell">
              {loading ? (
                <div className="py-12 text-center text-[13.5px] text-ink-muted">
                  Đang tải danh sách lô hàng...
                </div>
              ) : filteredBatches.length === 0 ? (
                <div className="py-12 text-center text-[13.5px] text-ink-muted">
                  Không có lô hàng phù hợp.
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Mã lô & Vị trí</th>
                      <th>Sản phẩm</th>
                      <th>Hạn sử dụng</th>
                      <th>Tình trạng</th>
                      <th className="text-right">Giá nhập</th>
                      <th className="text-right">Tồn lô</th>
                      <th className="text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="anim-rows">
                    {filteredBatches.map((b) => {
                      let pillStyle = {
                        bg: "#E8F8EE",
                        ink: "#136C3E",
                        text: `Còn ${b.daysLeft} ngày`,
                      };
                      if (b.status === "quarantined") {
                        pillStyle = {
                          bg: "#FFECEB",
                          ink: "#B42318",
                          text:
                            b.daysLeft < 0
                              ? `Đã khóa · Quá ${Math.abs(b.daysLeft)}d`
                              : "Đang khóa bán",
                        };
                      } else if (b.daysLeft < 0) {
                        pillStyle = {
                          bg: "#FFECEB",
                          ink: "#B42318",
                          text: `Quá hạn ${Math.abs(b.daysLeft)} ngày`,
                        };
                      } else if (b.expiryState === "near_expiry") {
                        pillStyle = {
                          bg: "#FFF6E5",
                          ink: "#9A5B00",
                          text: `Cận hạn: ${b.daysLeft} ngày`,
                        };
                      }

                      return (
                        <tr key={b.id}>
                          <td className="whitespace-nowrap">
                            <code className="text-[13px] font-semibold text-pharma-600">
                              {b.batchCode}
                            </code>
                            <div className="mt-0.5 text-[11.5px] text-ink-muted">
                              {b.shelfLocation || "Kho chính"}
                            </div>
                          </td>

                          <td>
                            <div className="max-w-[260px] line-clamp-1 font-semibold text-ink-primary">
                              {b.productName}
                            </div>
                            <div className="max-w-[260px] truncate text-[11.5px] text-ink-muted tabular-nums">
                              {b.productSku}
                              {b.registrationNo ? ` · ${b.registrationNo}` : ""}
                            </div>
                          </td>

                          <td className="whitespace-nowrap text-[12.5px] text-ink-secondary tabular-nums">
                            <div className="font-semibold text-ink-primary">
                              {formatDateVi(b.expDate)}
                            </div>
                            <div className="text-[11px] text-ink-muted">
                              NSX {formatDateVi(b.mfgDate)}
                            </div>
                          </td>

                          <td>
                            <span
                              className="inline-block whitespace-nowrap rounded-lg px-2.5 py-1 text-[11.5px] font-medium tabular-nums"
                              style={{ backgroundColor: pillStyle.bg, color: pillStyle.ink }}
                            >
                              {pillStyle.text}
                            </span>
                          </td>

                          <td className="whitespace-nowrap text-right text-[13px] text-ink-secondary tabular-nums">
                            {formatVnd(b.costPrice)}
                          </td>

                          <td className="whitespace-nowrap text-right tabular-nums">
                            <div>
                              <span className="font-semibold text-ink-primary">{b.remainingQty}</span>
                              <span className="text-[11.5px] text-ink-muted">
                                /{b.initialQty} {b.baseUnit}
                              </span>
                            </div>
                            <div className="ml-auto mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-[#EAEFF8]">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    Math.max(
                                      b.remainingQty > 0 ? 6 : 0,
                                      Math.round((b.remainingQty / (b.initialQty || 1)) * 100)
                                    )
                                  )}%`,
                                  backgroundColor:
                                    b.remainingQty <= 5
                                      ? "#DC2626"
                                      : b.remainingQty / (b.initialQty || 1) <= 0.25
                                        ? "#F59E0B"
                                        : "#3E4095",
                                }}
                              />
                            </div>
                          </td>

                          <td className="whitespace-nowrap text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setAdjustTarget(b);
                                  setAdjustForm({
                                    remainingQty: b.remainingQty,
                                    shelfLocation: b.shelfLocation,
                                    status: b.status,
                                    reason: "Kiểm kê thực tế tại kệ",
                                  });
                                }}
                                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-pharma-600 hover:bg-[#EEF0FD]"
                              >
                                <SlidersHorizontal className="h-3.5 w-3.5" />
                                <span>Kiểm kê</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleQuickQuarantineToggle(b)}
                                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-ink-secondary hover:bg-[#F3F5FB]"
                              >
                                {b.status === "quarantined" ? (
                                  <>
                                    <LockOpen className="h-3.5 w-3.5 text-[#136C3E]" />
                                    <span>Mở khóa</span>
                                  </>
                                ) : (
                                  <>
                                    <Lock className="h-3.5 w-3.5 text-[#B42318]" />
                                    <span>Khóa lô</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: LOW STOCK ALERTS */}
        {tab === "alerts" && (
          <div className="overflow-x-auto">
            {productAlerts.length === 0 ? (
              <div className="py-12 text-center text-[13.5px] text-ink-muted">
                Tất cả sản phẩm đều đủ định mức tồn kho an toàn.
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Sản phẩm cần nhập</th>
                    <th className="text-right">Tồn khả dụng</th>
                    <th className="text-right">Định mức tối thiểu</th>
                    <th>HSD gần nhất</th>
                    <th className="text-right">Hành động</th>
                  </tr>
                </thead>
                <tbody className="anim-rows">
                  {productAlerts.map((item) => (
                    <tr key={item.productId}>
                      <td className="whitespace-nowrap">
                        <code className="text-[12.5px] font-semibold text-pharma-600">
                          {item.sku}
                        </code>
                      </td>
                      <td className="font-medium text-ink-primary">{item.name}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">
                        <span
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-semibold"
                          style={
                            item.availableStock === 0
                              ? { backgroundColor: "#FFECEB", color: "#B42318" }
                              : { backgroundColor: "#FFF6E5", color: "#9A5B00" }
                          }
                        >
                          <AlertTriangle className="h-3 w-3" />
                          <span>
                            {item.availableStock} {item.baseUnit}
                          </span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-right text-ink-muted tabular-nums">
                        {item.minStockAlert} {item.baseUnit}
                      </td>
                      <td className="whitespace-nowrap text-[13px] text-ink-secondary tabular-nums">
                        {item.nearestExpDate ? formatDateVi(item.nearestExpDate) : "Hết lô"}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => openImportForProduct(item.productId)}
                            className="btn-press rounded-lg bg-pharma-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-pharma-700"
                          >
                            + Nhập lô
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 3: STOCK LEDGER / MOVEMENTS */}
        {tab === "movements" && (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Loại giao dịch</th>
                  <th>Mã Lô</th>
                  <th>Sản phẩm</th>
                  <th className="text-right">Biến động</th>
                  <th className="text-right">Tồn sau GD</th>
                  <th>Diễn giải</th>
                  <th>Người thực hiện</th>
                </tr>
              </thead>
              <tbody className="anim-rows">
                {movements.map((m) => {
                  const isPos = m.qtyChange > 0;
                  const typeMap: Record<string, { label: string; bg: string; ink: string }> = {
                    IMPORT: { label: "Nhập lô", bg: "#E8F8EE", ink: "#136C3E" },
                    ORDER_EXPORT_FEFO: { label: "Xuất đơn", bg: "#EEF0FD", ink: "#3E4095" },
                    ORDER_RETURN: { label: "Hoàn trả", bg: "#FFF6E5", ink: "#9A5B00" },
                    ADJUSTMENT: { label: "Kiểm kê", bg: "#F1F3F8", ink: "#4A536D" },
                  };
                  const meta = typeMap[m.movementType] || typeMap.ADJUSTMENT;
                  return (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap text-[12.5px] text-ink-muted tabular-nums">
                        {formatDateTimeVi(m.createdAt)}
                      </td>
                      <td>
                        <span
                          className="inline-block whitespace-nowrap rounded-lg px-2.5 py-0.5 text-[11.5px] font-medium"
                          style={{ backgroundColor: meta.bg, color: meta.ink }}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap">
                        <code className="text-[12.5px] font-semibold text-pharma-600">
                          {m.batchCode}
                        </code>
                      </td>
                      <td className="max-w-[220px] line-clamp-1 font-medium text-ink-primary">
                        {m.productName}
                      </td>
                      <td
                        className="whitespace-nowrap text-right font-semibold tabular-nums"
                        style={{ color: isPos ? "#136C3E" : "#B42318" }}
                      >
                        {isPos ? `+${m.qtyChange}` : m.qtyChange}
                      </td>
                      <td className="whitespace-nowrap text-right text-ink-secondary tabular-nums">
                        {m.balanceAfter}
                      </td>
                      <td className="max-w-[260px] text-[12.5px] text-ink-secondary">{m.note}</td>
                      <td className="whitespace-nowrap text-[12.5px] text-ink-muted">
                        {m.performedBy}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* PORTALED MODAL: IMPORT NEW BATCH */}
      <ModalDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        widthClass="max-w-xl"
        title="Nhập lô hàng mới"
        footer={
          <>
            <button
              type="button"
              onClick={() => setImportOpen(false)}
              className="h-9 rounded-xl border border-borderline bg-white px-4 text-[13px] font-medium text-ink-secondary hover:bg-frame"
            >
              Đóng
            </button>
            <button
              type="submit"
              form="import-batch-form"
              disabled={submitting}
              className="btn-press h-9 rounded-xl bg-pharma-600 px-5 text-[13px] font-semibold text-white hover:bg-pharma-700 disabled:opacity-60"
            >
              {submitting ? "Đang lưu..." : "Xác nhận nhập lô"}
            </button>
          </>
        }
      >
        <form id="import-batch-form" onSubmit={handleImportSubmit} className="space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-ink-secondary">
              Sản phẩm nhập kho *
            </label>
            <select
              required
              value={importForm.productId}
              onChange={(e) => {
                const p = products.find((item) => item.id === e.target.value);
                setImportForm({
                  ...importForm,
                  productId: e.target.value,
                  costPrice: p?.costPrice || importForm.costPrice,
                });
              }}
              className="mt-1 h-9 w-full pl-3"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.sku}] {p.name} ({p.baseUnit})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[13px] font-medium text-ink-secondary">
                Mã số lô (Batch/Lot) *
              </label>
              <input
                type="text"
                required
                value={importForm.batchCode}
                onChange={(e) =>
                  setImportForm({ ...importForm, batchCode: e.target.value.toUpperCase() })
                }
                className="mt-1 h-9 w-full px-3"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-ink-secondary">
                Số hóa đơn NCC
              </label>
              <input
                type="text"
                value={importForm.supplierInvoice}
                onChange={(e) =>
                  setImportForm({ ...importForm, supplierInvoice: e.target.value })
                }
                className="mt-1 h-9 w-full px-3"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[13px] font-medium text-ink-secondary">
                Ngày sản xuất (NSX) *
              </label>
              <input
                type="date"
                required
                value={importForm.mfgDate}
                onChange={(e) => setImportForm({ ...importForm, mfgDate: e.target.value })}
                className="mt-1 h-9 w-full px-3"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-ink-secondary">
                Hạn sử dụng (HSD) *
              </label>
              <input
                type="date"
                required
                value={importForm.expDate}
                onChange={(e) => setImportForm({ ...importForm, expDate: e.target.value })}
                className="mt-1 h-9 w-full px-3"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-[13px] font-medium text-ink-secondary">
                Số lượng *
              </label>
              <input
                type="number"
                min={1}
                required
                value={importForm.initialQty}
                onChange={(e) =>
                  setImportForm({ ...importForm, initialQty: Number(e.target.value) })
                }
                className="mt-1 h-9 w-full px-3 tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-ink-secondary">
                Giá nhập (đ)
              </label>
              <input
                type="number"
                min={0}
                value={importForm.costPrice}
                onChange={(e) =>
                  setImportForm({ ...importForm, costPrice: Number(e.target.value) })
                }
                className="mt-1 h-9 w-full px-3 tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-ink-secondary">
                Vị trí kệ
              </label>
              <input
                type="text"
                value={importForm.shelfLocation}
                onChange={(e) =>
                  setImportForm({ ...importForm, shelfLocation: e.target.value })
                }
                className="mt-1 h-9 w-full px-3"
              />
            </div>
          </div>
        </form>
      </ModalDialog>

      {/* PORTALED MODAL: ADJUST / AUDIT BATCH */}
      <ModalDialog
        open={Boolean(adjustTarget)}
        onClose={() => setAdjustTarget(null)}
        widthClass="max-w-md"
        title={
          adjustTarget && (
            <span>
              Kiểm kê lô <code className="text-pharma-600">{adjustTarget.batchCode}</code>
            </span>
          )
        }
        subtitle={adjustTarget?.productName}
        footer={
          <>
            <button
              type="button"
              onClick={() => setAdjustTarget(null)}
              className="h-9 rounded-xl border border-borderline bg-white px-4 text-[13px] font-medium text-ink-secondary hover:bg-frame"
            >
              Hủy
            </button>
            {canManage && (
              <button
                type="submit"
                form="adjust-batch-form"
                disabled={submitting}
                className="btn-press h-9 rounded-xl bg-pharma-600 px-5 text-[13px] font-semibold text-white hover:bg-pharma-700 disabled:opacity-60"
              >
                Lưu kiểm kê
              </button>
            )}
          </>
        }
      >
        {adjustTarget && (
          <form id="adjust-batch-form" onSubmit={handleAdjustSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[13px] font-medium text-ink-secondary">
                  Tồn thực tế ({adjustTarget.baseUnit})
                </label>
                <input
                  type="number"
                  min={0}
                  value={adjustForm.remainingQty}
                  onChange={(e) =>
                    setAdjustForm({ ...adjustForm, remainingQty: Number(e.target.value) })
                  }
                  className="mt-1 h-9 w-full px-3 tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-ink-secondary">
                  Trạng thái lô
                </label>
                <select
                  value={adjustForm.status}
                  onChange={(e) =>
                    setAdjustForm({
                      ...adjustForm,
                      status: e.target.value as "active" | "quarantined",
                    })
                  }
                  className="mt-1 h-9 w-full pl-3"
                >
                  <option value="active">Đang mở bán</option>
                  <option value="quarantined">Khóa bán (Biệt trữ)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-ink-secondary">
                Vị trí kệ
              </label>
              <input
                type="text"
                value={adjustForm.shelfLocation}
                onChange={(e) =>
                  setAdjustForm({ ...adjustForm, shelfLocation: e.target.value })
                }
                className="mt-1 h-9 w-full px-3"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-ink-secondary">
                Lý do điều chỉnh *
              </label>
              <input
                type="text"
                required
                value={adjustForm.reason}
                onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                className="mt-1 h-9 w-full px-3"
              />
            </div>
          </form>
        )}
      </ModalDialog>
    </div>
  );
};
