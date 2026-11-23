import React, { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAtomValue } from "jotai";
import { ChevronLeft, Clock, MapPin, Share2 } from "lucide-react";
import { articlesAtom } from "@/state/store";
import { ArticleVisualHeader } from "@/components/ArticleCard";
import { BrandLogo } from "@/components/BrandLogo";
import { ZaloPreviewCapsule } from "@/components/ZaloPreviewCapsule";
import { useAppActions } from "@/hooks/useAppActions";

const PolicyPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const articles = useAtomValue(articlesAtom);
  const { shareContent } = useAppActions();

  const article =
    articles.find((a) => a.slug === slug) || articles[0];

  useEffect(() => {
    window.scrollTo(0, 0);
    document
      .querySelectorAll(".zaui-routes-item")
      .forEach((el) => ((el as HTMLElement).scrollTop = 0));
  }, [article.slug]);

  const otherPolicies = articles.filter((a) => a.slug !== article.slug);

  return (
    <div className="min-h-screen bg-white pb-20">
      {/* Top Emerald Header matching Screenshot 4 */}
      <header className="sticky top-0 z-30 bg-[#3E4095] text-white zmp-safe-top">
        <div className="flex h-[52px] items-center justify-between gap-2 px-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              aria-label="Quay lại"
              onClick={() => navigate(-1)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-white/15"
            >
              <ChevronLeft size={22} />
            </button>
            <h1 className="truncate text-[17px] font-bold">{article.title}</h1>
          </div>
          <ZaloPreviewCapsule tone="on-dark" />
        </div>
      </header>

      {/* Top Banner Illustration matching Screenshot 4 */}
      <ArticleVisualHeader article={article} heightClass="h-[168px]" />

      {/* Article Body matching Screenshot 4 */}
      <main className="px-4 pt-4">
        <h2 className="text-[20px] font-bold leading-snug text-[#121833]">
          {article.title}
        </h2>

        <div className="mt-2 flex flex-wrap items-center gap-4 text-[12.5px] text-[#3E486B]">
          <span className="inline-flex items-center gap-1">
            <MapPin size={14} className="text-[#3E4095]" />
            <span>{article.authorLocation}</span>
          </span>
          <span className="tabular-nums inline-flex items-center gap-1">
            <Clock size={14} className="text-[#5A658A]" />
            <span>{article.updatedAt}</span>
          </span>
        </div>

        {/* Share Callout Strip (exact Screenshot 4 pattern) */}
        <button
          type="button"
          onClick={() => shareContent(article.title)}
          className="mt-4 flex w-full items-center justify-between rounded-xl bg-[#E8ECFD] px-3.5 py-2.5 text-left transition-colors hover:bg-[#DDE1FA]"
        >
          <div className="flex items-center gap-2.5">
            <BrandLogo size={28} variant="light-box" />
            <span className="text-[13px] font-semibold text-[#282A6E]">
              Chia sẻ tin {article.title}
            </span>
          </div>
          <Share2 size={17} className="shrink-0 text-[#3E4095]" />
        </button>

        {/* Structured Content Sections */}
        <div className="mt-5 space-y-5 text-[14.5px] leading-[1.65] text-[#121833]">
          {article.sections.map((sec, idx) => (
            <section key={idx}>
              <h3 className="text-[15.5px] font-bold text-[#121833]">
                {sec.heading}
              </h3>
              <div className="mt-2 space-y-2.5 text-[#3E486B]">
                {sec.paragraphs.map((p, pIdx) => (
                  <p key={pIdx}>{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Quick Links to Other Mandatory Zalo Policies */}
        <section className="mt-8 border-t border-[#DCE1F0] pt-5 pb-4">
          <h3 className="text-[15px] font-bold text-[#121833]">
            Chính sách & Thông tin liên quan
          </h3>
          <div className="mt-2.5 space-y-2">
            {otherPolicies.map((item) => (
              <button
                key={item.slug}
                type="button"
                onClick={() => navigate(`/policy/${item.slug}`)}
                className="flex w-full items-center justify-between rounded-xl border border-[#DCE1F0] bg-[#FAFBFF] px-3.5 py-2.5 text-left text-[13px] font-medium text-[#121833] hover:border-[#9AA0E6]"
              >
                <span className="truncate">{item.title}</span>
                <span className="ml-2 shrink-0 text-[11.5px] text-[#3E4095]">
                  Xem
                </span>
              </button>
            ))}
          </div>
        </section>
      </main>

      {/* Fixed Bottom Share Bar matching Screenshot 4 */}
      <div className="fixed bottom-0 left-1/2 z-40 w-full max-w-[440px] -translate-x-1/2 border-t border-[#DCE1F0] bg-white zmp-safe-bottom">
        <button
          type="button"
          onClick={() => shareContent(article.title)}
          className="flex w-full items-center justify-center gap-2 py-3 text-[14.5px] font-semibold text-[#121833] hover:bg-[#F3F5FB]"
        >
          <Share2 size={17} className="text-[#3E4095]" />
          <span>Chia sẻ</span>
        </button>
      </div>
    </div>
  );
};

export default PolicyPage;
