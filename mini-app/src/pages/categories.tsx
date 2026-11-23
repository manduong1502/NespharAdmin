import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAtomValue } from "jotai";
import {
  ChevronDown,
  ChevronLeft,
  Filter,
  MessageCircle,
  RotateCcw,
  Search,
  Tag,
  X,
} from "lucide-react";
import { categoriesAtom, productsAtom, productTagsAtom } from "@/state/store";
import { BrandLogo } from "@/components/BrandLogo";
import { CategoryIcon } from "@/components/CategoryIcon";
import { ProductCard } from "@/components/ProductCard";
import { ZaloPreviewCapsule } from "@/components/ZaloPreviewCapsule";
import { calcDiscountPercent } from "@/utils/format";
import { useAppActions } from "@/hooks/useAppActions";

type SortKey =
  | "popular"
  | "bestseller"
  | "newest"
  | "price-asc"
  | "price-desc"
  | "discount";

const SORT_LABELS: Record<SortKey, string> = {
  popular: "Phổ biến",
  bestseller: "Bán chạy",
  newest: "Mới nhất",
  "price-asc": "Giá tăng dần",
  "price-desc": "Giá giảm dần",
  discount: "Ưu đãi sâu",
};

const PAGE_CHUNK = 24;

const CategoriesPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const products = useAtomValue(productsAtom);
  const categories = useAtomValue(categoriesAtom);
  const productTags = useAtomValue(productTagsAtom);
  const { chatZaloOA } = useAppActions();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const initialCat = searchParams.get("cat") || "all";
  const initialTag = searchParams.get("tag") || "all";
  const initialSort = (searchParams.get("sort") as SortKey) || "popular";

  const [selectedCat, setSelectedCat] = useState<string>(initialCat);
  const [selectedTag, setSelectedTag] = useState<string>(initialTag);
  const [query, setQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortKey>(
    SORT_LABELS[initialSort] ? initialSort : "popular"
  );
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [priceRange, setPriceRange] = useState<"all" | "under150" | "150to300" | "over300">("all");
  const [visibleLimit, setVisibleLimit] = useState<number>(PAGE_CHUNK);

  useEffect(() => {
    setSelectedCat(searchParams.get("cat") || "all");
    setSelectedTag(searchParams.get("tag") || "all");
    const paramSort = searchParams.get("sort") as SortKey | null;
    if (paramSort && SORT_LABELS[paramSort]) {
      setSortBy(paramSort);
    }
    if (searchParams.get("focusSearch") === "1") {
      setTimeout(() => searchInputRef.current?.focus(), 120);
    }
  }, [searchParams]);

  useEffect(() => {
    setVisibleLimit(PAGE_CHUNK);
  }, [selectedCat, selectedTag, query, onlyInStock, priceRange, sortBy]);

  const handleSelectCat = (catId: string) => {
    setSelectedCat(catId);
    const next = new URLSearchParams(searchParams);
    if (catId === "all") next.delete("cat");
    else next.set("cat", catId);
    next.delete("focusSearch");
    setSearchParams(next, { replace: true });
  };

  const handleSelectTag = (tagId: string) => {
    setSelectedTag(tagId);
    const next = new URLSearchParams(searchParams);
    if (tagId === "all") next.delete("tag");
    else next.set("tag", tagId);
    next.delete("focusSearch");
    setSearchParams(next, { replace: true });
  };

  const filteredProducts = useMemo(() => {
    let list = [...products];

    if (selectedCat !== "all") {
      list = list.filter((p) => p.categoryId === selectedCat);
    }

    if (selectedTag !== "all") {
      list = list.filter(
        (p) => Array.isArray(p.tags) && p.tags.indexOf(selectedTag) !== -1
      );
    }

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.ingredients.toLowerCase().includes(q) ||
          (p.promoBadge && p.promoBadge.toLowerCase().includes(q))
      );
    }

    if (onlyInStock) {
      list = list.filter((p) => p.inStock);
    }

    if (priceRange === "under150") {
      list = list.filter((p) => p.retailPrice < 150000);
    } else if (priceRange === "150to300") {
      list = list.filter((p) => p.retailPrice >= 150000 && p.retailPrice <= 300000);
    } else if (priceRange === "over300") {
      list = list.filter((p) => p.retailPrice > 300000);
    }

    switch (sortBy) {
      case "bestseller":
        list.sort(
          (a, b) =>
            Number(Boolean(b.isBestSeller)) - Number(Boolean(a.isBestSeller)) ||
            b.soldCount - a.soldCount
        );
        break;
      case "newest":
        list.sort((a, b) => Number(Boolean(b.isNew)) - Number(Boolean(a.isNew)));
        break;
      case "price-asc":
        list.sort((a, b) => a.retailPrice - b.retailPrice);
        break;
      case "price-desc":
        list.sort((a, b) => b.retailPrice - a.retailPrice);
        break;
      case "discount":
        list.sort(
          (a, b) =>
            calcDiscountPercent(b.retailPrice, b.originalPrice) -
            calcDiscountPercent(a.retailPrice, a.originalPrice)
        );
        break;
      default:
        list.sort((a, b) => b.soldCount - a.soldCount);
    }

    return list;
  }, [products, selectedCat, selectedTag, query, onlyInStock, priceRange, sortBy]);

  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, visibleLimit),
    [filteredProducts, visibleLimit]
  );

  const activeFilterCount =
    (onlyInStock ? 1 : 0) +
    (priceRange !== "all" ? 1 : 0) +
    (selectedTag !== "all" ? 1 : 0);

  const selectedCategoryObj = categories.find((c) => c.id === selectedCat);
  const selectedCategoryTitle =
    selectedCat === "all"
      ? "Tìm tên thuốc, hoạt chất, mã SKU..."
      : `Tìm trong ${selectedCategoryObj?.shortName || "danh mục"}...`;

  return (
    <div className="min-h-screen bg-[#F3F5FB] pb-24">
      {/* Top Royal Pharma Blue Search Header */}
      <header className="sticky top-0 z-30 bg-[#3E4095] zmp-safe-top">
        <div className="flex h-[52px] items-center gap-2 px-3">
          <button
            type="button"
            aria-label="Quay lại Trang chủ"
            onClick={() => navigate("/")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/15"
          >
            <ChevronLeft size={22} />
          </button>

          <div className="relative flex flex-1 items-center">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 text-[#5A658A]"
            />
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={selectedCategoryTitle}
              aria-label="Tìm kiếm dược phẩm, thiết bị y tế"
              className="h-9 w-full rounded-full bg-white pl-9 pr-8 text-[13px] text-[#121833] placeholder:text-[#5A658A] focus:outline-none"
            />
            {query && (
              <button
                type="button"
                aria-label="Xóa từ khóa"
                onClick={() => setQuery("")}
                className="absolute right-2.5 text-[#5A658A] hover:text-[#121833]"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <ZaloPreviewCapsule tone="on-dark" />
        </div>

        {/* Row 1: Horizontal 9 Partner Companies Strip */}
        <div className="no-scrollbar flex items-stretch gap-1 overflow-x-auto border-b border-[#EDF0F8] bg-white px-2.5 py-2">
          <button
            type="button"
            onClick={() => handleSelectCat("all")}
            className="flex w-[70px] shrink-0 flex-col items-center text-center"
          >
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                selectedCat === "all"
                  ? "bg-[#E6E9FC] ring-1 ring-[#3E4095]"
                  : "bg-[#F3F5FB]"
              }`}
            >
              <BrandLogo size={30} variant="light-box" className="border-0 bg-transparent" />
            </div>
            <span
              className={`mt-1 text-[11px] leading-tight ${
                selectedCat === "all"
                  ? "font-bold text-[#3E4095]"
                  : "font-medium text-[#3E486B]"
              }`}
            >
              Tất cả
            </span>
          </button>

          {categories.map((cat) => {
            const active = selectedCat === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleSelectCat(cat.id)}
                className="flex w-[76px] shrink-0 flex-col items-center text-center"
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                    active
                      ? "bg-[#E6E9FC] ring-1 ring-[#3E4095]"
                      : "bg-[#F3F5FB]"
                  }`}
                >
                  <CategoryIcon iconKey={cat.iconKey} active={active} size={21} />
                </div>
                <span
                  className={`mt-1 line-clamp-1 text-[11px] leading-tight ${
                    active
                      ? "font-bold text-[#3E4095]"
                      : "font-medium text-[#3E486B]"
                  }`}
                >
                  {cat.shortName}
                </span>
              </button>
            );
          })}
        </div>

        {/* Row 2: Cross-Category 5 Multi-Tag Filter Pills */}
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto border-b border-[#DCE1F0] bg-[#FAFBFF] px-3 py-2">
          <Tag size={13} className="shrink-0 text-[#3E4095]" />
          <button
            type="button"
            onClick={() => handleSelectTag("all")}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
              selectedTag === "all"
                ? "bg-[#3E4095] text-white"
                : "border border-[#DCE1F0] bg-white text-[#3E486B]"
            }`}
          >
            Mọi nhóm
          </button>
          {productTags.map((tg) => {
            const active = selectedTag === tg.id;
            const isRxTag = tg.id === "nhom-thuoc-ke-don";
            return (
              <button
                key={tg.id}
                type="button"
                onClick={() => handleSelectTag(active ? "all" : tg.id)}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
                  active
                    ? isRxTag
                      ? "bg-[#DC2626] text-white"
                      : "bg-[#3E4095] text-white"
                    : isRxTag
                    ? "border border-[#FCA5A5] bg-[#FFF5F5] text-[#991B1B]"
                    : "border border-[#DCE1F0] bg-white text-[#3E486B]"
                }`}
              >
                {tg.shortName}
              </button>
            );
          })}
        </div>

        {/* Sort & Filter Bar */}
        <div className="relative flex h-9 items-center justify-between border-b border-[#DCE1F0] bg-white px-3.5 text-[12.5px]">
          <button
            type="button"
            onClick={() => setSortMenuOpen((o) => !o)}
            className="flex items-center gap-1.5 font-medium text-[#121833]"
          >
            <span>{SORT_LABELS[sortBy]}</span>
            <ChevronDown size={14} className="text-[#3E486B]" />
          </button>

          <div className="flex items-center gap-3">
            <span className="tabular-nums text-[12px] font-semibold text-[#3E4095]">
              {filteredProducts.length} SP
            </span>
            <span className="h-4 w-px bg-[#DCE1F0]" />
            <button
              type="button"
              onClick={() => {
                setSortMenuOpen(false);
                setFilterDrawerOpen(true);
              }}
              className={`flex items-center gap-1.5 font-medium ${
                activeFilterCount > 0 ? "text-[#3E4095]" : "text-[#3E486B]"
              }`}
            >
              <Filter size={14} />
              <span>
                Lọc{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              </span>
            </button>
          </div>

          {sortMenuOpen && (
            <>
              <div
                aria-hidden="true"
                onClick={() => setSortMenuOpen(false)}
                className="fixed inset-0 z-30"
              />
              <div className="absolute left-3 top-10 z-40 w-48 rounded-xl border border-[#DCE1F0] bg-white py-1.5 shadow-md">
                {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setSortBy(key);
                      setSortMenuOpen(false);
                      const next = new URLSearchParams(searchParams);
                      if (key === "popular") next.delete("sort");
                      else next.set("sort", key);
                      setSearchParams(next, { replace: true });
                    }}
                    className={`flex w-full items-center justify-between px-3.5 py-2 text-left text-[13px] ${
                      sortBy === key
                        ? "bg-[#EEF0FD] font-semibold text-[#3E4095]"
                        : "text-[#121833] hover:bg-[#F3F5FB]"
                    }`}
                  >
                    <span>{SORT_LABELS[key]}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </header>

      {/* Product Grid */}
      <main className="p-3">
        {filteredProducts.length === 0 ? (
          <div className="mt-6 flex flex-col items-center rounded-2xl border border-[#DCE1F0] bg-white px-5 py-9 text-center">
            <Search size={34} className="text-[#5A658A]" />
            <h2 className="mt-3 text-[15px] font-bold text-[#121833]">
              {selectedCat !== "all" && !query && selectedTag === "all"
                ? `Danh mục ${selectedCategoryObj?.name || ""} đang cập nhật bảng giá`
                : "Chưa tìm thấy sản phẩm phù hợp"}
            </h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[#3E486B]">
              {selectedCat !== "all" && !query && selectedTag === "all"
                ? "Bảng sản phẩm của hãng này có thể tải lên trực tiếp bằng file Excel mẫu từ trang Quản trị NESPHAR hoặc nhắn Dược sĩ để nhận báo giá sỉ ngay."
                : "Thử đổi từ khóa, chọn Công ty khác hoặc bỏ bớt bộ lọc thẻ nhóm."}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  handleSelectCat("all");
                  handleSelectTag("all");
                  setOnlyInStock(false);
                  setPriceRange("all");
                }}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#3E4095] px-4 py-2 text-[12.5px] font-semibold text-white"
              >
                <RotateCcw size={13} />
                <span>Xem toàn bộ {products.length} SP</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  chatZaloOA(
                    `Xin báo giá danh mục ${selectedCategoryObj?.name || "sản phẩm"} tại NESPHAR`
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-full border border-[#3E4095] bg-white px-4 py-2 text-[12.5px] font-semibold text-[#3E4095]"
              >
                <MessageCircle size={13} />
                <span>Nhận báo giá qua Zalo</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              {visibleProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>

            {visibleLimit < filteredProducts.length && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleLimit((prev) => prev + PAGE_CHUNK)}
                  className="w-full rounded-xl border border-[#C5CAFA] bg-white py-2.5 text-[13px] font-semibold text-[#3E4095] transition-colors hover:bg-[#EEF0FD]"
                >
                  Xem thêm sản phẩm (còn {filteredProducts.length - visibleLimit} SP)
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Filter Bottom Sheet */}
      {filterDrawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Bộ lọc sản phẩm"
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#121536]/50"
          onClick={() => setFilterDrawerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[440px] rounded-t-2xl bg-white p-4 zmp-safe-bottom"
          >
            <div className="flex items-center justify-between border-b border-[#DCE1F0] pb-3">
              <h2 className="text-[16px] font-bold text-[#121833]">
                Bộ lọc dược phẩm & Thẻ nhóm
              </h2>
              <button
                type="button"
                aria-label="Đóng bộ lọc"
                onClick={() => setFilterDrawerOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F3F5FB] text-[#3E486B]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <p className="text-[13px] font-semibold text-[#121833]">
                  Nhóm phân loại sản phẩm (Multi-Tag)
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectTag("all")}
                    className={`rounded-xl border px-3 py-1.5 text-[12px] font-medium ${
                      selectedTag === "all"
                        ? "border-[#3E4095] bg-[#E6E9FC] text-[#282A6E]"
                        : "border-[#DCE1F0] bg-[#FAFBFF] text-[#3E486B]"
                    }`}
                  >
                    Tất cả nhóm
                  </button>
                  {productTags.map((tg) => (
                    <button
                      key={tg.id}
                      type="button"
                      onClick={() => handleSelectTag(tg.id)}
                      className={`rounded-xl border px-3 py-1.5 text-[12px] font-medium ${
                        selectedTag === tg.id
                          ? "border-[#3E4095] bg-[#E6E9FC] text-[#282A6E]"
                          : "border-[#DCE1F0] bg-[#FAFBFF] text-[#3E486B]"
                      }`}
                    >
                      {tg.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[13px] font-semibold text-[#121833]">
                  Khoảng giá niêm yết
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {[
                    { id: "all", label: "Tất cả mức giá" },
                    { id: "under150", label: "Dưới 150.000đ" },
                    { id: "150to300", label: "150.000đ – 300.000đ" },
                    { id: "over300", label: "Trên 300.000đ" },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPriceRange(opt.id as typeof priceRange)}
                      className={`rounded-xl border px-3 py-2 text-[12.5px] font-medium ${
                        priceRange === opt.id
                          ? "border-[#3E4095] bg-[#E6E9FC] text-[#282A6E]"
                          : "border-[#DCE1F0] bg-[#FAFBFF] text-[#3E486B]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-[#DCE1F0] bg-[#FAFBFF] px-3.5 py-3">
                <span className="text-[13px] font-medium text-[#121833]">
                  Chỉ hiển thị sản phẩm đang còn hàng
                </span>
                <input
                  type="checkbox"
                  checked={onlyInStock}
                  onChange={(e) => setOnlyInStock(e.target.checked)}
                  className="h-4 w-4 accent-[#3E4095]"
                />
              </label>

              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setOnlyInStock(false);
                    setPriceRange("all");
                    handleSelectTag("all");
                  }}
                  className="rounded-xl border border-[#DCE1F0] py-2.5 text-[13.5px] font-semibold text-[#3E486B]"
                >
                  Thiết lập lại
                </button>
                <button
                  type="button"
                  onClick={() => setFilterDrawerOpen(false)}
                  className="rounded-xl bg-[#3E4095] py-2.5 text-[13.5px] font-semibold text-white"
                >
                  Áp dụng ({filteredProducts.length})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoriesPage;
