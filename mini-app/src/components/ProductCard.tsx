import React from "react";
import { useNavigate } from "react-router-dom";
import { useAtomValue } from "jotai";
import { MessageCircle, ShoppingCart } from "lucide-react";
import { Product } from "@/types";
import {
  effectiveDiscountPercentAtom,
  userProfileAtom,
} from "@/state/store";
import {
  calcDiscountPercent,
  formatVnd,
  getUnitPriceForTier,
  isPrescriptionProduct,
} from "@/utils/format";
import { useAppActions } from "@/hooks/useAppActions";

interface ProductCardProps {
  product: Product;
  compactWidth?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  compactWidth = false,
}) => {
  const navigate = useNavigate();
  const user = useAtomValue(userProfileAtom);
  const effectivePct = useAtomValue(effectiveDiscountPercentAtom);
  const { addToCart } = useAppActions();

  const defaultUnit = product.unitOptions[0] || {
    id: "u-default",
    unitName: product.baseUnit || "Hộp",
    specificationLabel: product.specification || "Tiêu chuẩn",
    multiplier: 1,
  };
  const { price, originalPrice } = getUnitPriceForTier(
    product,
    user.customerTier,
    defaultUnit,
    effectivePct,
    1
  );
  const discountPercent = calcDiscountPercent(price, originalPrice);
  const isRx = isPrescriptionProduct(product);
  const rxConsultOnly = isRx && user.customerTier === "retail";

  return (
    <article
      onClick={() => navigate(`/product/${product.id}`)}
      className={`group flex flex-col overflow-hidden rounded-xl border border-[#DCE1F0] bg-white transition-colors duration-150 hover:border-[#9AA0E6] cursor-pointer ${
        compactWidth ? "w-[168px] shrink-0" : "w-full"
      }`}
    >
      {/* Square Studio Product Image Area */}
      <div className="relative aspect-square w-full overflow-hidden border-b border-[#F1F3FA] bg-white">
        <img
          src={product.images[0]}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-contain p-1.5 transition-transform duration-200 group-hover:scale-[1.03]"
        />

        {/* Top-Left Rx Prescription Pill */}
        {isRx && (
          <span className="absolute left-2 top-2 rounded-md bg-[#DC2626] px-1.5 py-0.5 text-[10px] font-bold tracking-tight text-white">
            Rx · Kê đơn
          </span>
        )}

        {/* Top-Right Discount Ribbon */}
        {discountPercent > 0 && (
          <span className="tabular-nums absolute right-0 top-2 rounded-l-md bg-[#D92D20] px-2 py-0.5 text-[11.5px] font-bold text-white">
            -{discountPercent}%
          </span>
        )}

        {/* Out-of-stock overlay */}
        {!product.inStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#121833]/55">
            <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-[#121833]">
              Tạm hết hàng
            </span>
          </div>
        )}
      </div>

      {/* Product Info */}
      <div className="flex flex-1 flex-col justify-between p-2.5">
        <div>
          <h3 className="line-clamp-2 text-[13px] font-semibold leading-[1.35] text-[#121833]">
            {product.name}
          </h3>
          <p className="mt-1 truncate text-[11px] text-[#5A658A]">
            {product.sku} · {defaultUnit.specificationLabel}
          </p>
          {product.promoBadge ? (
            <div className="mt-1 truncate rounded bg-[#FFFBEB] px-1.5 py-0.5 text-[10.5px] font-medium text-[#92400E]">
              {product.promoBadge}
            </div>
          ) : (
            <div className="mt-1 h-[19px]" />
          )}
        </div>

        <div className="mt-1.5">
          {originalPrice > price ? (
            <div className="tabular-nums text-[11px] text-[#5A658A] line-through">
              {formatVnd(originalPrice)}
            </div>
          ) : (
            <div className="h-[16px]" />
          )}

          <div className="mt-0.5 flex items-center justify-between gap-1">
            <div className="min-w-0 truncate">
              <span className="tabular-nums text-[14.5px] font-bold text-[#3E4095]">
                {formatVnd(price)}
              </span>
              <span className="text-[11px] text-[#3E486B]">
                /{defaultUnit.unitName || product.baseUnit}
              </span>
            </div>

            <button
              type="button"
              aria-label={
                rxConsultOnly
                  ? `Tư vấn đơn thuốc ${product.name}`
                  : `Thêm ${product.name} vào giỏ`
              }
              disabled={!product.inStock}
              onClick={(e) => {
                e.stopPropagation();
                addToCart(product, defaultUnit.id, 1);
              }}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 active:scale-95 disabled:opacity-40 ${
                rxConsultOnly
                  ? "bg-[#FFEDEA] text-[#991B1B] hover:bg-[#DC2626] hover:text-white"
                  : "bg-[#E6E9FC] text-[#3E4095] hover:bg-[#3E4095] hover:text-white"
              }`}
            >
              {rxConsultOnly ? (
                <MessageCircle size={15} strokeWidth={2} />
              ) : (
                <ShoppingCart size={15} strokeWidth={2} />
              )}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
};
