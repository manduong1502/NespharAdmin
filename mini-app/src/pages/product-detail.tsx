import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAtomValue } from "jotai";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  FileText,
  Gift,
  Home,
  MessageCircle,
  Minus,
  Plus,
  Share2,
  ShieldCheck,
  ShoppingCart,
} from "lucide-react";
import {
  cartTotalCountAtom,
  categoriesAtom,
  effectiveDiscountPercentAtom,
  productsAtom,
  userProfileAtom,
} from "@/state/store";
import {
  CUSTOMER_TIERS,
  OFFICIAL_TAG_META,
  calcDiscountPercent,
  formatVnd,
  getUnitPriceForTier,
  isPrescriptionProduct,
} from "@/utils/format";
import { useAppActions } from "@/hooks/useAppActions";
import { ProductCard } from "@/components/ProductCard";
import { ZaloPreviewCapsule } from "@/components/ZaloPreviewCapsule";

const ProductDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAtomValue(userProfileAtom);
  const effectivePct = useAtomValue(effectiveDiscountPercentAtom);
  const products = useAtomValue(productsAtom);
  const categories = useAtomValue(categoriesAtom);
  const cartCount = useAtomValue(cartTotalCountAtom);
  const { addToCart, chatZaloOA, shareContent } = useAppActions();

  const product = products.find((p) => p.id === id) || products[0];
  const [selectedUnitId, setSelectedUnitId] = useState(
    product.unitOptions[0]?.id || "u-default"
  );
  const [orderQty, setOrderQty] = useState(1);
  const [imgIndex, setImgIndex] = useState(0);
  const [expandedDesc, setExpandedDesc] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    document
      .querySelectorAll(".zaui-routes-item")
      .forEach((el) => ((el as HTMLElement).scrollTop = 0));
    setSelectedUnitId(product.unitOptions[0]?.id || "u-default");
    setOrderQty(1);
    setImgIndex(0);
    setExpandedDesc(false);
    setScrolled(false);
  }, [product.id]);

  useEffect(() => {
    const onScroll = (e: Event) => {
      const target = e.target as HTMLElement | Document;
      const top =
        target instanceof HTMLElement ? target.scrollTop : window.scrollY;
      setScrolled(top > 180);
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, []);

  const currentUnit =
    product.unitOptions.find((u) => u.id === selectedUnitId) ||
    product.unitOptions[0] || {
      id: "u-default",
      unitName: product.baseUnit || "Hộp",
      specificationLabel: product.specification || "Tiêu chuẩn",
      multiplier: 1,
    };

  const { price, originalPrice } = getUnitPriceForTier(
    product,
    user.customerTier,
    currentUnit,
    effectivePct,
    orderQty
  );
  const discountPercent = calcDiscountPercent(price, originalPrice);
  const tierInfo = CUSTOMER_TIERS[user.customerTier];
  const isRx = isPrescriptionProduct(product);
  const rxConsultOnly = isRx && user.customerTier === "retail";
  const categoryObj = categories.find((c) => c.id === product.categoryId);

  const relatedProducts = products
    .filter((p) => p.categoryId === product.categoryId && p.id !== product.id)
    .slice(0, 4);

  const handleBuyNow = () => {
    if (rxConsultOnly) {
      void chatZaloOA(
        `Chào Dược sĩ NESPHAR, tôi cần tư vấn đơn thuốc sản phẩm ${product.sku} - ${product.name}`
      );
      return;
    }
    const added = addToCart(product, currentUnit.id, orderQty, true);
    if (added) {
      navigate("/cart");
    }
  };

  const totalBaseUnitsSelected = Math.max(
    1,
    Math.round(orderQty * (currentUnit.multiplier || 1))
  );

  return (
    <div className="min-h-screen bg-[#F3F5FB] pb-12">
      {/* Adaptive Header */}
      <header
        className={`fixed left-1/2 top-0 z-30 w-full max-w-[440px] -translate-x-1/2 transition-colors duration-200 zmp-safe-top ${scrolled
          ? "border-b border-[#DCE1F0] bg-white text-[#121833]"
          : "bg-[#121536]/85 text-white"
          }`}
      >
        <div className="flex h-[50px] items-center justify-between gap-2 px-3">
          <div
            className={`inline-flex h-8 shrink-0 items-center rounded-full border px-2 ${scrolled
              ? "border-[#DCE1F0] bg-[#FAFBFF] text-[#3E4095]"
              : "border-white/35 bg-white/10 text-white"
              }`}
          >
            <button
              type="button"
              aria-label="Quay lại"
              onClick={() => navigate(-1)}
              className="flex h-7 w-7 items-center justify-center"
            >
              <ChevronLeft size={18} />
            </button>
            <span
              className={`mx-1 h-3.5 w-px ${scrolled ? "bg-[#DCE1F0]" : "bg-white/30"
                }`}
            />
            <button
              type="button"
              aria-label="Về Trang chủ"
              onClick={() => navigate("/")}
              className="flex h-7 w-7 items-center justify-center"
            >
              <Home size={16} />
            </button>
          </div>

          <div className="min-w-0 flex-1">
            {scrolled && (
              <p className="truncate text-[13px] font-semibold text-[#121833]">
                {product.sku} - {product.name}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              aria-label="Giỏ hàng"
              onClick={() => navigate("/cart")}
              className={`relative flex h-8 w-8 items-center justify-center rounded-full ${scrolled ? "text-[#3E4095] hover:bg-[#EEF0FD]" : "text-white hover:bg-white/15"
                }`}
            >
              <ShoppingCart size={18} />
              {cartCount > 0 && (
                <span className="tabular-nums absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#D92D20] px-1 text-[10px] font-bold text-white">
                  {cartCount}
                </span>
              )}
            </button>

            <button
              type="button"
              aria-label="Chat tư vấn Dược sĩ"
              onClick={() =>
                chatZaloOA(`Tôi cần tư vấn sản phẩm ${product.sku} - ${product.name}`)
              }
              className={`flex h-8 w-8 items-center justify-center rounded-full ${scrolled ? "text-[#3E4095] hover:bg-[#EEF0FD]" : "text-white hover:bg-white/15"
                }`}
            >
              <MessageCircle size={18} />
            </button>

            <button
              type="button"
              aria-label="Chia sẻ sản phẩm"
              onClick={() => shareContent(product.name)}
              className={`flex h-8 w-8 items-center justify-center rounded-full ${scrolled ? "text-[#3E4095] hover:bg-[#EEF0FD]" : "text-white hover:bg-white/15"
                }`}
            >
              <Share2 size={18} />
            </button>

            <ZaloPreviewCapsule tone={scrolled ? "on-light" : "on-dark"} />
          </div>
        </div>
      </header>

      {/* Product Studio Image Gallery */}
      <div className="bg-[#161942] pt-[82px]">
        <div className="relative aspect-square w-full overflow-hidden border-b border-[#EDF0F8] bg-white">
          <img
            src={product.images[imgIndex]}
            alt={product.name}
            className="h-full w-full object-contain p-4"
          />

          {isRx && (
            <span className="absolute left-3 top-3 rounded-lg bg-[#DC2626] px-2.5 py-1 text-[11.5px] font-bold text-white">
              Rx · Thuốc kê đơn
            </span>
          )}

          {discountPercent > 0 && (
            <span className="tabular-nums absolute bottom-3 left-3 rounded-full bg-[#D92D20] px-3 py-1 text-[13px] font-bold text-white">
              -{discountPercent}%
            </span>
          )}

          <button
            type="button"
            onClick={() =>
              setImgIndex((prev) => (prev + 1) % product.images.length)
            }
            className="tabular-nums absolute bottom-3 right-3 rounded-full bg-[#121833]/70 px-2.5 py-0.5 text-[12px] font-medium text-white"
          >
            {imgIndex + 1}/{product.images.length}
          </button>
        </div>
      </div>

      {/* Primary Product Info & CTA Block */}
      <section className="border-b border-[#DCE1F0] bg-white px-3.5 pb-4 pt-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => navigate(`/categories?cat=${product.categoryId}`)}
            className="inline-flex items-center gap-1 rounded-full bg-[#EEF0FD] px-2.5 py-0.5 text-[11.5px] font-semibold text-[#3E4095]"
          >
            <ShieldCheck size={13} />
            <span>{categoryObj?.name || product.brand}</span>
          </button>

          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${product.inStock
              ? "bg-[#E6E9FC] text-[#282A6E]"
              : "bg-[#FEE2E2] text-[#991B1B]"
              }`}
          >
            <CheckCircle2 size={12} />
            <span>
              {product.inStock
                ? `Còn hàng (${product.stockCount})`
                : "Tạm hết hàng"}
            </span>
          </span>
        </div>

        {/* Clickable Multi-Tag Chips */}
        {Array.isArray(product.tags) && product.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {product.tags.map((tg) => {
              const meta = OFFICIAL_TAG_META[tg];
              const rxChip = meta?.isRx || tg === "nhom-thuoc-ke-don";
              return (
                <button
                  key={tg}
                  type="button"
                  onClick={() => navigate(`/categories?tag=${tg}`)}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${rxChip
                    ? "bg-[#FFEDEA] text-[#991B1B]"
                    : "bg-[#F3F5FB] text-[#3E486B]"
                    }`}
                >
                  #{meta?.shortLabel || tg}
                </button>
              );
            })}
          </div>
        )}

        <h1 className="mt-2 text-[17.5px] font-bold leading-snug text-[#121833]">
          {product.sku} - {product.name}
        </h1>

        {/* Pricing + Share Button Row */}
        <div className="mt-3 flex items-end justify-between gap-2">
          <div>
            {originalPrice > price && (
              <div className="tabular-nums text-[13.5px] text-[#5A658A] line-through">
                {formatVnd(originalPrice)}
              </div>
            )}
            <div className="flex flex-wrap items-baseline gap-1.5">
              <span className="tabular-nums text-[21px] font-extrabold text-[#3E4095]">
                {formatVnd(price)}
              </span>
              <span className="text-[13.5px] text-[#3E486B]">
                /1 {currentUnit.unitName}
              </span>
              {(user.customerTier !== "retail" || effectivePct > 0) && (
                <span className="tabular-nums rounded-md bg-[#FEF3C7] px-2 py-0.5 text-[11px] font-semibold text-[#92400E]">
                  {typeof user.customDiscountPercent === "number"
                    ? `Giá HĐ (-${effectivePct}%)`
                    : `Giá ${tierInfo.label} (-${effectivePct}%)`}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => shareContent(product.name)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#9AA0E6] bg-[#FAFBFF] px-3 py-1.5 text-[12.5px] font-medium text-[#3E4095] hover:bg-[#EEF0FD]"
          >
            <Share2 size={14} />
            <span>Chia sẻ</span>
          </button>
        </div>

        {/* Promo Callout Banner (Mua X tặng Y / CTKM Dapharco) */}
        {product.promoBadge && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-2.5 text-[12.5px] text-[#92400E]">
            <Gift size={15} className="mt-0.5 shrink-0 text-[#D97706]" />
            <div>
              <span className="font-bold">Ưu đãi CTKM: </span>
              <span>{product.promoBadge}</span>
            </div>
          </div>
        )}

        {/* Interactive Volume Wholesale Price Table (BioCare / Dapharco) */}
        {Array.isArray(product.volumeTiers) && product.volumeTiers.length > 1 && (
          <div className="mt-3 rounded-xl border border-[#C5CAFA] bg-[#FAFBFF] p-3">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-bold text-[#1E2059]">
                Bảng giá sỉ theo số lượng
              </span>
              <span className="text-[11px] text-[#5A658A]">Chạm chọn mốc</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {product.volumeTiers.map((vt, idx) => {
                const isActiveBracket =
                  totalBaseUnitsSelected >= vt.minQty &&
                  (vt.maxQty === null ||
                    vt.maxQty === undefined ||
                    totalBaseUnitsSelected <= vt.maxQty);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setSelectedUnitId(product.unitOptions[0]?.id || currentUnit.id);
                      setOrderQty(vt.minQty);
                    }}
                    className={`rounded-lg border p-2 text-center transition-colors ${isActiveBracket
                      ? "border-[#3E4095] bg-[#E6E9FC]"
                      : "border-[#DCE1F0] bg-white"
                      }`}
                  >
                    <div className="text-[11px] font-medium text-[#3E486B]">
                      {vt.label}
                    </div>
                    <div className="tabular-nums mt-0.5 text-[13.5px] font-extrabold text-[#3E4095]">
                      {formatVnd(vt.unitPrice)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Unit / Specification Selector */}
        <div className="mt-3.5 flex flex-wrap items-end justify-between gap-3">
          <div className="flex-1">
            <p className="text-[12.5px] font-semibold text-[#3E486B]">
              Chọn quy cách đóng gói:
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {product.unitOptions.map((opt) => {
                const active = opt.id === currentUnit.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedUnitId(opt.id)}
                    className={`rounded-xl border px-3 py-1.5 text-left text-[12.5px] transition-colors ${active
                      ? "border-[#3E4095] bg-[#E6E9FC] font-semibold text-[#282A6E]"
                      : "border-[#DCE1F0] bg-[#FAFBFF] font-medium text-[#3E486B]"
                      }`}
                  >
                    <span>{opt.specificationLabel}</span>
                    {opt.extraSavePercent && (
                      <span className="ml-1.5 rounded bg-[#3E4095] px-1.5 py-0.5 text-[10px] font-bold text-white">
                        -{opt.extraSavePercent}%
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {!rxConsultOnly && (
            <div>
              <p className="text-[12px] font-semibold text-[#3E486B]">Số lượng:</p>
              <div className="mt-1.5 inline-flex items-center rounded-xl border border-[#DCE1F0] bg-[#FAFBFF]">
                <button
                  type="button"
                  aria-label="Giảm số lượng"
                  onClick={() => setOrderQty((q) => Math.max(1, q - 1))}
                  className="flex h-8 w-8 items-center justify-center text-[#3E486B]"
                >
                  <Minus size={14} />
                </button>
                <span className="tabular-nums min-w-[34px] text-center text-[13.5px] font-bold text-[#121833]">
                  {orderQty}
                </span>
                <button
                  type="button"
                  aria-label="Tăng số lượng"
                  onClick={() => setOrderQty((q) => Math.min(200, q + 1))}
                  className="flex h-8 w-8 items-center justify-center text-[#3E4095]"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Rx Legal Guard Notice for Retail Viewers */}
        {rxConsultOnly && (
          <div className="mt-3.5 flex items-start gap-2 rounded-xl border border-[#FCA5A5] bg-[#FFF5F5] p-3 text-[12px] leading-relaxed text-[#991B1B]">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-[#DC2626]" />
            <div>
              <strong>Thuốc kê đơn (Rx):</strong> Theo quy định Bộ Y Tế, khách hàng cá nhân vui lòng bấm <strong>Tư vấn Dược sĩ</strong> để gửi toa thuốc. Nếu bạn là <strong>Nhà thuốc / Phòng khám GPP</strong>, chuyển sang tài khoản Đối tác ở mục Cá nhân để đặt sỉ trực tiếp.
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {rxConsultOnly ? (
          <div className="mt-4 grid grid-cols-12 gap-2.5">
            <button
              type="button"
              onClick={() => navigate("/profile")}
              className="col-span-5 flex flex-col items-center justify-center rounded-xl border border-[#9AA0E6] bg-[#EEF0FD] py-2.5 text-[12px] font-semibold text-[#3E4095]"
            >
              Tài khoản Sỉ GPP
            </button>
            <button
              type="button"
              onClick={handleBuyNow}
              className="col-span-7 flex items-center justify-center gap-1.5 rounded-xl bg-[#3E4095] py-3 text-[14.5px] font-bold text-white hover:bg-[#31337A]"
            >
              <MessageCircle size={17} />
              <span>Tư vấn Dược sĩ / Gửi đơn</span>
            </button>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-12 gap-2.5">
            <button
              type="button"
              disabled={!product.inStock}
              onClick={() => addToCart(product, currentUnit.id, orderQty)}
              className="col-span-5 flex flex-col items-center justify-center rounded-xl border border-[#9AA0E6] bg-[#E6E9FC] py-2 text-[#3E4095] transition-colors hover:bg-[#DDE1FA] active:scale-[0.99] disabled:opacity-45"
            >
              <ShoppingCart size={18} strokeWidth={2} />
              <span className="mt-0.5 text-[12px] font-semibold">
                Thêm vào giỏ
              </span>
            </button>

            <button
              type="button"
              disabled={!product.inStock}
              onClick={handleBuyNow}
              className="col-span-7 flex items-center justify-center rounded-xl bg-[#3E4095] py-3 text-[15px] font-bold text-white transition-colors hover:bg-[#31337A] active:scale-[0.99] disabled:opacity-45"
            >
              {product.inStock
                ? `Mua ngay (${formatVnd(price * orderQty)})`
                : "Tạm hết hàng"}
            </button>
          </div>
        )}
      </section>

      {/* SKU & Pharmaceutical Legal Specs Row */}
      <section className="border-b border-[#DCE1F0] bg-white">
        <div className="divide-y divide-[#EDF0F8] px-3.5 text-[13.5px]">
          <div className="flex items-center py-2.5">
            <span className="w-28 shrink-0 text-[#5A658A]">Mã sản phẩm</span>
            <span className="tabular-nums font-semibold text-[#121833]">
              {product.sku}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 py-2.5">
            <div className="flex items-center">
              <span className="w-28 shrink-0 text-[#5A658A]">Số ĐK công bố</span>
              <span className="tabular-nums font-medium text-[#121833]">
                {product.registrationNo}
              </span>
            </div>
            {product.declarationDocUrl && (
              <a
                href={product.declarationDocUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#EEF0FD] px-2.5 py-1 text-[11.5px] font-semibold text-[#3E4095]"
              >
                <FileText size={13} />
                <span>Hồ sơ BYT</span>
              </a>
            )}
          </div>
          {product.nearestExpDate && (
            <div className="flex items-center py-2.5">
              <span className="w-28 shrink-0 text-[#5A658A]">HSD lô xuất</span>
              <span className="tabular-nums font-medium text-[#282A6E]">
                {product.nearestExpDate} (Chuẩn GSP/FEFO)
              </span>
            </div>
          )}
          <div className="flex items-center py-2.5">
            <span className="w-28 shrink-0 text-[#5A658A]">Quy cách</span>
            <span className="text-[#121833]">{product.specification}</span>
          </div>
          <div className="flex items-center py-2.5">
            <span className="w-28 shrink-0 text-[#5A658A]">Xuất xứ</span>
            <span className="text-[#121833]">{product.origin}</span>
          </div>
        </div>

        <div className="bg-[#EDF0F8] px-3.5 py-3 text-[13.5px] leading-relaxed text-[#121833]">
          {product.shortSummary}
        </div>
      </section>

      {/* Expandable Detailed Pharmaceutical Description */}
      <section className="mt-2.5 border-y border-[#DCE1F0] bg-white">
        <div className="relative px-3.5 pb-2 pt-4">
          <h2 className="text-[15.5px] font-bold text-[#121833]">
            Thành phần & Hướng dẫn sử dụng
          </h2>

          <div
            className={`mt-3 space-y-3 text-[13.5px] leading-relaxed text-[#121833] ${expandedDesc ? "" : "max-h-[210px] overflow-hidden"
              }`}
          >
            <div>
              <p className="font-semibold text-[#282A6E]">Thành phần / Hoạt chất:</p>
              <p className="mt-0.5 text-[#3E486B]">{product.ingredients}</p>
            </div>

            <div>
              <p className="font-semibold text-[#282A6E]">Công dụng / Chỉ định:</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-[#3E486B]">
                {product.benefits.map((b, idx) => (
                  <li key={idx}>{b}</li>
                ))}
              </ul>
            </div>

            <div>
              <p className="font-semibold text-[#282A6E]">Đối tượng sử dụng:</p>
              <p className="mt-0.5 text-[#3E486B]">{product.targetUsers}</p>
            </div>

            <div>
              <p className="font-semibold text-[#282A6E]">Liều dùng & Cách dùng:</p>
              <p className="mt-0.5 text-[#3E486B]">{product.dosage}</p>
            </div>

            <div>
              <p className="font-semibold text-[#282A6E]">Bảo quản & Khuyến cáo pháp lý:</p>
              <p className="mt-0.5 text-[#3E486B]">{product.storageNote}</p>
              <p className="mt-1.5 rounded-xl bg-[#EEF0FD] p-2.5 text-[12.5px] italic text-[#282A6E]">
                Lưu ý: {product.disclaimer}
              </p>
            </div>
          </div>

          {!expandedDesc && (
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-white to-transparent" />
          )}
        </div>

        <button
          type="button"
          onClick={() => setExpandedDesc((prev) => !prev)}
          className="w-full border-t border-[#EDF0F8] py-3 text-center text-[14px] font-semibold text-[#3E4095] hover:bg-[#F3F5FB]"
        >
          {expandedDesc ? "Thu gọn" : "Xem thêm"}
        </button>
      </section>

      {/* Related Products in Same Company Category */}
      {relatedProducts.length > 0 && (
        <section className="mt-5 px-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-[16.5px] font-bold text-[#121833]">
              Cùng hãng {categoryObj?.shortName || product.brand}
            </h2>
            <button
              type="button"
              onClick={() => navigate(`/categories?cat=${product.categoryId}`)}
              className="text-[13px] font-medium text-[#3E4095] hover:underline"
            >
              Xem tất cả
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {relatedProducts.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default ProductDetailPage;
