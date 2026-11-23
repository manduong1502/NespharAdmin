import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  Building2,
  Download,
  Package,
  Plus,
  Receipt,
  ShoppingBasket,
  TrendingUp,
  Users,
} from "lucide-react";
import { apiRequest, downloadAdminCsv } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { AdminOrder, CustomerTier } from "../types";
import {
  formatCompactVnd,
  formatDateTimeVi,
  formatDateVi,
  formatVnd,
  ORDER_STATUS_PILL,
  TIER_META,
} from "../utils/format";

interface DailyPoint {
  date: string;
  label: string;
  revenue: number;
  orderCount: number;
  b2bRevenue: number;
}

interface TopProductRow {
  productId: string;
  sku: string;
  name: string;
  imageUrl?: string;
  retailPrice?: number;
  isVisible?: boolean;
  minStockAlert?: number;
  baseUnitsSold: number;
  revenue: number;
  availableStock: number;
}

interface CategoryCountRow {
  id: string;
  name: string;
  shortName: string;
  count: number;
}

interface DashboardResponse {
  kpis: {
    netRevenue: number;
    todayRevenue?: number;
    todayOrdersCount?: number;
    estimatedCost: number;
    estimatedGrossProfit: number;
    grossMarginPct: number;
    validOrdersCount: number;
    totalOrdersCount: number;
    pendingOrdersCount: number;
    b2bRevenue: number;
    b2cRevenue: number;
    b2bSharePct: number;
    averageOrderValue: number;
    nearExpiryCount: number;
    lowStockCount: number;
    openTicketCount: number;
    totalCustomersCount?: number;
    totalProductsCount?: number;
    rxProductsCount?: number;
  };
  categoryCounts?: CategoryCountRow[];
  dailySeries: DailyPoint[];
  topProducts: TopProductRow[];
}

type ProductSortKey = "best_sell" | "top_earning" | "low_stock";

function formatShortWeekday(dateIso: string, fallback: string): string {
  const parts = dateIso.split("-");
  if (parts.length !== 3) return fallback;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(d.getTime())) return fallback;
  const names = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  return `${d.getDate()} ${names[d.getDay()]}`;
}

