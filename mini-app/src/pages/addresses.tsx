import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAtom, useAtomValue } from "jotai";
import {
  CheckCircle2,
  ChevronLeft,
  MapPin,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  addressesAtom,
  customerIdAtom,
  selectedAddressIdAtom,
  zaloIdAtom,
} from "@/state/store";
import { Address } from "@/types";
import { useAppActions } from "@/hooks/useAppActions";
import {
  createMiniAppAddressApi,
  deleteMiniAppAddressApi,
  updateMiniAppAddressApi,
} from "@/services/api";
import { ZaloPreviewCapsule } from "@/components/ZaloPreviewCapsule";

const AddressesPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromCheckout = searchParams.get("from") === "checkout";

  const customerId = useAtomValue(customerIdAtom);
  const zaloId = useAtomValue(zaloIdAtom);
  const [addresses, setAddresses] = useAtom(addressesAtom);
  const [selectedId, setSelectedId] = useAtom(selectedAddressIdAtom);
  const { showToast } = useAppActions();

  const [modalOpen, setModalOpen] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [ward, setWard] = useState("");
  const [district, setDistrict] = useState("TP. Hà Tĩnh");
  const [province, setProvince] = useState("Tỉnh Hà Tĩnh");
  const [tag, setTag] = useState<Address["tag"]>("Nhà riêng");

  const handleSelect = async (addr: Address) => {
    setSelectedId(addr.id);
    if (fromCheckout) {
      navigate(-1);
    } else {
      setAddresses(
        addresses.map((a) => ({ ...a, isDefault: a.id === addr.id }))
      );
      try {
        const res = await updateMiniAppAddressApi(addr.id, {
          customerId,
          isDefault: true,
        });
        if (res?.addresses) setAddresses(res.addresses);
      } catch {
        // local state kept
      }
      showToast("Đã đặt làm địa chỉ nhận hàng mặc định");
    }
  };

  const handleDelete = async (id: string) => {
    if (addresses.length <= 1) {
      showToast("Cần giữ lại ít nhất 1 địa chỉ nhận hàng");
      return;
    }
    setAddresses(addresses.filter((a) => a.id !== id));
    try {
      const res = await deleteMiniAppAddressApi(id, customerId);
      if (res?.addresses) setAddresses(res.addresses);
    } catch {
      // local state kept
    }
    showToast("Đã xóa địa chỉ");
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientName.trim() || !phone.trim() || !street.trim()) {
      showToast("Vui lòng điền đầy đủ người nhận, SĐT và địa chỉ");
      return;
    }
    const payload = {
      recipientName: recipientName.trim(),
      phone: phone.trim(),
      street: street.trim(),
      ward: ward.trim() || "Phường Trần Phú",
      district: district.trim() || "TP. Hà Tĩnh",
      province: province.trim() || "Tỉnh Hà Tĩnh",
      isDefault: addresses.length === 0,
      tag,
    };

    try {
      const apiRes = await createMiniAppAddressApi({
        customerId,
        zaloId: zaloId || undefined,
        ...payload,
      });
      if (apiRes?.addresses) {
        setAddresses(apiRes.addresses);
        setSelectedId(apiRes.createdId);
        setModalOpen(false);
        setRecipientName("");
        setPhone("");
        setStreet("");
        setWard("");
        showToast("Đã thêm địa chỉ nhận hàng mới");
        return;
      }
    } catch {
      // fallback below
    }

    const newAddr: Address = {
      id: `addr-${Date.now()}`,
      ...payload,
    };
    setAddresses([newAddr, ...addresses]);
    setSelectedId(newAddr.id);
    setModalOpen(false);
    setRecipientName("");
    setPhone("");
    setStreet("");
    setWard("");
    showToast("Đã thêm địa chỉ nhận hàng mới");
  };

  return (
    <div className="min-h-screen bg-[#F3F5FB] pb-24">
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
            <h1 className="text-[17px] font-bold">Sổ địa chỉ nhận hàng</h1>
          </div>
          <ZaloPreviewCapsule tone="on-dark" />
        </div>
      </header>

      <main className="space-y-3 p-3.5">
        {addresses.map((addr) => {
          const isChosen = fromCheckout
            ? selectedId === addr.id
            : addr.isDefault;
          return (
            <div
              key={addr.id}
              onClick={() => handleSelect(addr)}
              className={`cursor-pointer rounded-xl border p-3.5 transition-colors ${
                isChosen
                  ? "border-[#3E4095] bg-[#EEF0FD]"
                  : "border-[#DCE1F0] bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <MapPin
                    size={18}
                    className="mt-0.5 shrink-0 text-[#3E4095]"
                  />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-bold text-[#121833]">
                        {addr.recipientName}
                      </span>
                      <span className="tabular-nums text-[13px] text-[#3E486B]">
                        {addr.phone}
                      </span>
                    </div>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-[#3E486B]">
                      {addr.street}, {addr.ward}, {addr.district}, {addr.province}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="rounded bg-white px-2 py-0.5 text-[11px] font-medium text-[#282A6E] border border-[#DCE1F0]">
                        {addr.tag}
                      </span>
                      {addr.isDefault && (
                        <span className="inline-flex items-center gap-1 rounded bg-[#3E4095] px-2 py-0.5 text-[10.5px] font-semibold text-white">
                          <CheckCircle2 size={11} />
                          <span>Mặc định</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  aria-label="Xóa địa chỉ"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(addr.id);
                  }}
                  className="p-1 text-[#5A658A] hover:text-[#D92D20]"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#3E4095] bg-white py-3.5 text-[14px] font-semibold text-[#3E4095] hover:bg-[#EEF0FD]"
        >
          <Plus size={18} />
          <span>Thêm địa chỉ nhận hàng mới</span>
        </button>
      </main>

      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Thêm địa chỉ mới"
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#121536]/50"
          onClick={() => setModalOpen(false)}
        >
          <form
            onSubmit={handleAddAddress}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[440px] rounded-t-2xl bg-white p-4 zmp-safe-bottom"
          >
            <div className="flex items-center justify-between border-b border-[#DCE1F0] pb-3">
              <h2 className="text-[16px] font-bold text-[#121833]">
                Thêm địa chỉ nhận hàng
              </h2>
              <button
                type="button"
                aria-label="Đóng"
                onClick={() => setModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F3F5FB]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-3 space-y-2.5">
              <input
                type="text"
                required
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Họ tên người nhận / Tên Nhà thuốc"
                className="w-full rounded-xl border border-[#DCE1F0] bg-[#FAFBFF] px-3 py-2 text-[13.5px] text-[#121833] placeholder:text-[#5A658A]"
              />
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Số điện thoại nhận hàng"
                className="w-full rounded-xl border border-[#DCE1F0] bg-[#FAFBFF] px-3 py-2 text-[13.5px] text-[#121833] placeholder:text-[#5A658A]"
              />
              <input
                type="text"
                required
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="Số nhà, tên đường, tổ dân phố..."
                className="w-full rounded-xl border border-[#DCE1F0] bg-[#FAFBFF] px-3 py-2 text-[13.5px] text-[#121833] placeholder:text-[#5A658A]"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={ward}
                  onChange={(e) => setWard(e.target.value)}
                  placeholder="Phường / Xã"
                  className="w-full rounded-xl border border-[#DCE1F0] bg-[#FAFBFF] px-3 py-2 text-[13px] text-[#121833] placeholder:text-[#5A658A]"
                />
                <input
                  type="text"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  placeholder="Quận / Huyện / TP"
                  className="w-full rounded-xl border border-[#DCE1F0] bg-[#FAFBFF] px-3 py-2 text-[13px] text-[#121833] placeholder:text-[#5A658A]"
                />
              </div>
              <input
                type="text"
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                placeholder="Tỉnh / Thành phố"
                className="w-full rounded-xl border border-[#DCE1F0] bg-[#FAFBFF] px-3 py-2 text-[13px] text-[#121833] placeholder:text-[#5A658A]"
              />

              <div className="grid grid-cols-3 gap-1.5 pt-1">
                {(
                  ["Nhà riêng", "Nhà thuốc / Cơ sở", "Văn phòng"] as const
                ).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTag(t)}
                    className={`rounded-lg border py-1.5 text-[11.5px] font-medium ${
                      tag === t
                        ? "border-[#3E4095] bg-[#E6E9FC] text-[#282A6E]"
                        : "border-[#DCE1F0] bg-[#FAFBFF] text-[#3E486B]"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <button
                type="submit"
                className="mt-2 w-full rounded-xl bg-[#3E4095] py-2.5 text-[14px] font-bold text-white"
              >
                Lưu địa chỉ
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AddressesPage;
