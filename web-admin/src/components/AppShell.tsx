import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowRight,
  Bell,
  Boxes,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Home,
  LayoutGrid,
  LogOut,
  Mail,
  Menu,
  Package,
  Search,
  Settings,
  ShoppingCart,
  Users,
  X,
} from "lucide-react";
import { apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { ROLE_META } from "../utils/format";

interface CategoryCountItem {
  id: string;
  name: string;
  shortName: string;
  count: number;
}

interface ShellSummary {
  pendingOrders: number;
  nearExpiry: number;
  openTickets: number;
  totalProducts: number;
  rxProducts: number;
  categories: CategoryCountItem[];
}

interface SearchHit {
  kind: "order" | "product" | "batch" | "customer";
  id: string;
  title: string;
  subtitle: string;
  path: string;
}

const KIND_LABELS: Record<SearchHit["kind"], string> = {
  order: "Đơn hàng",
  product: "Sản phẩm",
  batch: "Lô hàng",
  customer: "Khách hàng",
};

function formatTodayHeaderVi(): string {
  const d = new Date();
  const days = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${days[d.getDay()]}, ${pad(d.getDate())} Th${d.getMonth() + 1} ${d.getFullYear()}`;
}

export const AppShell: React.FC = () => {
  const { staff, logout, toast } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [productsExpanded, setProductsExpanded] = useState(true);
  const [alertMenuOpen, setAlertMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [liveHits, setLiveHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  const [summary, setSummary] = useState<ShellSummary>({
    pendingOrders: 0,
    nearExpiry: 0,
    openTickets: 0,
    totalProducts: 0,
    rxProducts: 0,
    categories: [],
  });

  const alertRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMobileMenuOpen(false);
    setAlertMenuOpen(false);
    setUserMenuOpen(false);
    apiRequest<{
      kpis: {
        pendingOrdersCount: number;
        nearExpiryCount: number;
        openTicketCount: number;
        totalProductsCount?: number;
        rxProductsCount?: number;
      };
      categoryCounts?: CategoryCountItem[];
    }>("/dashboard")
      .then((res) => {
        setSummary({
          pendingOrders: res.kpis.pendingOrdersCount || 0,
          nearExpiry: res.kpis.nearExpiryCount || 0,
          openTickets: res.kpis.openTicketCount || 0,
          totalProducts: res.kpis.totalProductsCount || 0,
          rxProducts: res.kpis.rxProductsCount || 0,
          categories: (res.categoryCounts || []).filter((c) => c.count > 0),
        });
      })
      .catch(() => {
        // silent refresh
      });
  }, [location.pathname]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (alertRef.current && !alertRef.current.contains(e.target as Node)) {
        setAlertMenuOpen(false);
      }
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!paletteOpen) return;
    const q = paletteQuery.trim();
    if (!q) {
      setLiveHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      apiRequest<{ results: SearchHit[] }>(`/search?q=${encodeURIComponent(q)}`)
        .then((res) => setLiveHits(res.results || []))
        .catch(() => setLiveHits([]))
        .finally(() => setSearching(false));
    }, 150);
    return () => clearTimeout(timer);
  }, [paletteOpen, paletteQuery]);

  if (!staff) return null;

  const cleanStaffName = staff.fullName.replace(/\([^)]*\)/g, "").trim();
  const avatarInitial =
    cleanStaffName
      .split(/\s+/)
      .pop()?.[0]
      ?.toUpperCase() || "N";
  const roleLabel = ROLE_META[staff.role]?.label || staff.role;

  const onProductsRoute = location.pathname.startsWith("/products");
  const currentCatParam = onProductsRoute ? searchParams.get("cat") || "all" : "";
  const currentTabParam = onProductsRoute ? searchParams.get("tab") || "" : "";

  const productSubFilters = [
    {
      key: "all",
      label: "Tất cả",
      count: summary.totalProducts,
      active: onProductsRoute && currentCatParam === "all" && currentTabParam !== "rx",
      onClick: () => navigate("/products"),
    },
    ...summary.categories.slice(0, 4).map((c) => ({
      key: c.id,
      label: c.shortName.replace(/^Công ty\s+/i, ""),
      count: c.count,
      active: onProductsRoute && currentCatParam === c.id,
      onClick: () => navigate(`/products?cat=${encodeURIComponent(c.id)}`),
    })),
    ...(summary.rxProducts > 0
      ? [
          {
            key: "rx",
            label: "Thuốc kê đơn",
            count: summary.rxProducts,
            active: onProductsRoute && currentTabParam === "rx",
            onClick: () => navigate("/products?tab=rx"),
          },
        ]
      : []),
  ];

  const totalAlerts = summary.pendingOrders + summary.nearExpiry;

  const renderSidebar = (isMobile = false) => {
    const isNarrow = !isMobile && collapsed;

    const itemClass = (isActive: boolean) =>
      `group relative flex items-center ${
        isNarrow ? "justify-center px-0" : "justify-between px-3.5"
      } rounded-xl py-2.5 text-[13.5px] transition-all duration-150 ${
        isActive
          ? "bg-white/[0.1] font-semibold text-white ring-1 ring-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          : "font-medium text-[#959EB8] hover:bg-white/[0.05] hover:text-white"
      }`;

    return (
      <div className="sidebar-surface flex h-full flex-col justify-between px-3.5 py-5 text-white select-none border-r border-white/[0.06]">
        {/* Scrollable Upper Zone */}
        <div className="sidebar-scroll min-h-0 flex-1 overflow-y-auto pr-0.5">
          {/* Brand Mark */}
          <div
            onClick={() => navigate("/")}
            className={`flex cursor-pointer items-center ${
              isNarrow ? "justify-center px-0" : "gap-3 px-2"
            }`}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white p-1 shadow-[0_4px_14px_rgba(0,0,0,0.28)]">
              <img
                src="/nesphar-logo.png"
                alt="NESPHAR"
                className="h-full w-full object-contain"
              />
            </div>
            {!isNarrow && (
              <div className="min-w-0">
                <div className="truncate text-[16.5px] font-bold leading-tight tracking-tight text-white">
                  NESPHAR
                </div>
                <div className="text-[10.5px] font-medium tracking-wider text-[#8C95B4]">
                  PHARMA CORE
                </div>
              </div>
            )}
          </div>

          {/* Primary Navigation */}
          <nav className="mt-7 space-y-1" aria-label="Điều hướng chính">
            {!isNarrow && (
              <div className="px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#5F6887]">
                Vận hành
              </div>
            )}

            <NavLink
              to="/"
              end
              title={isNarrow ? "Tổng quan" : undefined}
              className={({ isActive }) => itemClass(isActive)}
            >
              {({ isActive }) => (
                <>
                  {isActive && !isNarrow && (
                    <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[#818CF8]" />
                  )}
                  <span className="flex items-center gap-3 truncate">
                    <Home
                      className={`h-[18px] w-[18px] shrink-0 ${
                        isActive ? "text-[#A5B4FC]" : "text-[#7A84A3] group-hover:text-white"
                      }`}
                      strokeWidth={1.85}
                    />
                    {!isNarrow && <span>Tổng quan</span>}
                  </span>
                </>
              )}
            </NavLink>

            <NavLink
              to="/orders"
              title={isNarrow ? "Đơn hàng" : undefined}
              className={({ isActive }) => itemClass(isActive)}
            >
              {({ isActive }) => (
                <>
                  {isActive && !isNarrow && (
                    <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[#818CF8]" />
                  )}
                  <span className="flex items-center gap-3 truncate">
                    <ShoppingCart
                      className={`h-[18px] w-[18px] shrink-0 ${
                        isActive ? "text-[#A5B4FC]" : "text-[#7A84A3] group-hover:text-white"
                      }`}
                      strokeWidth={1.85}
                    />
                    {!isNarrow && <span>Đơn hàng</span>}
                  </span>
                  {!isNarrow && summary.pendingOrders > 0 && (
                    <span className="rounded-full bg-[#4F52C6] px-2 py-0.5 text-[11px] font-semibold text-white tabular-nums shadow-sm">
                      {summary.pendingOrders}
                    </span>
                  )}
                  {isNarrow && summary.pendingOrders > 0 && (
                    <span className="absolute right-2.5 top-2 h-2 w-2 rounded-full bg-[#818CF8]" />
                  )}
                </>
              )}
            </NavLink>

            {/* Expandable Products Tree */}
            <div>
              <div
                title={isNarrow ? "Sản phẩm" : undefined}
                className={`group relative flex items-center ${
                  isNarrow ? "justify-center px-0" : "justify-between px-3.5"
                } cursor-pointer rounded-xl py-2.5 text-[13.5px] transition-all duration-150 ${
                  onProductsRoute
                    ? "bg-white/[0.1] font-semibold text-white ring-1 ring-white/[0.09]"
                    : "font-medium text-[#959EB8] hover:bg-white/[0.05] hover:text-white"
                }`}
                onClick={() => {
                  if (isNarrow) {
                    navigate("/products");
                  } else if (!onProductsRoute) {
                    setProductsExpanded(true);
                    navigate("/products");
                  } else {
                    setProductsExpanded((prev) => !prev);
                  }
                }}
              >
                {onProductsRoute && !isNarrow && (
                  <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[#818CF8]" />
                )}
                <span className="flex items-center gap-3 truncate">
                  <Package
                    className={`h-[18px] w-[18px] shrink-0 ${
                      onProductsRoute ? "text-[#A5B4FC]" : "text-[#7A84A3] group-hover:text-white"
                    }`}
                    strokeWidth={1.85}
                  />
                  {!isNarrow && <span>Sản phẩm</span>}
                </span>
                {!isNarrow && (
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-[#7A84A3] transition-transform duration-200 ${
                      productsExpanded ? "rotate-180 text-white" : ""
                    }`}
                  />
                )}
              </div>

              {!isNarrow && productSubFilters.length > 0 && (
                <div className={`anim-accordion ${productsExpanded ? "is-open" : ""}`}>
                  <div className="anim-accordion-inner space-y-0.5 pl-9 pr-1.5">
                    {productSubFilters.map((sub) => (
                      <button
                        key={sub.key}
                        type="button"
                        onClick={sub.onClick}
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors hover:bg-white/[0.04] hover:text-white"
                      >
                        <span
                          className={`truncate ${
                            sub.active ? "font-semibold text-white" : "font-normal text-[#8E97B3]"
                          }`}
                        >
                          {sub.label}{" "}
                          <span className="tabular-nums opacity-65">({sub.count})</span>
                        </span>
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-all duration-150 ${
                            sub.active
                              ? "scale-100 border-[#6366F1] bg-[#4F52C6] text-white"
                              : "scale-95 border-[#343C5A] bg-transparent"
                          }`}
                        >
                          {sub.active && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <NavLink
              to="/inventory"
              title={isNarrow ? "Kho & Lô hạn" : undefined}
              className={({ isActive }) => itemClass(isActive)}
            >
              {({ isActive }) => (
                <>
                  {isActive && !isNarrow && (
                    <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[#818CF8]" />
                  )}
                  <span className="flex items-center gap-3 truncate">
                    <Boxes
                      className={`h-[18px] w-[18px] shrink-0 ${
                        isActive ? "text-[#A5B4FC]" : "text-[#7A84A3] group-hover:text-white"
                      }`}
                      strokeWidth={1.85}
                    />
                    {!isNarrow && <span>Kho & Lô hạn</span>}
                  </span>
                  {!isNarrow && summary.nearExpiry > 0 && (
                    <span className="h-2 w-2 rounded-full bg-[#F59E0B] ring-4 ring-[#F59E0B]/20" />
                  )}
                  {isNarrow && summary.nearExpiry > 0 && (
                    <span className="absolute right-2.5 top-2 h-2 w-2 rounded-full bg-[#F59E0B]" />
                  )}
                </>
              )}
            </NavLink>

            <NavLink
              to="/customers"
              title={isNarrow ? "Khách hàng" : undefined}
              className={({ isActive }) => itemClass(isActive)}
            >
              {({ isActive }) => (
                <>
                  {isActive && !isNarrow && (
                    <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[#818CF8]" />
                  )}
                  <span className="flex items-center gap-3 truncate">
                    <Users
                      className={`h-[18px] w-[18px] shrink-0 ${
                        isActive ? "text-[#A5B4FC]" : "text-[#7A84A3] group-hover:text-white"
                      }`}
                      strokeWidth={1.85}
                    />
                    {!isNarrow && <span>Khách hàng</span>}
                  </span>
                  {!isNarrow && summary.openTickets > 0 && (
                    <span className="rounded-full bg-[#4F52C6] px-2 py-0.5 text-[11px] font-semibold text-white tabular-nums">
                      {summary.openTickets}
                    </span>
                  )}
                  {isNarrow && summary.openTickets > 0 && (
                    <span className="absolute right-2.5 top-2 h-2 w-2 rounded-full bg-[#818CF8]" />
                  )}
                </>
              )}
            </NavLink>

            <NavLink
              to="/cms"
              title={isNarrow ? "Nội dung App" : undefined}
              className={({ isActive }) => itemClass(isActive)}
            >
              {({ isActive }) => (
                <>
                  {isActive && !isNarrow && (
                    <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[#818CF8]" />
                  )}
                  <span className="flex items-center gap-3 truncate">
                    <LayoutGrid
                      className={`h-[18px] w-[18px] shrink-0 ${
                        isActive ? "text-[#A5B4FC]" : "text-[#7A84A3] group-hover:text-white"
                      }`}
                      strokeWidth={1.85}
                    />
                    {!isNarrow && <span>Nội dung App</span>}
                  </span>
                </>
              )}
            </NavLink>
          </nav>
        </div>

        {/* Bottom Live Channel Chip & Utility Links */}
        <div className="mt-4 shrink-0 space-y-2 border-t border-white/[0.08] pt-3.5">
          {!isNarrow && (
            <a
              href="https://zalo.me/s/1283290697529026891/?env=TESTING&version=8"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-[12px] text-[#C8CFE6] transition-colors hover:border-white/[0.15] hover:bg-white/[0.08]"
            >
              <span className="flex items-center gap-2 truncate">
                <span className="h-2 w-2 shrink-0 rounded-full bg-[#22C55E] ring-4 ring-[#22C55E]/20" />
                <span className="truncate font-medium">Zalo Mini App</span>
              </span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#8D95AE]" />
            </a>
          )}

          <div className="space-y-1">
            <NavLink
              to="/staff"
              title={isNarrow ? "Cài đặt & Nhân sự" : undefined}
              className={({ isActive }) => itemClass(isActive)}
            >
              {({ isActive }) => (
                <>
                  {isActive && !isNarrow && (
                    <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[#818CF8]" />
                  )}
                  <span className="flex items-center gap-3 truncate">
                    <Settings
                      className={`h-[18px] w-[18px] shrink-0 ${
                        isActive ? "text-[#A5B4FC]" : "text-[#7A84A3] group-hover:text-white"
                      }`}
                      strokeWidth={1.85}
                    />
                    {!isNarrow && <span>Cài đặt & Nhân sự</span>}
                  </span>
                </>
              )}
            </NavLink>

            <button
              type="button"
              title={isNarrow ? "Đăng xuất" : undefined}
              onClick={logout}
              className={`flex w-full items-center ${
                isNarrow ? "justify-center px-0" : "gap-3 px-3.5"
              } rounded-xl py-2.5 text-[13.5px] font-medium text-[#959EB8] transition-colors hover:bg-white/[0.05] hover:text-white`}
            >
              <LogOut className="h-[18px] w-[18px] shrink-0 text-[#7A84A3]" strokeWidth={1.85} />
              {!isNarrow && <span>Đăng xuất</span>}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-[100dvh] text-ink-primary">
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={`relative hidden shrink-0 transition-[width] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] lg:block ${
          collapsed ? "w-[76px]" : "w-[248px]"
        }`}
      >
        <div className="sticky top-0 h-[100dvh]">{renderSidebar(false)}</div>

        {/* Seam Collapse Button */}
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          aria-label={collapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}
          className="fixed top-[22px] z-30 hidden h-7 w-7 items-center justify-center rounded-full border border-[#DDE3F0] bg-white text-ink-primary shadow-[0_2px_8px_rgba(17,20,36,0.1)] transition-[left,border-color,color,transform] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-pharma-600 hover:text-pharma-600 lg:flex"
          style={{ left: collapsed ? "62px" : "234px" }}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Elevated Frosted Top Bar */}
        <header className="sticky top-0 z-20 flex h-[64px] shrink-0 items-center justify-between gap-2 border-b border-[#E5E9F4] bg-white/90 px-3 backdrop-blur-md sm:h-[72px] sm:gap-4 sm:px-6 lg:pl-8 lg:pr-7">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="shrink-0 rounded-xl p-2 text-ink-secondary hover:bg-frame lg:hidden"
              aria-label="Mở menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Recessed Search Trigger */}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="flex h-[38px] min-w-0 max-w-[350px] flex-1 items-center justify-between gap-2 rounded-xl border border-[#E6EAF4] bg-[#F5F7FC] px-3 text-[13px] text-ink-muted transition-all hover:border-[#CFD6E8] hover:bg-white sm:h-[42px] sm:px-3.5 sm:text-[13.5px]"
            >
              <span className="flex min-w-0 items-center gap-2 truncate">
                <Search className="h-4 w-4 shrink-0 text-ink-muted" />
                <span className="truncate">Tìm sản phẩm, đơn hàng, số lô...</span>
              </span>
              <kbd className="hidden shrink-0 rounded-md border border-[#E1E6F2] bg-white px-1.5 py-0.5 text-[11px] font-semibold text-ink-muted shadow-[0_1px_0_rgba(0,0,0,0.04)] sm:inline-block">
                Ctrl K
              </kbd>
            </button>

            {/* Date Pill */}
            <div className="hidden h-[42px] items-center gap-2 rounded-xl border border-[#E6EAF4] bg-[#F5F7FC] px-3.5 text-[13px] text-ink-secondary md:flex">
              <Calendar className="h-4 w-4 shrink-0 text-pharma-600" />
              <span className="whitespace-nowrap font-medium text-ink-primary tabular-nums">
                {formatTodayHeaderVi()}
              </span>
            </div>
          </div>

          {/* Right Cluster */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => navigate("/customers?view=tickets")}
              title="Tin nhắn tư vấn khách hàng"
              className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-transparent text-ink-secondary transition-colors hover:border-[#E6EAF4] hover:bg-[#F5F7FC] hover:text-ink-primary sm:h-10 sm:w-10"
            >
              <Mail className="h-[18px] w-[18px]" strokeWidth={1.85} />
              {summary.openTickets > 0 && (
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-pharma-600 ring-2 ring-white" />
              )}
            </button>

            <div ref={alertRef} className="relative">
              <button
                type="button"
                onClick={() => setAlertMenuOpen((prev) => !prev)}
                title="Thông báo vận hành"
                className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-transparent text-ink-secondary transition-colors hover:border-[#E6EAF4] hover:bg-[#F5F7FC] hover:text-ink-primary sm:h-10 sm:w-10"
              >
                <Bell className="h-[18px] w-[18px]" strokeWidth={1.85} />
                {totalAlerts > 0 && (
                  <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#E11D48] ring-2 ring-white" />
                )}
              </button>

              {alertMenuOpen && (
                <div className="anim-popover absolute right-0 z-40 mt-2 w-72 rounded-2xl border border-[#E2E8F5] bg-white p-3 shadow-xl">
                  <div className="px-2 pb-2 text-[13px] font-semibold text-ink-primary">
                    Cần chú ý
                  </div>
                  <div className="space-y-1 text-[13px]">
                    <button
                      type="button"
                      onClick={() => navigate("/orders?status=pending")}
                      className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left hover:bg-[#F5F7FC]"
                    >
                      <span className="text-ink-secondary">Đơn hàng chờ duyệt</span>
                      <span className="rounded-md bg-[#EEF0FD] px-2 py-0.5 font-semibold text-pharma-600 tabular-nums">
                        {summary.pendingOrders}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate("/inventory?filter=near_expiry")}
                      className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left hover:bg-[#F5F7FC]"
                    >
                      <span className="text-ink-secondary">Lô hàng sắp hết hạn</span>
                      <span className="rounded-md bg-[#FFF6E5] px-2 py-0.5 font-semibold text-[#B45309] tabular-nums">
                        {summary.nearExpiry}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate("/customers?view=tickets")}
                      className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left hover:bg-[#F5F7FC]"
                    >
                      <span className="text-ink-secondary">Khách cần tư vấn</span>
                      <span className="rounded-md bg-[#F1F4FA] px-2 py-0.5 font-semibold text-ink-primary tabular-nums">
                        {summary.openTickets}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="mx-1 hidden h-6 w-px bg-[#E8ECF5] sm:block" />

            <div ref={userRef} className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen((prev) => !prev)}
                className="flex items-center gap-2.5 rounded-xl py-1 pl-2 pr-1.5 transition-colors hover:bg-[#F5F7FC]"
              >
                <div className="hidden text-right sm:block">
                  <div className="text-[13px] font-semibold leading-tight text-ink-primary">
                    Dược Phẩm NESPHAR
                  </div>
                  <div className="text-[11px] font-medium text-ink-muted">{roleLabel}</div>
                </div>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#4F52B5] to-[#2F317B] text-[13.5px] font-bold text-white ring-2 ring-[#EEF0FD]">
                  {avatarInitial}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-ink-muted" />
              </button>

              {userMenuOpen && (
                <div className="anim-popover absolute right-0 z-40 mt-2 w-60 rounded-2xl border border-[#E2E8F5] bg-white p-2 shadow-xl">
                  <div className="border-b border-[#F1F3F9] px-3 py-2">
                    <div className="truncate text-[13.5px] font-semibold text-ink-primary">
                      {staff.fullName}
                    </div>
                    <div className="truncate text-[12px] text-ink-muted">{staff.email}</div>
                  </div>
                  <div className="mt-1 space-y-0.5">
                    <a
                      href="https://zalo.me/s/1283290697529026891/?env=TESTING&version=8"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between rounded-xl px-3 py-2 text-[13px] font-medium text-ink-secondary hover:bg-[#F5F7FC] hover:text-pharma-600"
                    >
                      <span>Mở Zalo Mini App</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={logout}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] font-medium text-[#B42318] hover:bg-[#FFECEB]/70"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Đăng xuất</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Canvas */}
        <main className="flex-1 p-4 sm:p-6 lg:p-7">
          <div key={location.pathname} className="anim-page-enter">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Portaled Mobile Navigation Drawer */}
      {mobileMenuOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[90] flex lg:hidden">
            <div
              className="anim-backdrop fixed inset-0 bg-[#0E1224]/55"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="anim-drawer-left relative z-10 flex h-[100dvh] w-[264px] flex-col shadow-2xl">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="absolute right-3 top-4 z-10 rounded-lg p-1.5 text-[#8D95AE] hover:text-white"
                aria-label="Đóng menu"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="min-h-0 flex-1">{renderSidebar(true)}</div>
            </div>
          </div>,
          document.body
        )}

      {/* Portaled Global Search Dialog (Ctrl+K) */}
      {paletteOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="anim-backdrop fixed inset-0 z-[110] flex items-start justify-center bg-[#0E1224]/45 px-4 pt-20"
            onClick={() => setPaletteOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="anim-modal-pop w-full max-w-lg overflow-hidden rounded-2xl border border-[#E2E8F5] bg-white shadow-2xl"
            >
              <div className="flex items-center gap-2.5 border-b border-[#EEF1F8] px-4 py-3.5">
                <Search className="h-4 w-4 shrink-0 text-pharma-600" />
                <input
                  type="text"
                  autoFocus
                  value={paletteQuery}
                  onChange={(e) => setPaletteQuery(e.target.value)}
                  placeholder="Nhập tên thuốc, mã SKU, mã đơn hoặc SĐT khách..."
                  className="w-full border-0 p-0.5 text-[14px] shadow-none focus:outline-none focus:ring-0"
                  style={{ boxShadow: "none" }}
                />
                <button
                  type="button"
                  onClick={() => setPaletteOpen(false)}
                  className="rounded-lg p-1 text-ink-muted hover:bg-frame"
                  aria-label="Đóng"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto p-2">
                {!paletteQuery.trim() ? (
                  <div className="px-3 py-6 text-center text-[13px] text-ink-muted">
                    Gõ từ khóa để tìm nhanh sản phẩm, đơn hàng, lô hạn dùng hoặc khách hàng.
                  </div>
                ) : searching ? (
                  <div className="px-3 py-6 text-center text-[13px] text-ink-muted">
                    Đang tìm...
                  </div>
                ) : liveHits.length === 0 ? (
                  <div className="px-3 py-6 text-center text-[13px] text-ink-muted">
                    Không tìm thấy kết quả cho &ldquo;{paletteQuery}&rdquo;.
                  </div>
                ) : (
                  <div className="space-y-1">
                    {liveHits.map((hit) => (
                      <button
                        key={`${hit.kind}-${hit.id}`}
                        type="button"
                        onClick={() => {
                          navigate(hit.path);
                          setPaletteOpen(false);
                          setPaletteQuery("");
                        }}
                        className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[#EEF0FD]/70"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="shrink-0 whitespace-nowrap rounded-md bg-[#EEF0FD] px-2 py-0.5 text-[11px] font-semibold text-pharma-600">
                              {KIND_LABELS[hit.kind]}
                            </span>
                            <span className="truncate text-[13.5px] font-medium text-ink-primary">
                              {hit.title}
                            </span>
                          </div>
                          <div className="mt-0.5 truncate text-[12px] text-ink-muted tabular-nums">
                            {hit.subtitle}
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 shrink-0 text-ink-muted" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Portaled Toast */}
      {toast &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            key={toast.message}
            className="anim-toast fixed bottom-5 right-5 z-[120] flex max-w-md items-center gap-2 rounded-xl border px-4 py-2.5 text-[13.5px] font-medium shadow-xl"
            style={
              toast.tone === "negative"
                ? {
                    backgroundColor: "#FFECEB",
                    borderColor: "#F8C9C6",
                    color: "#B42318",
                  }
                : {
                    backgroundColor: "#11152B",
                    borderColor: "#262D52",
                    color: "#FFFFFF",
                  }
            }
          >
            {toast.message}
          </div>,
          document.body
        )}
    </div>
  );
};
