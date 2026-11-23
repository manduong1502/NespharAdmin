import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAtomValue } from "jotai";
import {
  Headset,
  Maximize2,
  MessageCircle,
  Minimize2,
  PhoneCall,
  ShoppingCart,
} from "lucide-react";
import { cartTotalCountAtom } from "@/state/store";
import { useAppActions } from "@/hooks/useAppActions";

export const FloatingCartPill: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const cartCount = useAtomValue(cartTotalCountAtom);
  const { callHotline, chatZaloOA, openSupportSheet } = useAppActions();
  const [expanded, setExpanded] = useState(false);

  // Hide on Cart and Checkout screens where cart controls are already full-screen
  if (location.pathname === "/cart" || location.pathname === "/checkout") {
    return null;
  }

  return (
    <div className="fixed bottom-[86px] right-[max(12px,calc(50vw-208px))] z-40 flex flex-col items-end gap-2">
      {/* Quick Pharmacy Support Menu when expanded */}
      {expanded && (
        <div className="flex flex-col gap-1.5 rounded-2xl border border-[#DCE1F0] bg-white p-2 text-[#121833]">
          <button
            type="button"
            onClick={() => {
              setExpanded(false);
              callHotline();
            }}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[12.5px] font-medium text-[#121833] hover:bg-[#EEF0FD]"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E6E9FC] text-[#3E4095]">
              <PhoneCall size={14} />
            </span>
            <span>Gọi Dược sĩ 0978.420.766</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setExpanded(false);
              chatZaloOA();
            }}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[12.5px] font-medium text-[#121833] hover:bg-[#EEF0FD]"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E6E9FC] text-[#3E4095]">
              <MessageCircle size={14} />
            </span>
            <span>Chat Zalo OA NESPHAR</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setExpanded(false);
              openSupportSheet();
            }}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[12.5px] font-medium text-[#121833] hover:bg-[#EEF0FD]"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E6E9FC] text-[#3E4095]">
              <Headset size={14} />
            </span>
            <span>Gửi yêu cầu tư vấn / Phản hồi</span>
          </button>
        </div>
      )}

      {/* Signature 2-button pill matching all 11 reference screenshots */}
      <div className="flex w-11 flex-col items-center rounded-full bg-[#232852]/75 py-1.5 text-white backdrop-blur-md">
        <button
          type="button"
          aria-label="Mở giỏ hàng"
          onClick={() => navigate("/cart")}
          className="relative flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-white/15 active:scale-95"
        >
          <ShoppingCart size={18} strokeWidth={2} />
          {cartCount > 0 && (
            <span className="tabular-nums absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#D92D20] px-1 text-[10px] font-bold text-white">
              {cartCount > 99 ? "99+" : cartCount}
            </span>
          )}
        </button>

        <span className="my-1 h-px w-6 bg-white/25" />

        <button
          type="button"
          aria-label={expanded ? "Thu gọn tiện ích" : "Mở tiện ích hỗ trợ nhanh"}
          onClick={() => setExpanded((prev) => !prev)}
          className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-white/15 active:scale-95"
        >
          {expanded ? (
            <Minimize2 size={16} strokeWidth={2} />
          ) : (
            <Maximize2 size={16} strokeWidth={2} />
          )}
        </button>
      </div>
    </div>
  );
};
