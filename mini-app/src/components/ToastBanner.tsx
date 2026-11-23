import React from "react";
import { useAtomValue } from "jotai";
import { CheckCircle2 } from "lucide-react";
import { toastMessageAtom } from "@/state/store";

export const ToastBanner: React.FC = () => {
  const message = useAtomValue(toastMessageAtom);
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="toast-enter pointer-events-none fixed left-1/2 top-16 z-50 flex w-max max-w-[90vw] -translate-x-1/2 items-center gap-2 rounded-full bg-[#1E2059] px-4 py-2 text-[12.5px] font-medium text-[#FAFBFF]"
    >
      <CheckCircle2 size={15} className="shrink-0 text-[#9AA0E6]" />
      <span className="truncate">{message}</span>
    </div>
  );
};