/** Smooth monotonic-clamped cubic Bezier SVG path so curves stay inside [minY, maxY] */
function buildSmoothPath(
  points: Array<{ x: number; y: number }>,
  baselineY: number
): { linePath: string; areaPath: string } {
  if (points.length === 0) return { linePath: "", areaPath: "" };
  if (points.length === 1) {
    const p = points[0];
    return {
      linePath: `M ${p.x} ${p.y}`,
      areaPath: `M ${p.x} ${baselineY} L ${p.x} ${p.y} L ${p.x} ${baselineY} Z`,
    };
  }
  const segs: string[] = [`M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dx = (p1.x - p0.x) * 0.42;
    const cp1x = p0.x + dx;
    const cp1y = p0.y;
    const cp2x = p1.x - dx;
    const cp2y = p1.y;
    segs.push(
      `C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`
    );
  }
  const linePath = segs.join(" ");
  const last = points[points.length - 1];
  const first = points[0];
  const areaPath = `${linePath} L ${last.x.toFixed(1)} ${baselineY.toFixed(1)} L ${first.x.toFixed(1)} ${baselineY.toFixed(1)} Z`;
  return { linePath, areaPath };
}

function useAnimatedInt(target: number, durationMs = 520): number {
  const [val, setVal] = useState(target);
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setVal(target);
      return;
    }
    const startVal = val;
    const diff = target - startVal;
    if (diff === 0) return;
    let rafId = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - Math.pow(1 - p, 4);
      setVal(Math.round(startVal + diff * eased));
      if (p < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [target, durationMs]);
  return val;
}

const ProductThumb: React.FC<{ src?: string; alt: string }> = ({ src, alt }) => {
  const [broken, setBroken] = useState(false);
  return (
    <div className="anim-thumb flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-[#ECEFF7] bg-[#F7F9FE] p-1">
      {src && !broken ? (
        <img
          src={src}
          alt={alt}
          onError={() => setBroken(true)}
          className="h-full w-full object-contain"
        />
      ) : (
        <Package className="h-4 w-4 text-ink-muted" />
      )}
    </div>
  );
};

const CAT_BAR_COLORS = ["#3E4095", "#0D9488", "#6366F1", "#F59E0B", "#64748B"];

export const OverviewReportsPage: React.FC = () => {
  const { hasPermission, showToast } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [recentOrders, setRecentOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<ProductSortKey>("best_sell");

  const periodDays = searchParams.get("days") === "14" ? 14 : 7;

  const setPeriodDays = (d: 7 | 14) => {
    const next = new URLSearchParams(searchParams);
    if (d === 7) next.delete("days");
    else next.set("days", "14");
    setSearchParams(next, { replace: true });
  };

  const loadDashboard = async () => {
    setLoading(true);
    setError("");
    try {
      const [dashRes, ordRes] = await Promise.all([
        apiRequest<DashboardResponse>("/dashboard"),
        apiRequest<{ orders: AdminOrder[] }>("/orders").catch(() => ({ orders: [] })),
      ]);
      setData(dashRes);
      setRecentOrders((ordRes.orders || []).slice(0, 4));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải dữ liệu.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const visibleSeries = useMemo(() => {
    const all = data?.dailySeries || [];
    return periodDays === 7 ? all.slice(-7) : all;
  }, [data, periodDays]);

  const rawPeriodRevenue = useMemo(
    () => visibleSeries.reduce((s, d) => s + d.revenue, 0),
    [visibleSeries]
  );
  const rawTodayRevenue =
    data?.kpis.todayRevenue ?? visibleSeries[visibleSeries.length - 1]?.revenue ?? 0;

  const animPeriodRev = useAnimatedInt(rawPeriodRevenue);
  const animTodayRev = useAnimatedInt(rawTodayRevenue);
  const animNetRev = useAnimatedInt(data?.kpis.netRevenue ?? 0);
  const animOrders = useAnimatedInt(data?.kpis.validOrdersCount ?? 0, 420);
  const animCustomers = useAnimatedInt(data?.kpis.totalCustomersCount ?? 0, 420);

  const chartGeometry = useMemo(() => {
    const pts = visibleSeries;
    const width = 680;
    const height = 220;
    const padLeft = 48;
    const padRight = 18;
    const padTop = 18;
    const padBottom = 30;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;
    const baselineY = height - padBottom;

    const maxVal = Math.max(
      ...pts.map((p) => Math.max(Number(p.revenue || 0), Number(p.b2bRevenue || 0))),
      1_000_000
    );
    const step =
      maxVal <= 3_000_000
        ? 1_000_000
        : maxVal <= 9_000_000
          ? 3_000_000
          : Math.ceil(maxVal / 3 / 1_000_000) * 1_000_000;
    const niceMax = step * 3;

    const coords = pts.map((pt, i) => {
      const x =
        pts.length <= 1
          ? padLeft + plotW / 2
          : padLeft + (i / (pts.length - 1)) * plotW;
      const totalVal = Number(pt.revenue || 0);
      const b2bVal = Number(pt.b2bRevenue || 0);
      const yTotal = padTop + plotH - (totalVal / (niceMax || 1)) * plotH;
      const yB2b = padTop + plotH - (b2bVal / (niceMax || 1)) * plotH;
      return { x, yTotal, yB2b, totalVal, b2bVal, pt };
    });

    const totalPaths = buildSmoothPath(
      coords.map((c) => ({ x: c.x, y: c.yTotal })),
      baselineY
    );
    const b2bPaths = buildSmoothPath(
      coords.map((c) => ({ x: c.x, y: c.yB2b })),
      baselineY
    );

    const ticks = [0, 1, 2, 3].map((idx) => {
      const v = idx * step;
      const y = padTop + plotH - (idx / 3) * plotH;
      return { v, y };
    });

    return {
      width,
      height,
      padLeft,
      padRight,
      padTop,
      padBottom,
      plotW,
      plotH,
      baselineY,
      coords,
      ticks,
      totalPaths,
      b2bPaths,
    };
  }, [visibleSeries]);

  const sortedProducts = useMemo(() => {
    const rows = [...(data?.topProducts || [])];
    if (sortBy === "best_sell") {
      rows.sort((a, b) => b.baseUnitsSold - a.baseUnitsSold || b.revenue - a.revenue);
    } else if (sortBy === "top_earning") {
      rows.sort((a, b) => b.revenue - a.revenue);
    } else {
      rows.sort((a, b) => a.availableStock - b.availableStock);
    }
    return rows;
  }, [data, sortBy]);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          <div className="admin-card h-[340px] animate-pulse xl:col-span-7" />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:col-span-5">
            <div className="hero-pharma-card h-[160px] opacity-85" />
            <div className="admin-card h-[160px] animate-pulse" />
            <div className="admin-card h-[160px] animate-pulse" />
            <div className="admin-card h-[160px] animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          <div className="admin-card h-[260px] animate-pulse xl:col-span-5" />
          <div className="admin-card h-[260px] animate-pulse xl:col-span-7" />
        </div>
        <div className="admin-card h-[360px] animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="admin-card p-8 text-center">
        <p className="text-[14px] font-medium text-[#B42318]">
          {error || "Không có dữ liệu."}
        </p>
        <button
          type="button"
          onClick={loadDashboard}
          className="btn-press mt-3 rounded-xl bg-pharma-600 px-4 py-2 text-[13px] font-semibold text-white"
        >
          Tải lại
        </button>
      </div>
    );
  }

  const { kpis } = data;
  const todayOrders =
    kpis.todayOrdersCount ?? visibleSeries[visibleSeries.length - 1]?.orderCount ?? 0;

  const activePoint =
    hoverIdx !== null && chartGeometry.coords[hoverIdx]
      ? chartGeometry.coords[hoverIdx]
      : null;

  const activeCategories = (data.categoryCounts || [])
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);
  const totalCatalog = kpis.totalProductsCount || activeCategories.reduce((s, c) => s + c.count, 0) || 1;
  const rxCount = kpis.rxProductsCount || 0;
  const rxPct = Math.round((rxCount / totalCatalog) * 100);
  const maxTopStock = Math.max(...sortedProducts.map((p) => p.availableStock), 1);

  const handleExportOrders = () => {
    if (!hasPermission("export_data")) {
      showToast("Tài khoản chưa được cấp quyền xuất báo cáo.", "negative");
      return;
    }
    downloadAdminCsv("orders");
    showToast("Đang tải báo cáo đơn hàng (.CSV)");
  };

  return (
    <div className="space-y-6">
      {/* TOP ZONE: 7-Col Smooth Spline Revenue Card + 5-Col 2x2 Elevated KPI Grid */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Left: Revenue Card */}
        <section className="admin-card flex flex-col justify-between p-5 sm:p-6 xl:col-span-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-pharma-600">
                  Doanh thu ({periodDays} ngày)
                </span>
                <span className="rounded-full bg-[#E8F8EE] px-2 py-0.5 text-[11px] font-semibold text-[#136C3E] tabular-nums">
                  Sỉ {kpis.b2bSharePct}%
                </span>
              </div>
              <h1 className="mt-1 text-[27px] font-bold leading-tight tracking-tight text-ink-primary tabular-nums sm:text-[31px]">
                {formatVnd(animPeriodRev)}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Legend */}
              <div className="flex items-center gap-4 text-[12px] font-medium text-ink-secondary">
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span className="h-2.5 w-2.5 rounded-full bg-pharma-600" />
                  <span>Tổng thu</span>
                </span>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#0D9488]" />
                  <span>Khách sỉ</span>
                </span>
              </div>

              {/* Inline Segmented Period Toggle */}
              <div className="inline-flex rounded-lg border border-[#E5E9F4] bg-[#F3F5FB] p-0.5 text-[12px]">
                <button
                  type="button"
                  onClick={() => setPeriodDays(7)}
                  className={`rounded-md px-2.5 py-1 font-semibold transition-all ${
                    periodDays === 7
                      ? "bg-white text-pharma-600 shadow-sm"
                      : "text-ink-muted hover:text-ink-primary"
                  }`}
                >
                  7 ngày
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodDays(14)}
                  className={`rounded-md px-2.5 py-1 font-semibold transition-all ${
                    periodDays === 14
                      ? "bg-white text-pharma-600 shadow-sm"
                      : "text-ink-muted hover:text-ink-primary"
                  }`}
                >
                  14 ngày
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Smooth Spline Chart with Floating Tooltip */}
          <div className="relative mt-3 w-full">
            {activePoint && (
              <div
                className="pointer-events-none absolute top-1 z-10 rounded-xl border border-white/10 bg-[#11152B]/95 px-3 py-2 text-[12px] text-white shadow-xl backdrop-blur-sm transition-all duration-100"
                style={{
                  left: `${Math.min(
                    Math.max((activePoint.x / chartGeometry.width) * 100, 14),
                    72
                  )}%`,
                  transform: "translateX(-50%)",
                }}
              >
                <div className="font-semibold text-[#C7D2FE] tabular-nums">
                  {formatDateVi(activePoint.pt.date)} · {activePoint.pt.orderCount} đơn
                </div>
                <div className="mt-1 flex items-center gap-3 tabular-nums">
                  <span>
                    Tổng: <strong>{formatVnd(activePoint.totalVal)}</strong>
                  </span>
                  <span className="text-[#5EEAD4]">
                    Sỉ: <strong>{formatVnd(activePoint.b2bVal)}</strong>
                  </span>
                </div>
              </div>
            )}

            <svg
              key={`chart-${periodDays}`}
              viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
              className="h-[195px] w-full select-none sm:h-[215px]"
              role="img"
              aria-label="Biểu đồ doanh thu"
              onMouseLeave={() => setHoverIdx(null)}
            >
              <defs>
                <linearGradient id="nesphar-rev-fade" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3E4095" stopOpacity="0.2" />
                  <stop offset="75%" stopColor="#3E4095" stopOpacity="0.04" />
                  <stop offset="100%" stopColor="#3E4095" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="nesphar-b2b-fade" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0D9488" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#0D9488" stopOpacity="0" />
                </linearGradient>
              </defs>

              {chartGeometry.ticks.map((t, i) => (
                <g key={i}>
                  <line
                    x1={chartGeometry.padLeft}
                    y1={t.y}
                    x2={chartGeometry.width - chartGeometry.padRight}
                    y2={t.y}
                    stroke={i === 0 ? "#E4E9F4" : "#EFF2F9"}
                    strokeDasharray={i === 0 ? undefined : "4 4"}
                    strokeWidth={1}
                  />
                  <text
                    x={chartGeometry.padLeft - 10}
                    y={t.y + 4}
                    textAnchor="end"
                    fontSize={11}
                    fontWeight={500}
                    fill="#7B84A3"
                  >
                    {t.v === 0 ? "0" : formatCompactVnd(t.v)}
                  </text>
                </g>
              ))}

              {/* Smooth Area Fills */}
              {chartGeometry.coords.length > 1 && (
                <>
                  <path
                    className="anim-chart-area"
                    d={chartGeometry.totalPaths.areaPath}
                    fill="url(#nesphar-rev-fade)"
                  />
                  <path
                    className="anim-chart-area"
                    d={chartGeometry.b2bPaths.areaPath}
                    fill="url(#nesphar-b2b-fade)"
                  />
                </>
              )}

              {/* Smooth B2B Spline */}
              {chartGeometry.coords.length > 1 && (
                <path
                  pathLength={1}
                  className="anim-chart-line-secondary"
                  fill="none"
                  stroke="#0D9488"
                  strokeWidth={2}
                  strokeLinecap="round"
                  d={chartGeometry.b2bPaths.linePath}
                />
              )}

              {/* Smooth Total Revenue Spline */}
              {chartGeometry.coords.length > 1 && (
                <path
                  pathLength={1}
                  className="anim-chart-line"
                  fill="none"
                  stroke="#3E4095"
                  strokeWidth={2.6}
                  strokeLinecap="round"
                  d={chartGeometry.totalPaths.linePath}
                />
              )}

              {activePoint && (
                <line
                  x1={activePoint.x}
                  y1={chartGeometry.padTop}
                  x2={activePoint.x}
                  y2={chartGeometry.baselineY}
                  stroke="#A5B4FC"
                  strokeWidth={1.25}
                  strokeDasharray="3 3"
                />
              )}

              {chartGeometry.coords.map((c, idx) => {
                const showLabel =
                  periodDays <= 7 ||
                  (chartGeometry.coords.length - 1 - idx) % 2 === 0;
                const active = hoverIdx === idx;
                return (
                  <g key={c.pt.date}>
                    {active && (
                      <circle
                        cx={c.x}
                        cy={c.yTotal}
                        r={10}
                        fill="#3E4095"
                        fillOpacity={0.14}
                      />
                    )}
                    <circle
                      cx={c.x}
                      cy={c.yB2b}
                      r={active ? 4.5 : 3}
                      fill="#FFFFFF"
                      stroke="#0D9488"
                      strokeWidth={2}
                      className="anim-chart-dot"
                      style={{ animationDelay: `${180 + idx * 24}ms` }}
                    />
                    <circle
                      cx={c.x}
                      cy={c.yTotal}
                      r={active ? 5 : 3.4}
                      fill="#FFFFFF"
                      stroke="#3E4095"
                      strokeWidth={2.4}
                      className="anim-chart-dot"
                      style={{ animationDelay: `${120 + idx * 24}ms` }}
                    />
                    {showLabel && (
                      <text
                        x={c.x}
                        y={chartGeometry.height - 8}
                        textAnchor="middle"
                        fontSize={11.5}
                        fill={active ? "#3E4095" : "#5D6684"}
                        fontWeight={active ? 700 : 500}
                      >
                        {formatShortWeekday(c.pt.date, c.pt.label)}
                      </text>
                    )}
                    <rect
                      x={c.x - chartGeometry.plotW / (chartGeometry.coords.length * 2)}
                      y={chartGeometry.padTop}
                      width={chartGeometry.plotW / chartGeometry.coords.length}
                      height={chartGeometry.plotH}
                      fill="transparent"
                      className="cursor-pointer"
                      onMouseEnter={() => setHoverIdx(idx)}
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Crisp Bottom Summary Strip */}
          <div className="mt-3 grid grid-cols-3 gap-3 border-t border-[#EFF2F9] pt-3.5 text-[12.5px]">
            <div className="min-w-0">
              <div className="text-[11.5px] text-ink-muted">Lợi nhuận gộp</div>
              <div className="mt-0.5 truncate font-bold text-[#136C3E] tabular-nums">
                {formatVnd(kpis.estimatedGrossProfit)}
              </div>
            </div>
            <div className="min-w-0 border-l border-[#EFF2F9] pl-3">
              <div className="text-[11.5px] text-ink-muted">Doanh thu sỉ B2B</div>
              <div className="mt-0.5 truncate font-bold text-ink-primary tabular-nums">
                {formatVnd(kpis.b2bRevenue)}
              </div>
            </div>
            <div className="min-w-0 border-l border-[#EFF2F9] pl-3">
              <div className="text-[11.5px] text-ink-muted">Giá trị TB / đơn</div>
              <div className="mt-0.5 truncate font-bold text-ink-primary tabular-nums">
                {formatVnd(kpis.averageOrderValue)}
              </div>
            </div>
          </div>
        </section>

        {/* Right: 2x2 Elevated KPI Cards */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:col-span-5">
          {/* Card 1: Signature Royal Pharma Blue Hero Tile */}
          <div
            onClick={() => navigate("/orders")}
            className="hero-pharma-card anim-kpi-interactive flex min-w-0 cursor-pointer flex-col justify-between p-5 text-white"
          >
            <div className="relative z-10 flex items-start justify-between gap-2">
              <span className="text-[13.5px] font-medium text-white/90">Bán hôm nay</span>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white ring-1 ring-white/20 backdrop-blur-sm">
                <ShoppingBasket className="h-[19px] w-[19px]" strokeWidth={1.9} />
              </span>
            </div>

            <div className="relative z-10 my-3">
              <div className="truncate text-[25px] font-bold leading-tight tracking-tight text-white tabular-nums 2xl:text-[28px]">
                {formatVnd(animTodayRev)}
              </div>
              <div className="mt-1 text-[12px] text-white/75 tabular-nums">
                {todayOrders > 0 ? `${todayOrders} đơn ghi nhận hôm nay` : "Cập nhật trực tiếp theo đơn"}
              </div>
            </div>

            <div className="relative z-10 flex items-center justify-between border-t border-white/15 pt-2.5 text-[11.5px] text-white/85 tabular-nums">
              <span>TB {formatCompactVnd(kpis.averageOrderValue)}/đơn</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-white/80" />
            </div>
          </div>

          {/* Card 2: Total Earning + B2B/B2C Proportion Bar */}
          <div className="admin-card flex min-w-0 flex-col justify-between p-5">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[13.5px] font-medium text-ink-secondary">Tổng doanh thu</span>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E8F8EE] text-[#136C3E] ring-1 ring-[#136C3E]/10">
                <TrendingUp className="h-[19px] w-[19px]" strokeWidth={1.9} />
              </span>
            </div>

            <div className="my-3">
              <div className="truncate text-[24px] font-bold leading-tight tracking-tight text-ink-primary tabular-nums 2xl:text-[26px]">
                {formatVnd(animNetRev)}
              </div>
              <div className="mt-1 text-[12px] text-ink-muted tabular-nums">
                <span className="font-semibold text-[#136C3E]">+{kpis.grossMarginPct}%</span> biên lợi nhuận gộp
              </div>
            </div>

            <div className="space-y-1.5 border-t border-[#EFF2F9] pt-2.5">
              <div className="flex items-center justify-between text-[11px] font-medium text-ink-muted tabular-nums">
                <span>Sỉ {kpis.b2bSharePct}%</span>
                <span>Lẻ {(100 - kpis.b2bSharePct).toFixed(1)}%</span>
              </div>
              <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-[#E8ECF5]">
                <div
                  className="anim-bar-grow h-full rounded-full bg-pharma-600"
                  style={{ width: `${Math.max(4, Math.min(100, kpis.b2bSharePct))}%` }}
                />
              </div>
            </div>
          </div>

          {/* Card 3: Total Orders */}
          <div
            onClick={() => navigate("/orders")}
            className="admin-card anim-kpi-interactive flex min-w-0 cursor-pointer flex-col justify-between p-5 hover:border-pharma-200"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-[13.5px] font-medium text-ink-secondary">Đơn hợp lệ</span>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F2F4FB] text-ink-primary ring-1 ring-[#121629]/5">
                <Receipt className="h-[19px] w-[19px]" strokeWidth={1.9} />
              </span>
            </div>

            <div className="my-3 flex items-baseline gap-2">
              <span className="text-[28px] font-bold leading-tight tracking-tight text-ink-primary tabular-nums">
                {animOrders}
              </span>
              <span className="text-[12.5px] font-medium text-ink-muted tabular-nums">
                / {kpis.totalOrdersCount} tổng đơn
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-[#EFF2F9] pt-2.5 text-[12px] tabular-nums">
              {kpis.pendingOrdersCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 font-semibold text-[#B45309]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />
                  {kpis.pendingOrdersCount} chờ duyệt
                </span>
              ) : (
                <span className="font-medium text-[#136C3E]">Đã duyệt hết</span>
              )}
              <ArrowUpRight className="h-3.5 w-3.5 text-ink-muted" />
            </div>
          </div>

          {/* Card 4: Customers & Stock */}
          <div
            onClick={() => navigate("/customers")}
            className="admin-card anim-kpi-interactive flex min-w-0 cursor-pointer flex-col justify-between p-5 hover:border-pharma-200"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-[13.5px] font-medium text-ink-secondary">Khách hàng</span>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EEF0FD] text-pharma-600 ring-1 ring-pharma-600/10">
                <Users className="h-[19px] w-[19px]" strokeWidth={1.9} />
              </span>
            </div>

            <div className="my-3 flex items-baseline gap-2">
              <span className="text-[28px] font-bold leading-tight tracking-tight text-ink-primary tabular-nums">
                {animCustomers}
              </span>
              <span className="text-[12.5px] font-medium text-ink-muted tabular-nums">
                hồ sơ CRM
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-[#EFF2F9] pt-2.5 text-[12px] tabular-nums">
              {kpis.lowStockCount > 0 ? (
                <span className="font-semibold text-[#B45309]">
                  {kpis.lowStockCount} SP sắp hết tồn
                </span>
              ) : (
                <span className="text-ink-muted">{kpis.totalProductsCount ?? 0} mặt hàng</span>
              )}
              <ArrowUpRight className="h-3.5 w-3.5 text-ink-muted" />
            </div>
          </div>
        </div>
      </div>

      {/* MIDDLE ZONE: Executive Insights (Category Mix + Recent Orders Feed) */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Left 5 Cols: Catalog Distribution by Supplier + Rx Share */}
        <section className="admin-card flex flex-col justify-between p-5 sm:p-6 xl:col-span-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EEF0FD] text-pharma-600">
                  <Building2 className="h-4 w-4" />
                </span>
                <h2 className="text-[15.5px] font-bold text-ink-primary">
                  Danh mục theo công ty
                </h2>
              </div>
              <button
                type="button"
                onClick={() => navigate("/products")}
                className="text-[12.5px] font-semibold text-pharma-600 hover:underline"
              >
                Tất cả ({totalCatalog})
              </button>
            </div>

            <div className="mt-5 space-y-3.5">
              {activeCategories.slice(0, 4).map((cat, idx) => {
                const pct = Math.round((cat.count / totalCatalog) * 100);
                const barColor = CAT_BAR_COLORS[idx % CAT_BAR_COLORS.length];
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => navigate(`/products?cat=${encodeURIComponent(cat.id)}`)}
                    className="group block w-full text-left"
                  >
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="truncate font-semibold text-ink-primary group-hover:text-pharma-600">
                        {cat.name.replace(/^Công ty\s+/i, "")}
                      </span>
                      <span className="shrink-0 text-[12.5px] text-ink-muted tabular-nums">
                        <strong className="text-ink-primary">{cat.count}</strong> SP ({pct}%)
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#EEF1F8]">
                      <div
                        className="anim-bar-grow h-full rounded-full transition-opacity group-hover:opacity-85"
                        style={{
                          width: `${Math.max(4, pct)}%`,
                          backgroundColor: barColor,
                          animationDelay: `${idx * 60}ms`,
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Rx vs OTC Split Footer */}
          <div className="mt-5 rounded-xl border border-[#ECEFF8] bg-[#F7F9FE] p-3.5">
            <div className="flex items-center justify-between text-[12px] font-semibold tabular-nums">
              <span className="text-[#B42318]">Thuốc kê đơn (Rx): {rxCount} ({rxPct}%)</span>
              <span className="text-ink-secondary">
                Không kê đơn: {totalCatalog - rxCount} ({100 - rxPct}%)
              </span>
            </div>
            <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-[#DDE3F5]">
              <div
                className="anim-bar-grow h-full bg-[#DC2626]"
                style={{ width: `${rxPct}%` }}
              />
              <div
                className="anim-bar-grow h-full bg-pharma-600"
                style={{ width: `${100 - rxPct}%` }}
              />
            </div>
          </div>
        </section>

        {/* Right 7 Cols: Live Recent Orders Feed */}
        <section className="admin-card flex flex-col justify-between p-5 sm:p-6 xl:col-span-7">
          <div>
            <div className="flex items-center justify-between gap-2 pb-3.5">
              <h2 className="text-[15.5px] font-bold text-ink-primary">Đơn hàng gần đây</h2>
              <button
                type="button"
                onClick={() => navigate("/orders")}
                className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-pharma-600 hover:underline"
              >
                <span>Xem tất cả</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {recentOrders.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-ink-muted">
                Chưa có đơn hàng nào.
              </div>
            ) : (
              <div className="divide-y divide-[#F1F4FA] rounded-xl border border-[#EDF0F7]">
                {recentOrders.map((o) => {
                  const st = ORDER_STATUS_PILL[o.status] || ORDER_STATUS_PILL.pending;
                  const tm =
                    TIER_META[o.customerTierSnapshot as CustomerTier] || TIER_META.retail;
                  return (
                    <div
                      key={o.id}
                      onClick={() => navigate(`/orders?q=${encodeURIComponent(o.code)}`)}
                      className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[#F7F9FF]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-pharma-600 tabular-nums">
                            #{o.code}
                          </span>
                          <span className="truncate font-semibold text-ink-primary">
                            {o.businessName || o.customerName}
                          </span>
                          <span
                            className="hidden whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] font-medium sm:inline-block"
                            style={{ backgroundColor: tm.bg, color: tm.ink }}
                          >
                            {tm.shortLabel}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11.5px] text-ink-muted tabular-nums">
                          {formatDateTimeVi(o.createdAt)} · {o.items.length} sản phẩm
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        <span className="font-bold text-ink-primary tabular-nums">
                          {formatVnd(o.totalAmount)}
                        </span>
                        <span
                          className="inline-block w-[92px] whitespace-nowrap rounded-lg px-2 py-1 text-center text-[11.5px] font-semibold"
                          style={{ backgroundColor: st.bg, color: st.ink }}
                        >
                          {st.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* BOTTOM ZONE: Products Leaderboard Table */}
      <section className="admin-card p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-3 pb-4 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-[18px] font-bold text-ink-primary">Sản phẩm nổi bật</h2>
            {kpis.pendingOrdersCount > 0 && (
              <button
                type="button"
                onClick={() => navigate("/orders?status=pending")}
                className="whitespace-nowrap rounded-full bg-[#FFF6E5] px-3 py-1 text-[12px] font-semibold text-[#9A5B00] ring-1 ring-[#F59E0B]/20 hover:bg-[#FCEACA]"
              >
                {kpis.pendingOrdersCount} đơn chờ duyệt →
              </button>
            )}
            {kpis.openTicketCount > 0 && (
              <button
                type="button"
                onClick={() => navigate("/customers?view=tickets")}
                className="whitespace-nowrap rounded-full bg-[#EEF0FD] px-3 py-1 text-[12px] font-semibold text-pharma-600 ring-1 ring-pharma-600/15 hover:bg-[#E1E5FC]"
              >
                {kpis.openTicketCount} tin cần tư vấn →
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              aria-label="Sắp xếp sản phẩm"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as ProductSortKey)}
              className="h-9 bg-[#F7F8FC] pl-3 text-[13px] font-medium text-ink-primary"
            >
              <option value="best_sell">Bán chạy nhất</option>
              <option value="top_earning">Doanh thu cao</option>
              <option value="low_stock">Tồn kho thấp</option>
            </select>

            <button
              type="button"
              onClick={handleExportOrders}
              className="btn-press inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#DCE2F0] bg-white px-3 text-[13px] font-medium text-ink-secondary hover:bg-[#F5F7FC]"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Xuất CSV</span>
            </button>

            <button
              type="button"
              onClick={() => navigate("/products?create=1")}
              className="btn-press inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl bg-gradient-to-r from-[#171B34] to-[#262B4E] px-3.5 text-[13px] font-semibold text-white shadow-sm hover:from-[#3E4095] hover:to-[#31337A]"
            >
              <Plus className="h-4 w-4" />
              <span>Thêm sản phẩm</span>
            </button>
          </div>
        </div>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th className="w-12">STT</th>
                <th className="w-16">Ảnh</th>
                <th>Tên sản phẩm</th>
                <th className="text-right">Giá lẻ</th>
                <th>Trạng thái</th>
                <th className="text-right">Đã bán</th>
                <th className="text-right">Tồn kho</th>
                <th className="text-right">Doanh thu</th>
              </tr>
            </thead>
            <tbody className="anim-rows">
              {sortedProducts.map((p, index) => {
                const outOfStock = p.availableStock <= 0;
                const lowStock =
                  !outOfStock && p.availableStock <= (p.minStockAlert ?? 20);
                const stockPct = Math.min(
                  100,
                  Math.max(6, Math.round((p.availableStock / maxTopStock) * 100))
                );
                return (
                  <tr
                    key={p.productId}
                    onClick={() => navigate(`/products?q=${encodeURIComponent(p.sku)}`)}
                    className="cursor-pointer"
                  >
                    <td className="text-[13px] font-semibold text-ink-muted tabular-nums">
                      {String(index + 1).padStart(2, "0")}
                    </td>
                    <td>
                      <ProductThumb src={p.imageUrl} alt={p.name} />
                    </td>
                    <td>
                      <div className="max-w-[340px] truncate text-[13.5px] font-semibold text-ink-primary">
                        {p.name}
                      </div>
                      <div className="text-[11.5px] text-ink-muted tabular-nums">
                        SKU: {p.sku}
                      </div>
                    </td>
                    <td className="whitespace-nowrap text-right text-[13.5px] font-medium text-ink-primary tabular-nums">
                      {p.retailPrice ? formatVnd(p.retailPrice) : "—"}
                    </td>
                    <td>
                      <span
                        className="inline-block whitespace-nowrap rounded-lg px-2.5 py-1 text-[12px] font-semibold"
                        style={
                          outOfStock
                            ? { backgroundColor: "#FFECEB", color: "#B42318" }
                            : lowStock
                              ? { backgroundColor: "#FFF6E5", color: "#9A5B00" }
                              : { backgroundColor: "#E8F8EE", color: "#136C3E" }
                        }
                      >
                        {outOfStock
                          ? "Hết hàng"
                          : lowStock
                            ? "Sắp hết"
                            : "Còn hàng"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-right text-[13.5px] font-medium text-ink-secondary tabular-nums">
                      {p.baseUnitsSold.toLocaleString("vi-VN")}
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">
                      <div className="text-[13.5px] font-semibold text-ink-primary">
                        {p.availableStock.toLocaleString("vi-VN")}
                      </div>
                      <div className="ml-auto mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-[#EAEFF8]">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${outOfStock ? 0 : stockPct}%`,
                            backgroundColor: outOfStock
                              ? "#DC2626"
                              : lowStock
                                ? "#F59E0B"
                                : "#3E4095",
                          }}
                        />
                      </div>
                    </td>
                    <td className="whitespace-nowrap text-right text-[13.5px] font-bold text-ink-primary tabular-nums">
                      {formatVnd(p.revenue)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
