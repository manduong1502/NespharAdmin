import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAtomValue } from "jotai";
import {
  Bell,
  Home,
  LayoutGrid,
  ShoppingBag,
  User,
} from "lucide-react";
import { notificationsAtom, ordersAtom } from "@/state/store";

const NAV_ITEMS = [
  { path: "/", label: "Trang chủ", Icon: Home },
  { path: "/orders", label: "Đơn hàng", Icon: ShoppingBag },
  { path: "/categories", label: "Danh mục", Icon: LayoutGrid },
  { path: "/notifications", label: "Thông báo", Icon: Bell },
  { path: "/profile", label: "Tài khoản", Icon: User },
] as const;

export const BottomNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const notifications = useAtomValue(notificationsAtom);
  const orders = useAtomValue(ordersAtom);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const activeOrdersCount = orders.filter(
    (o) => o.status === "pending" || o.status === "confirmed" || o.status === "shipping"
  ).length;

  // Hide bottom nav on full-flow subpages like Product Detail, Cart, Checkout, Policy
  const visiblePaths = ["/", "/orders", "/categories", "/notifications", "/profile"];
  if (!visiblePaths.includes(location.pathname)) {
    return null;
  }

  return (
    <nav
      aria-label="Điều hướng chính"
      className="fixed bottom-0 left-1/2 z-40 w-full max-w-[440px] -translate-x-1/2 rounded-t-2xl border-t border-[#DCE1F0] bg-white px-1.5 pt-1.5 zmp-safe-bottom"
    >
      <ul className="grid grid-cols-5 items-center">
        {NAV_ITEMS.map(({ path, label, Icon }) => {
          const isActive = location.pathname === path;
          const badge =
            path === "/notifications"
              ? unreadCount
              : path === "/orders"
              ? activeOrdersCount
              : 0;

          return (
            <li key={path}>
              <button
                type="button"
                onClick={() => navigate(path)}
                className="flex w-full flex-col items-center justify-center gap-0.5 py-0.5 transition-colors duration-150"
              >
                <span
                  className={`relative flex h-8 w-12 items-center justify-center rounded-full transition-colors duration-150 ${
                    isActive
                      ? "bg-[#E6E9FC] text-[#3E4095]"
                      : "text-[#3E486B] hover:text-[#3E4095]"
                  }`}
                >
                  <Icon
                    size={20}
                    strokeWidth={isActive ? 2.25 : 1.85}
                  />
                  {badge > 0 && (
                    <span className="tabular-nums absolute -right-0.5 top-0 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#D92D20] px-1 text-[10px] font-bold text-white">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </span>
                <span
                  className={`text-[11px] leading-tight ${
                    isActive
                      ? "font-semibold text-[#3E4095]"
                      : "font-normal text-[#3E486B]"
                  }`}
                >
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
