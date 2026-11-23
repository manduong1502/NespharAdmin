import React from "react";
import { MoreHorizontal, X } from "lucide-react";

interface ZaloPreviewCapsuleProps {
  tone?: "on-dark" | "on-light";
}

export const ZaloPreviewCapsule: React.FC<ZaloPreviewCapsuleProps> = ({
  tone = "on-dark",
}) => {
  // Only render visual capsule in standalone browser preview; inside Zalo WebView reserve 86px for native Zalo capsule
  const isZaloEnv =
    typeof window !== "undefined" &&
    ("ZJSBridge" in window ||
      window.self !== window.top ||
      navigator.userAgent.toLowerCase().includes("zalo"));

  if (isZaloEnv) {
    return <div aria-hidden="true" className="h-[30px] w-[86px] shrink-0" />;
  }

  return (
    <div
      aria-hidden="true"
      className={`inline-flex h-[30px] items-center rounded-full px-2.5 select-none pointer-events-none ${
        tone === "on-dark"
          ? "bg-[#1E2059]/45 text-[#FAFBFF] border border-[#FAFBFF]/20"
          : "bg-[#EDF0F8] text-[#121833] border border-[#DCE1F0]"
      }`}
    >
      <MoreHorizontal size={16} strokeWidth={2.2} />
      <span
        className={`mx-2 h-3.5 w-px ${
          tone === "on-dark" ? "bg-[#FAFBFF]/25" : "bg-[#BEC4DE]"
        }`}
      />
      <X size={15} strokeWidth={2.2} />
    </div>
  );
};
