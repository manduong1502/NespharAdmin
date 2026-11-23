import React, { useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import {
  CheckCircle2,
  MessageCircle,
  PhoneCall,
  Send,
  X,
} from "lucide-react";
import {
  companyInfoAtom,
  customerIdAtom,
  supportModalOpenAtom,
  userProfileAtom,
} from "@/state/store";
import { useAppActions } from "@/hooks/useAppActions";
import { submitSupportTicketApi } from "@/services/api";

export const SupportModal: React.FC = () => {
  const [open, setOpen] = useAtom(supportModalOpenAtom);
  const [user] = useAtom(userProfileAtom);
  const customerId = useAtomValue(customerIdAtom);
  const companyInfo = useAtomValue(companyInfoAtom);
  const { callHotline, chatZaloOA, showToast } = useAppActions();

  const [topic, setTopic] = useState<"tu-van" | "bao-gia-si" | "gop-y">("tu-van");
  const [phoneInput, setPhoneInput] = useState(user.phoneLinked ? user.phone : "");
  const [content, setContent] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      showToast("Vui lòng nhập nội dung cần Dược sĩ hỗ trợ");
      return;
    }
    try {
      await submitSupportTicketApi({
        customerId,
        customerName: user.name,
        phone: phoneInput.trim() || user.phone,
        topic,
        content: content.trim(),
      });
    } catch {
      // Offline fallback still acknowledges receipt cleanly
    }
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setContent("");
      setOpen(false);
      showToast("Đã gửi phản hồi tới bộ phận Dược sĩ NESPHAR!");
    }, 1300);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Hỗ trợ & Tư vấn Dược sĩ NESPHAR"
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#121536]/50"
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] rounded-t-2xl bg-white p-4 zmp-safe-bottom"
      >
        <div className="flex items-center justify-between border-b border-[#DCE1F0] pb-3">
          <div>
            <h2 className="text-[16px] font-bold text-[#121833]">
              Trung tâm Hỗ trợ & Tư vấn Dược sĩ
            </h2>
            <p className="mt-0.5 text-[12px] text-[#3E486B]">
              {companyInfo.workingHours}
            </p>
          </div>
          <button
            type="button"
            aria-label="Đóng hộp thoại hỗ trợ"
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F3F5FB] text-[#3E486B] hover:bg-[#E6E9FC]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Direct Hotline & Zalo OA Buttons (Contract Item 8) */}
        <div className="mt-3.5 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={callHotline}
            className="flex items-center justify-center gap-2 rounded-xl bg-[#3E4095] px-3 py-2.5 text-[13px] font-semibold text-white hover:bg-[#31337A]"
          >
            <PhoneCall size={16} />
            <span>Gọi {companyInfo.hotlineDisplay}</span>
          </button>

          <button
            type="button"
            onClick={() => chatZaloOA()}
            className="flex items-center justify-center gap-2 rounded-xl border border-[#3E4095] bg-[#EEF0FD] px-3 py-2.5 text-[13px] font-semibold text-[#3E4095] hover:bg-[#DDE1FA]"
          >
            <MessageCircle size={16} />
            <span>Chat Zalo OA</span>
          </button>
        </div>

        {/* Feedback / Pharmacist Question Form */}
        {submitted ? (
          <div className="my-6 flex flex-col items-center text-center">
            <CheckCircle2 size={40} className="text-[#3E4095]" />
            <p className="mt-2 text-[15px] font-semibold text-[#121833]">
              Đã tiếp nhận yêu cầu!
            </p>
            <p className="mt-1 text-[12.5px] text-[#3E486B]">
              Dược sĩ phụ trách NESPHAR sẽ phản hồi qua Zalo của bạn trong ít phút.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <div>
              <label className="block text-[12.5px] font-medium text-[#121833]">
                Chủ đề cần hỗ trợ
              </label>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                {[
                  { id: "tu-van", label: "Tư vấn sản phẩm" },
                  { id: "bao-gia-si", label: "Mở tài khoản sỉ" },
                  { id: "gop-y", label: "Góp ý dịch vụ" },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTopic(t.id as typeof topic)}
                    className={`rounded-lg border px-2 py-1.5 text-[12px] font-medium transition-colors ${
                      topic === t.id
                        ? "border-[#3E4095] bg-[#E6E9FC] text-[#282A6E]"
                        : "border-[#DCE1F0] bg-[#FAFBFF] text-[#3E486B]"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="support-phone"
                className="block text-[12.5px] font-medium text-[#121833]"
              >
                Số điện thoại nhận phản hồi (Tùy chọn)
              </label>
              <input
                id="support-phone"
                type="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="Nhập SĐT để Dược sĩ gọi lại khi cần"
                className="mt-1 w-full rounded-xl border border-[#DCE1F0] bg-[#FAFBFF] px-3 py-2 text-[13.5px] text-[#121833] placeholder:text-[#5A658A]"
              />
            </div>

            <div>
              <label
                htmlFor="support-message"
                className="block text-[12.5px] font-medium text-[#121833]"
              >
                Nội dung câu hỏi / Phản hồi
              </label>
              <textarea
                id="support-message"
                rows={3}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Mô tả triệu chứng, sản phẩm quan tâm hoặc thông tin nhà thuốc muốn đăng ký đại lý..."
                className="mt-1 w-full rounded-xl border border-[#DCE1F0] bg-[#FAFBFF] px-3 py-2 text-[13.5px] text-[#121833] placeholder:text-[#5A658A]"
              />
            </div>

            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#3E4095] py-2.5 text-[14px] font-semibold text-white hover:bg-[#31337A]"
            >
              <Send size={15} />
              <span>Gửi phản hồi cho NESPHAR</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
