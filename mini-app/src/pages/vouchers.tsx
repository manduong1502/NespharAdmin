import React from "react";
import { useNavigate } from "react-router-dom";
import { useAtom, useAtomValue } from "jotai";
import { ChevronLeft, TicketPercent } from "lucide-react";
import { selectedVoucherCodeAtom, vouchersAtom } from "@/state/store";
import { formatVnd } from "@/utils/format";
import { useAppActions } from "@/hooks/useAppActions";
import { ZaloPreviewCapsule } from "@/components/ZaloPreviewCapsule";

const VouchersPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedCode, setSelectedCode] = useAtom(selectedVoucherCodeAtom);
  const vouchers = useAtomValue(vouchersAtom);
  const { showToast } = useAppActions();

  return (
    <div className="min-h-screen bg-[#F3F5FB] pb-20">
      <header className="sticky top-0 z-30 bg-[#3E4095] text-white zmp-safe-top">
        <div className="flex h-[52px] items-center justify-between px-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Quay lại"
              onClick={() => navigate(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/15"
            >
              <ChevronLeft size={22} />
            </button>
            <h1 className="text-[17px] font-bold">Kho ưu đãi NESPHAR</h1>
          </div>
          <ZaloPreviewCapsule tone="on-dark" />
        </div>
      </header>

      <main className="space-y-3 p-3.5">
        {vouchers.length === 0 && (
          <div className="rounded-xl border border-[#DCE1F0] bg-white p-6 text-center text-[13px] text-[#5A658A]">
            Hiện chưa có mã giảm giá nào đang mở. Vui lòng quay lại sau nhé!
          </div>
        )}
        {vouchers.map((voucher) => {
          const isSelected = selectedCode === voucher.code;
          return (
            <article
              key={voucher.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-[#DCE1F0] bg-white p-3.5"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#E6E9FC] text-[#3E4095]">
                  <TicketPercent size={24} />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-[#3E4095] px-2 py-0.5 text-[11px] font-bold text-white">
                      {voucher.code}
                    </span>
                    <h2 className="text-[14px] font-bold text-[#121833]">
                      {voucher.title}
                    </h2>
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-[#3E486B]">
                    {voucher.description}
                  </p>
                  <p className="mt-1 text-[11px] text-[#5A658A]">
                    Đơn tối thiểu {formatVnd(voucher.minOrderValue)} • HSD:{" "}
                    {voucher.expiryDate}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedCode(voucher.code);
                  showToast(`Đã lưu mã ${voucher.code} cho giỏ hàng`);
                  navigate("/cart");
                }}
                className={`shrink-0 rounded-lg px-3 py-2 text-[12px] font-semibold ${
                  isSelected
                    ? "border border-[#3E4095] bg-[#EEF0FD] text-[#3E4095]"
                    : "bg-[#3E4095] text-white hover:bg-[#31337A]"
                }`}
              >
                {isSelected ? "Đang chọn" : "Dùng ngay"}
              </button>
            </article>
          );
        })}
      </main>
    </div>
  );
};

export default VouchersPage;
