import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAtomValue } from "jotai";
import {
  Award,
  Building2,
  CheckCircle2,
  ChevronRight,
  LogIn,
  Phone,
  Search,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import {
  articlesAtom,
  bannersAtom,
  categoriesAtom,
  companyInfoAtom,
  productsAtom,
  productTagsAtom,
  userProfileAtom,
} from "@/state/store";
import { CUSTOMER_TIERS, formatVnd, isPrescriptionProduct } from "@/utils/format";
import { BrandLogo } from "@/components/BrandLogo";
import { CategoryIcon, ShortcutOrCategoryIconKey } from "@/components/CategoryIcon";
import { ProductCard } from "@/components/ProductCard";
import { ArticleCard } from "@/components/ArticleCard";
import { ZaloPreviewCapsule } from "@/components/ZaloPreviewCapsule";
import { useAppActions } from "@/hooks/useAppActions";

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const user = useAtomValue(userProfileAtom);
  const products = useAtomValue(productsAtom);
  const categories = useAtomValue(categoriesAtom);
  const productTags = useAtomValue(productTagsAtom);
  const banners = useAtomValue(bannersAtom);
  const articles = useAtomValue(articlesAtom);
  const companyInfo = useAtomValue(companyInfoAtom);
  const { openSupportSheet, loginWithZalo } = useAppActions();

  const [scrolled, setScrolled] = useState(false);
  const [bannerIdx, setBannerIdx] = useState(0);
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    const onScroll = (e: Event) => {
      const target = e.target as HTMLElement | Document;
      const top =
        target instanceof HTMLElement ? target.scrollTop : window.scrollY;
      setScrolled(top > 48);
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, []);

  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => {
      setBannerIdx((prev) => (prev + 1) % banners.length);
    }, 4800);
    return () => clearInterval(timer);
  }, [banners.length]);

  const currentBanner = banners[bannerIdx % Math.max(1, banners.length)] || banners[0];
  const tierInfo = CUSTOMER_TIERS[user.customerTier];

  const countByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (let i = 0; i < products.length; i += 1) {
      const cid = products[i].categoryId;
      map[cid] = (map[cid] || 0) + 1;
    }
    return map;
  }, [products]);

  const bioCareProducts = useMemo(
    () => products.filter((p) => p.categoryId === "cty-biocare").slice(0, 10),
    [products]
  );
  const dapharcoPromoProducts = useMemo(
    () =>
      products
        .filter((p) => p.categoryId === "cty-dapharco" && !isPrescriptionProduct(p))
        .slice(0, 10),
    [products]
  );
  const anThienOtcProducts = useMemo(
    () =>
      products
        .filter((p) => p.categoryId === "cty-an-thien" && !isPrescriptionProduct(p))
        .slice(0, 6),
    [products]
  );

  const policyArticles = articles.filter((a) => a.group === "policy");
  const aboutArticles = articles.filter((a) => a.group === "about");

  // 3 quick actions + 5 cross-company product tags = 8 balanced icons (2x4)
  const gridShortcuts: {
    key: string;
    label: string;
    iconKey: ShortcutOrCategoryIconKey;
    isRx?: boolean;
    onClick: () => void;
  }[] = [
    {
      key: "sc-store",
      label: "Tất cả SP",
      iconKey: "store",
      onClick: () => navigate("/categories"),
    },
    {
      key: "sc-voucher",
      label: "Ưu đãi",
      iconKey: "voucher",
      onClick: () => navigate("/vouchers"),
    },
    {
      key: "sc-contact",
      label: "Tư vấn DS",
      iconKey: "contact",
      onClick: () => openSupportSheet(),
    },
    ...productTags.slice(0, 5).map((tg) => ({
      key: tg.id,
      label: tg.shortName,
      iconKey: tg.iconKey as ShortcutOrCategoryIconKey,
      isRx: tg.id === "nhom-thuoc-ke-don",
      onClick: () => navigate(`/categories?tag=${tg.id}`),
    })),
  ];

  return (
    <div className="min-h-screen bg-[#F3F5FB] pb-24">
      {/* Top Zalo Mini App Header (Royal Pharma Blue #3E4095 -> white on scroll) */}
      <header
        className={`sticky top-0 z-30 transition-colors duration-200 zmp-safe-top ${
          scrolled
            ? "border-b border-[#DCE1F0] bg-white text-[#121833]"
            : "bg-[#3E4095] text-white"
        }`}
      >
        <div className="flex h-[52px] items-center justify-between px-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <BrandLogo
              size={36}
              variant={scrolled ? "brand-box" : "light-box"}
            />
            <div className="min-w-0">
              <p
                className={`truncate text-[11px] leading-tight ${
                  scrolled ? "text-[#3E486B]" : "text-[#E6E9FC]"
                }`}
              >
                Hệ thống phân phối chuẩn GSP
              </p>
              <h1 className="truncate text-[15px] font-bold leading-snug">
                {companyInfo.shortName}
              </h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-label="Tìm kiếm sản phẩm"
              onClick={() => navigate("/categories?focusSearch=1")}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                scrolled
                  ? "bg-[#EEF0FD] text-[#3E4095] hover:bg-[#E6E9FC]"
                  : "bg-white/15 text-white hover:bg-white/25"
              }`}
            >
              <Search size={18} strokeWidth={2.1} />
            </button>
            <ZaloPreviewCapsule tone={scrolled ? "on-light" : "on-dark"} />
          </div>
        </div>
      </header>

      {/* Hero Banner Slider */}
      <section aria-label="Chương trình nổi bật" className="relative">
        {currentBanner && (
          <div
            onClick={() => navigate(currentBanner.ctaLink)}
            className="relative h-[218px] w-full cursor-pointer overflow-hidden bg-[#E6E9FC]"
          >
            <div className="grid h-full grid-cols-12 items-center px-4 pb-7">
              <div className="col-span-7 z-10 pr-2">
                <span className="inline-block rounded-full bg-[#3E4095] px-2.5 py-0.5 text-[11px] font-bold text-white">
                  {currentBanner.badge}
                </span>
                <p className="mt-1.5 line-clamp-2 text-[15.5px] font-extrabold leading-snug text-[#1E2059]">
                  {currentBanner.title}
                </p>
                <ul className="mt-2 space-y-1">
                  {currentBanner.points.map((pt, i) => (
                    <li
                      key={i}
                      className="truncate rounded-full bg-[#282A6E] px-2.5 py-0.5 text-[11px] font-medium text-[#EEF0FD]"
                    >
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="col-span-5 flex justify-end">
                <div className="h-[142px] w-[124px] overflow-hidden rounded-[999px] border-2 border-white bg-white">
                  <img
                    src={currentBanner.image}
                    alt={currentBanner.title}
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
            </div>

            <button
              type="button"
              aria-label="Chuyển slide tiếp theo"
              onClick={(e) => {
                e.stopPropagation();
                setBannerIdx((prev) => (prev + 1) % Math.max(1, banners.length));
              }}
              className="tabular-nums absolute bottom-9 right-3 rounded-full bg-[#1E2059]/75 px-2.5 py-0.5 text-[11px] font-semibold text-white"
            >
              {(bannerIdx % Math.max(1, banners.length)) + 1}/{banners.length}
            </button>
          </div>
        )}

        {/* Overlapping Member Loyalty & Zalo Login Card */}
        <div className={`relative z-20 px-3.5 ${currentBanner ? "-mt-7" : "pt-3.5"}`}>
          {user.zaloLoggedIn ? (
            <button
              type="button"
              onClick={() => navigate("/profile?openPoints=1")}
              className="flex w-full items-center justify-between rounded-2xl border border-[#DCE1F0] bg-white px-3.5 py-3 text-left transition-colors hover:border-[#9CA4F5]"
            >
              <div className="flex min-w-0 items-center gap-3">
                {user.avatarUrl && !avatarFailed ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    onError={() => setAvatarFailed(true)}
                    className="h-11 w-11 shrink-0 rounded-full border border-[#C5CAFA] object-cover"
                  />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#3E4095] text-[14px] font-bold text-white">
                    {user.avatarInitials}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[15px] font-bold text-[#121833]">
                      {user.name}
                    </span>
                    <CheckCircle2
                      size={14}
                      className="shrink-0 text-[#3E4095]"
                      aria-label="Đã kết nối Zalo"
                    />
                  </div>
                  <div className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-medium text-[#3E486B]">
                    <Award size={13.5} className="text-[#D97706]" />
                    <span>{tierInfo.shortLabel}</span>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5 pl-2">
                <div className="text-right">
                  <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#5A658A]">
                    <Wallet size={12} className="text-[#3E4095]" />
                    <span>Ví tích điểm</span>
                  </div>
                  <div className="tabular-nums text-[15px] font-extrabold text-[#3E4095]">
                    {user.loyaltyPoints} điểm
                  </div>
                  {user.loyaltyPoints > 0 && (
                    <div className="tabular-nums text-[10.5px] font-medium text-[#5A658A]">
                      ≈ {formatVnd(user.loyaltyPoints * 1000)}
                    </div>
                  )}
                </div>
                <ChevronRight size={16} className="text-[#5A658A]" />
              </div>
            </button>
          ) : (
            <div className="flex w-full items-center justify-between gap-2.5 rounded-2xl border border-[#C5CAFA] bg-white px-3.5 py-3">
              <button
                type="button"
                onClick={() => navigate("/profile")}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#EEF0FD] text-[13px] font-extrabold text-[#3E4095]">
                  Zalo
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-bold text-[#121833]">
                    Đăng nhập tích điểm Zalo
                  </div>
                  <div className="mt-0.5 truncate text-[11.5px] font-medium text-[#3E486B]">
                    Tặng ngay{" "}
                    <strong className="font-bold text-[#3E4095]">
                      +50 điểm
                    </strong>{" "}
                    (= 50.000đ)
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => void loginWithZalo()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#3E4095] px-3 py-2 text-[12px] font-bold text-white transition-colors hover:bg-[#31337A]"
              >
                <LogIn size={14} />
                <span>Đăng nhập</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 5 Cross-Category Tag Groups + Quick Utilities (2x4 Grid) */}
      <section
        aria-label="5 Nhóm phân loại nhanh & tiện ích"
        className="mt-2 border-y border-[#DCE1F0] bg-white px-4 py-4"
      >
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-[12px] font-bold uppercase tracking-wide text-[#3E4095]">
            Nhóm phân loại sản phẩm
          </span>
          <span className="text-[11.5px] text-[#5A658A]">Đa nhãn</span>
        </div>
        <div className="grid grid-cols-4 gap-x-2 gap-y-3.5">
          {gridShortcuts.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              className="group flex flex-col items-center text-center"
            >
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-colors ${
                  item.isRx
                    ? "bg-[#FFEDEA] group-hover:bg-[#FDD8D3]"
                    : "bg-[#EEF0FD] group-hover:bg-[#E6E9FC]"
                }`}
              >
                <CategoryIcon iconKey={item.iconKey} size={24} />
              </span>
              <span className="mt-1.5 line-clamp-2 text-[11.5px] font-medium leading-tight text-[#121833]">
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* 9 Partner Pharmaceutical Companies Grid */}
      <section className="mt-3 border-y border-[#DCE1F0] bg-white px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Building2 size={16} className="text-[#3E4095]" />
            <h2 className="text-[15.5px] font-bold text-[#121833]">
              Danh mục theo Công ty ({categories.length})
            </h2>
          </div>
          <button
            type="button"
            onClick={() => navigate("/categories")}
            className="text-[12.5px] font-semibold text-[#3E4095]"
          >
            Xem tất cả
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {categories.map((cat) => {
            const cnt = countByCategory[cat.id] || 0;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => navigate(`/categories?cat=${cat.id}`)}
                className="flex flex-col justify-between rounded-xl border border-[#DCE1F0] bg-[#FAFBFF] p-2.5 text-left transition-colors hover:border-[#3E4095] hover:bg-[#EEF0FD]"
              >
                <div className="line-clamp-1 text-[12.5px] font-bold text-[#121833]">
                  {cat.shortName}
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span
                    className={`tabular-nums rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${
                      cnt > 0
                        ? "bg-[#E6E9FC] text-[#282A6E]"
                        : "bg-[#EBEDEE] text-[#5A658A]"
                    }`}
                  >
                    {cnt > 0 ? `${cnt} SP` : "Sắp lên"}
                  </span>
                  <ChevronRight size={13} className="text-[#5A658A]" />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Mid-Page Quality Assurance Banner */}
      <section className="px-3.5 pt-3.5">
        <div
          onClick={() => navigate("/policy/gioi-thieu-nesphar")}
          className="flex cursor-pointer items-center justify-between gap-3 overflow-hidden rounded-2xl border border-[#C5CAFA] bg-[#EAEEFD] p-3.5"
        >
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-1 text-[12px] font-bold uppercase text-[#3E4095]">
              <ShieldCheck size={15} />
              <span>CHUẨN GSP / FEFO HÀ TĨNH</span>
            </div>
            <p className="mt-1 text-[13px] font-bold text-[#121833]">
              Phân loại rõ Kê đơn (Rx) · Không kê đơn · Nhập khẩu
            </p>
            <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-[#3E486B]">
              Kiểm soát chặt Số lô, Hạn dùng và tự động áp giá sỉ bậc thang cho Nhà thuốc, Quầy thuốc đối tác.
            </p>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#3E4095] px-2.5 py-0.5 text-[10.5px] font-semibold text-white">
              <Phone size={11} />
              <span>Dược sĩ NESPHAR: {companyInfo.hotlineDisplay}</span>
            </div>
          </div>

          {products.length >= 2 && (
            <div className="flex shrink-0 -space-x-2.5 pr-1">
              <img
                src={products[0].images[0]}
                alt="BioCare"
                className="h-16 w-14 -rotate-6 rounded-lg border-2 border-white bg-white object-contain"
              />
              <img
                src={(products[4] || products[1]).images[0]}
                alt="Dr.life"
                className="z-10 h-16 w-14 rotate-3 rounded-lg border-2 border-white bg-white object-contain"
              />
            </div>
          )}
        </div>
      </section>

      {/* Section 1: Công ty BioCare (TPBVSK Nhập khẩu - Giá sỉ bậc thang) */}
      {bioCareProducts.length > 0 && (
        <section className="mt-5">
          <div className="flex items-center justify-between px-3.5">
            <div>
              <h2 className="text-[16.5px] font-bold text-[#121833]">
                Công ty BioCare · Nhập khẩu
              </h2>
              <p className="text-[11.5px] text-[#5A658A]">
                Ưu đãi giá bậc thang: 1–5 · 6–20 · 21+ hộp
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/categories?cat=cty-biocare")}
              className="text-[13px] font-semibold text-[#3E4095]"
            >
              Xem {countByCategory["cty-biocare"] || 33} SP
            </button>
          </div>

          <div className="no-scrollbar mt-3 flex gap-2.5 overflow-x-auto px-3.5 pb-1">
            {bioCareProducts.map((product) => (
              <ProductCard key={product.id} product={product} compactWidth />
            ))}
          </div>
        </section>
      )}

      {/* Section 2: Công ty Dapharco (CTKM Mua X Tặng Y) */}
      {dapharcoPromoProducts.length > 0 && (
        <section className="mt-5">
          <div className="flex items-center justify-between px-3.5">
            <div>
              <h2 className="text-[16.5px] font-bold text-[#121833]">
                CTKM Công ty Dapharco
              </h2>
              <p className="text-[11.5px] text-[#5A658A]">
                TPBVSK Nhập khẩu, Vật tư y tế, Sát khuẩn & Tinh dầu
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/categories?cat=cty-dapharco")}
              className="text-[13px] font-semibold text-[#3E4095]"
            >
              Xem {countByCategory["cty-dapharco"] || 143} SP
            </button>
          </div>

          <div className="no-scrollbar mt-3 flex gap-2.5 overflow-x-auto px-3.5 pb-1">
            {dapharcoPromoProducts.map((product) => (
              <ProductCard key={product.id} product={product} compactWidth />
            ))}
          </div>
        </section>
      )}

      {/* Section 3: Công ty An Thiên (OTC & Nhi khoa nổi bật) */}
      {anThienOtcProducts.length > 0 && (
        <section className="mt-5 px-3.5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[16.5px] font-bold text-[#121833]">
                Dược phẩm Công ty An Thiên
              </h2>
              <p className="text-[11.5px] text-[#5A658A]">
                Thuốc không kê đơn & Ống uống / Siro Nhi khoa GMP-WHO
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/categories?cat=cty-an-thien")}
              className="text-[13px] font-semibold text-[#3E4095]"
            >
              Xem {countByCategory["cty-an-thien"] || 191} SP
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {anThienOtcProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      {/* Section: Điều khoản sử dụng */}
      <section className="mt-6">
        <div className="flex items-center justify-between px-3.5">
          <h2 className="text-[17px] font-bold text-[#121833]">
            Điều khoản sử dụng
          </h2>
          <button
            type="button"
            onClick={() => navigate("/policy/dieu-khoan-chinh-sach")}
            className="text-[13px] font-medium text-[#3E4095] hover:underline"
          >
            Xem tất cả
          </button>
        </div>

        <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto px-3.5 pb-1">
          {policyArticles.map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
        </div>
      </section>

      {/* Section: VỀ CHÚNG TÔI */}
      <section className="mt-6 pb-4">
        <div className="flex items-center justify-between px-3.5">
          <h2 className="text-[17px] font-bold uppercase text-[#121833]">
            Về chúng tôi
          </h2>
          <button
            type="button"
            onClick={() => navigate("/policy/thong-tin-lien-he")}
            className="text-[13px] font-medium text-[#3E4095] hover:underline"
          >
            Xem tất cả
          </button>
        </div>

        <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto px-3.5 pb-1">
          {aboutArticles.map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
        </div>
      </section>
    </div>
  );
};

export default HomePage;
