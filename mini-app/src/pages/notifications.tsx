import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAtom, useAtomValue } from "jotai";
import {
  BellOff,
  CheckCheck,
  Package,
  Sparkles,
  Volume2,
} from "lucide-react";
import { customerIdAtom, notificationsAtom } from "@/state/store";
import {
  markAllNotificationsReadApi,
  markNotificationReadApi,
} from "@/services/api";
import { ZaloPreviewCapsule } from "@/components/ZaloPreviewCapsule";

type NotiFilter = "all" | "order" | "promo" | "archived";

const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const customerId = useAtomValue(customerIdAtom);
  const [notifications, setNotifications] = useAtom(notificationsAtom);
  const [filter, setFilter] = useState<NotiFilter>("all");

  const filtered =
    filter === "archived"
      ? []
      : filter === "all"
      ? notifications
      : notifications.filter((n) => n.type === filter);

  const markAllRead = async () => {
    setNotifications(notifications.map((n) => ({ ...n, read: true })));
    try {
      await markAllNotificationsReadApi(customerId);
    } catch {
      // local state kept
    }
  };

  const handleOpenNoti = (id: string, targetLink?: string) => {
    setNotifications(
      notifications.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    void markNotificationReadApi(id, customerId).catch(() => {});
    if (targetLink) navigate(targetLink);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#F3F5FB] pb-24">
      {/* Emerald Header matching Screenshot 7 */}
      <header className="sticky top-0 z-30 bg-[#3E4095] text-white zmp-safe-top">
        <div className="flex h-[52px] items-center justify-between px-3.5">
          <h1 className="text-[18px] font-bold">Thông báo</h1>
          <div className="flex items-center gap-2">
            {notifications.some((n) => !n.read) && (
              <button
                type="button"
                onClick={markAllRead}
                className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-white/25"
              >
                <CheckCheck size={14} />
                <span>Đọc hết</span>
              </button>
            )}
            <ZaloPreviewCapsule tone="on-dark" />
          </div>
        </div>

        <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-b border-[#DCE1F0] bg-white px-3 py-2">
          {[
            { id: "all", label: "Tất cả" },
            { id: "order", label: "Đơn hàng" },
            { id: "promo", label: "Ưu đãi" },
            { id: "archived", label: "Lưu trữ" },
          ].map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id as NotiFilter)}
                className={`shrink-0 rounded-full px-3.5 py-1 text-[12.5px] font-medium transition-colors ${
                  active
                    ? "bg-[#3E4095] text-white"
                    : "bg-[#F3F5FB] text-[#3E486B] hover:bg-[#E6E9FC]"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Empty State (exact Screenshot 7 visual when empty) vs Notification Cards */}
      {filtered.length === 0 ? (
        <main className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
          <BellOff size={52} strokeWidth={1.6} className="text-[#5A658A]" />
          <p className="mt-3 text-[15px] font-medium text-[#3E486B]">
            Chưa có thông báo
          </p>
        </main>
      ) : (
        <main className="space-y-2.5 p-3.5">
          {filtered.map((item) => {
            const Icon =
              item.type === "order"
                ? Package
                : item.type === "promo"
                ? Sparkles
                : Volume2;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleOpenNoti(item.id, item.targetLink)}
                className={`flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                  item.read
                    ? "border-[#DCE1F0] bg-white"
                    : "border-[#9AA0E6] bg-[#EEF0FD]"
                }`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E6E9FC] text-[#3E4095]">
                  <Icon size={19} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-[13.5px] font-bold text-[#121833]">
                      {item.title}
                    </h2>
                    {!item.read && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#3E4095]" />
                    )}
                  </div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-[#3E486B]">
                    {item.body}
                  </p>
                  <span className="mt-1.5 inline-block text-[11px] text-[#5A658A]">
                    {item.createdAt}
                  </span>
                </div>
              </button>
            );
          })}
        </main>
      )}
    </div>
  );
};

export default NotificationsPage;
