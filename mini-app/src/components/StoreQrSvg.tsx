import React from "react";
import { BrandLogo } from "./BrandLogo";

export const StoreQrSvg: React.FC<{ size?: number }> = ({ size = 196 }) => {
  // Deterministic 21x21 QR-like geometric matrix with proper finder patterns
  const grid = 21;
  const isFinder = (r: number, c: number, fr: number, fc: number) => {
    const dr = r - fr;
    const dc = c - fc;
    if (dr < 0 || dr > 6 || dc < 0 || dc > 6) return null;
    if (dr === 0 || dr === 6 || dc === 0 || dc === 6) return true;
    if (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4) return true;
    return false;
  };

  const cells: { r: number; c: number }[] = [];
  for (let r = 0; r < grid; r++) {
    for (let c = 0; c < grid; c++) {
      // Leave center 5x5 clear for NESPHAR logo
      if (r >= 8 && r <= 12 && c >= 8 && c <= 12) continue;

      const tl = isFinder(r, c, 0, 0);
      const tr = isFinder(r, c, 0, 14);
      const bl = isFinder(r, c, 14, 0);

      if (tl !== null) {
        if (tl) cells.push({ r, c });
        continue;
      }
      if (tr !== null) {
        if (tr) cells.push({ r, c });
        continue;
      }
      if (bl !== null) {
        if (bl) cells.push({ r, c });
        continue;
      }

      // Separator quiet border around finders
      if ((r === 7 && (c <= 7 || c >= 13)) || (c === 7 && (r <= 7 || r >= 13))) continue;
      if (r === 13 && c <= 7) continue;
      if (c === 13 && r <= 7) continue;

      // Timing lines & deterministic hash pattern
      if (r === 6 || c === 6) {
        if ((r + c) % 2 === 0) cells.push({ r, c });
        continue;
      }

      const hash = ((r * 37 + c * 19 + r * c * 7 + 11) % 13) < 6;
      if (hash) cells.push({ r, c });
    }
  }

  return (
    <div
      style={{ width: size + 28, height: size + 28 }}
      className="relative mx-auto flex items-center justify-center rounded-2xl border border-[#DCE1F0] bg-white p-3.5"
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${grid} ${grid}`}
        shapeRendering="crispEdges"
        aria-label="Mã QR cửa hàng Dược phẩm NESPHAR"
      >
        <rect width={grid} height={grid} fill="#FFFFFF" />
        {cells.map(({ r, c }) => (
          <rect
            key={`${r}-${c}`}
            x={c + 0.06}
            y={r + 0.06}
            width={0.88}
            height={0.88}
            rx={0.16}
            fill="#121833"
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="rounded-xl bg-white p-1 border border-[#DCE1F0]">
          <BrandLogo size={38} variant="emerald-box" />
        </div>
      </div>
    </div>
  );
};
