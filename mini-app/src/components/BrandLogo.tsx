import React from "react";
import nespharLogo from "@/static/images/nesphar-logo.png";

interface BrandLogoProps {
  size?: number;
  variant?: "light-box" | "emerald-box" | "brand-box" | "inline";
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 38,
  variant = "light-box",
  className = "",
}) => {
  const boxClass =
    variant === "inline"
      ? "bg-transparent"
      : variant === "light-box"
      ? "bg-[#FFFFFF] border border-[#DCE1F0]/80"
      : "bg-[#EEF0FD] border border-[#C5CAFA]";

  const imgSize = variant === "inline" ? size : Math.round(size * 0.84);

  return (
    <div
      style={{ width: size, height: size }}
      className={`inline-flex shrink-0 items-center justify-center rounded-xl overflow-hidden select-none ${boxClass} ${className}`}
      aria-label="Logo Dược Phẩm NESPHAR"
    >
      <img
        src={nespharLogo}
        alt="NESPHAR"
        style={{ width: imgSize, height: imgSize }}
        className="object-contain"
      />
    </div>
  );
};
