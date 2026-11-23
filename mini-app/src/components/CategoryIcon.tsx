import React from "react";
import {
  Activity,
  Baby,
  HeartHandshake,
  Newspaper,
  Pill,
  ShieldPlus,
  Sparkles,
  Stethoscope,
  TicketPercent,
} from "lucide-react";
import nespharLogo from "@/static/images/nesphar-logo.png";

export type ShortcutOrCategoryIconKey =
  | "store"
  | "voucher"
  | "news"
  | "contact"
  | "supplement"
  | "derma"
  | "medical-supply"
  | "device"
  | "mom-baby"
  | "personal-care";

interface CategoryIconProps {
  iconKey: ShortcutOrCategoryIconKey;
  active?: boolean;
  size?: number;
}

export const CategoryIcon: React.FC<CategoryIconProps> = ({
  iconKey,
  active = false,
  size = 26,
}) => {
  const strokeColor = active ? "#1E2059" : "#3E4095";
  const commonProps = {
    size,
    strokeWidth: 1.75,
    color: strokeColor,
  };

  switch (iconKey) {
    case "store":
      return (
        <img
          src={nespharLogo}
          alt="Cửa hàng NESPHAR"
          style={{ width: size + 4, height: size + 4 }}
          className="object-contain select-none"
        />
      );
    case "voucher":
      return <TicketPercent {...commonProps} />;
    case "news":
      return <Newspaper {...commonProps} />;
    case "contact":
      return <HeartHandshake {...commonProps} />;
    case "supplement":
      return <Pill {...commonProps} />;
    case "derma":
      return <Sparkles {...commonProps} />;
    case "medical-supply":
      return <ShieldPlus {...commonProps} />;
    case "device":
      return <Stethoscope {...commonProps} />;
    case "mom-baby":
      return <Baby {...commonProps} />;
    case "personal-care":
    default:
      return <Activity {...commonProps} />;
  }
};
