import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  FileCheck2,
  HeartPulse,
  PhoneCall,
  RefreshCcw,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { ArticleItem } from "@/types";

export const ArticleVisualHeader: React.FC<{
  article: ArticleItem;
  heightClass?: string;
}> = ({ article, heightClass = "h-[126px]" }) => {
  const getIcon = () => {
    switch (article.slug) {
      case "chinh-sach-bao-mat":
        return <ShieldCheck size={42} strokeWidth={1.7} className="text-[#3E4095]" />;
      case "chinh-sach-doi-tra":
        return <RefreshCcw size={40} strokeWidth={1.7} className="text-[#3E4095]" />;
      case "chinh-sach-giao-hang":
        return <Truck size={42} strokeWidth={1.7} className="text-[#3E4095]" />;
      case "thong-tin-lien-he":
        return <PhoneCall size={40} strokeWidth={1.7} className="text-[#3E4095]" />;
      case "gioi-thieu-nesphar":
        return <Building2 size={42} strokeWidth={1.7} className="text-[#3E4095]" />;
      case "cam-nang-bao-ve-gan":
        return <HeartPulse size={42} strokeWidth={1.7} className="text-[#3E4095]" />;
      default:
        return <FileCheck2 size={42} strokeWidth={1.7} className="text-[#3E4095]" />;
    }
  };

  const bgMap: Record<ArticleItem["bannerTone"], string> = {
    emerald: "bg-[#E8ECFD]",
    teal: "bg-[#E4EFFB]",
    mint: "bg-[#EAEFFD]",
    botanical: "bg-[#EDF1FC]",
  };

  return (
    <div
      className={`relative flex w-full items-center justify-between overflow-hidden px-4 ${heightClass} ${
        bgMap[article.bannerTone]
      }`}
    >
      <div className="z-10 max-w-[62%]">
        <div className="line-clamp-2 text-[15px] font-extrabold uppercase leading-snug text-[#282A6E]">
          {article.title}
        </div>
        <div className="mt-2.5 inline-flex items-center rounded-full bg-[#3E4095] px-2.5 py-0.5 text-[10px] font-semibold text-white">
          NESPHAR PHARMA
        </div>
      </div>

      <div className="z-10 flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-[#C5CAFA] bg-white">
        {getIcon()}
      </div>
    </div>
  );
};

export const ArticleCard: React.FC<{ article: ArticleItem }> = ({ article }) => {
  const navigate = useNavigate();

  return (
    <article
      onClick={() => navigate(`/policy/${article.slug}`)}
      className="flex w-[258px] shrink-0 cursor-pointer flex-col overflow-hidden rounded-xl border border-[#DCE1F0] bg-white transition-colors hover:border-[#9AA0E6]"
    >
      <ArticleVisualHeader article={article} />
      <div className="p-3">
        <h3 className="line-clamp-1 text-[14.5px] font-semibold text-[#121833]">
          {article.title}
        </h3>
        <p className="mt-1 line-clamp-1 text-[12px] text-[#3E486B]">
          {article.summary}
        </p>
      </div>
    </article>
  );
};
