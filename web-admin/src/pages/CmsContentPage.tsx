import React, { useEffect, useState } from "react";
import { Bell, Edit3, Image as ImageIcon, Plus, Send, Trash2, Upload } from "lucide-react";
import { apiRequest, uploadAdminFile } from "../api/client";
import { ModalDialog } from "../components/OverlayPortal";
import { useAuth } from "../context/AuthContext";
import { formatDateTimeVi, formatVnd } from "../utils/format";

type CmsTab = "banners" | "categories" | "vouchers" | "articles" | "settings";

interface BannerItem {
  id: string;
  badge: string;
  title: string;
  points: string[];
  imageUrl: string;
  ctaLink: string;
  sortOrder: number;
  isActive: boolean;
}

interface CategoryItem {
  id: string;
  name: string;
  shortName: string;
  iconKey: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
}

interface VoucherItem {
  id: string;
  code: string;
  title: string;
  description: string;
  discountType: "fixed" | "percent";
  discountValue: number;
  maxDiscount: number | null;
  minOrderValue: number;
  expiryDate: string;
  usageLimit: number;
  usedCount: number;
  isActive: boolean;
}

interface ArticleItem {
  slug: string;
  group: "policy" | "about" | "health";
  categoryLabel: string;
  title: string;
  summary: string;
  authorLocation: string;
  sections: Array<{ heading: string; paragraphs: string[] }>;
  isPublished: boolean;
  updatedAt: string;
}

interface NotificationLog {
  id: string;
  customerId: string | null;
  type: string;
  title: string;
  body: string;
  targetLink: string;
  createdAt: string;
}

const PROTECTED_POLICY_SLUGS = new Set([
  "dieu-khoan-chinh-sach",
  "chinh-sach-bao-mat",
  "chinh-sach-doi-tra",
  "chinh-sach-giao-hang",
  "thong-tin-lien-he",
  "gioi-thieu-nesphar",
]);

function toDateInputValue(raw: string): string {
  const s = (raw || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return "2026-12-31";
}

function fromDateInputToVi(iso: string): string {
  const m = (iso || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return iso;
}

const BannerCover: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [src]);
  return (
    <div className="flex h-36 w-full items-center justify-center overflow-hidden bg-[#EEF0FD]">
      {src && !broken ? (
        <img
          src={src}
          alt={alt}
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <ImageIcon className="h-7 w-7 text-pharma-500/60" />
      )}
    </div>
  );
};

export const CmsContentPage: React.FC = () => {
  const { hasPermission, showToast } = useAuth();
  const [tab, setTab] = useState<CmsTab>("banners");
  const [loading, setLoading] = useState(true);
  const [qrBroken, setQrBroken] = useState(false);

  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [vouchers, setVouchers] = useState<VoucherItem[]>([]);
  const [articles, setArticles] = useState<ArticleItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationLog[]>([]);

  const [companyInfo, setCompanyInfo] = useState<Record<string, string | number>>({});
  const [nearExpiryDays, setNearExpiryDays] = useState<number>(90);
  const [tierDiscounts, setTierDiscounts] = useState<Record<string, number>>({
    retail: 0,
    clinic: 8,
    pharmacy: 12,
    distributor: 18,
  });
  const [paymentConfig, setPaymentConfig] = useState({
    bankBin: "970436",
    bankShortName: "Vietcombank",
    accountNo: "0201000686868",
    accountName: "CONG TY TNHH DUOC PHAM NESPHAR",
    transferPrefix: "NESPHAR",
    webhookSecret: "",
    autoConfirmOnPaid: true,
  });
  const [alertConfig, setAlertConfig] = useState({
    telegramEnabled: false,
    telegramBotToken: "",
    telegramChatId: "",
    outboundWebhookUrl: "",
  });
  const [testingTelegram, setTestingTelegram] = useState(false);

  // Editors
  const [bannerModal, setBannerModal] = useState<BannerItem | null>(null);
  const [categoryModal, setCategoryModal] = useState<CategoryItem | null>(null);
  const [voucherModal, setVoucherModal] = useState<VoucherItem | null>(null);
  const [articleModal, setArticleModal] = useState<ArticleItem | null>(null);
  const [pushForm, setPushForm] = useState({
    title: "",
    body: "",
    type: "promo",
    targetLink: "/vouchers",
  });
  const [saving, setSaving] = useState(false);

  const canManage = hasPermission("manage_cms");

  const loadCms = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{
        banners: BannerItem[];
        categories: CategoryItem[];
        vouchers: VoucherItem[];
        articles: ArticleItem[];
        notifications: NotificationLog[];
        settings: Record<string, unknown>;
      }>("/cms/all");
      setBanners(res.banners);
      setCategories(res.categories);
      setVouchers(res.vouchers);
      setArticles(res.articles);
      setNotifications(res.notifications);
      if (res.settings.company_info) {
        setCompanyInfo(res.settings.company_info as Record<string, string | number>);
      }
      if (res.settings.near_expiry_days) {
        setNearExpiryDays(Number(res.settings.near_expiry_days) || 90);
      }
      if (res.settings.tier_discounts) {
        setTierDiscounts(res.settings.tier_discounts as Record<string, number>);
      }
      if (res.settings.payment_config) {
        setPaymentConfig((prev) => ({
          ...prev,
          ...(res.settings.payment_config as Partial<typeof prev>),
        }));
      }
      if (res.settings.alert_config) {
        setAlertConfig((prev) => ({
          ...prev,
          ...(res.settings.alert_config as Partial<typeof prev>),
        }));
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Không thể tải dữ liệu CMS", "negative");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCms();
  }, []);

  useEffect(() => {
    setQrBroken(false);
  }, [paymentConfig.bankBin, paymentConfig.accountNo]);

  const handleSaveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bannerModal) return;
    setSaving(true);
    try {
      const cleanedPoints = bannerModal.points.map((s) => s.trim()).filter(Boolean);
      await apiRequest("/cms/banners", {
        method: "POST",
        body: JSON.stringify({ ...bannerModal, points: cleanedPoints }),
      });
      showToast(`Đã lưu banner "${bannerModal.title}"`);
      setBannerModal(null);
      await loadCms();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lưu banner thất bại", "negative");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBanner = async (b: BannerItem) => {
    if (!canManage || !window.confirm(`Xóa vĩnh viễn banner "${b.title}"?`)) return;
    try {
      await apiRequest(`/cms/banners/${encodeURIComponent(b.id)}`, { method: "DELETE" });
      showToast(`Đã xóa banner "${b.title}"`);
      if (bannerModal?.id === b.id) setBannerModal(null);
      await loadCms();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Không thể xóa banner", "negative");
    }
  };

  const handleUploadBannerImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !bannerModal) return;
    try {
      const res = await uploadAdminFile(file, "media");
      setBannerModal({ ...bannerModal, imageUrl: res.url });
      showToast("Đã tải ảnh banner mới");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Không thể tải ảnh", "negative");
    }
  };

  const handleToggleCategory = async (c: CategoryItem) => {
    if (!canManage) return;
    try {
      await apiRequest("/cms/categories", {
        method: "POST",
        body: JSON.stringify({ ...c, isActive: !c.isActive }),
      });
      showToast(`Đã cập nhật danh mục "${c.name}"`);
      await loadCms();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Cập nhật thất bại", "negative");
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryModal) return;
    setSaving(true);
    try {
      await apiRequest("/cms/categories", {
        method: "POST",
        body: JSON.stringify(categoryModal),
      });
      showToast(`Đã lưu danh mục "${categoryModal.name}"`);
      setCategoryModal(null);
      await loadCms();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lưu danh mục thất bại", "negative");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (c: CategoryItem) => {
    if (!canManage || !window.confirm(`Xóa danh mục "${c.name}"?`)) return;
    try {
      await apiRequest(`/cms/categories/${encodeURIComponent(c.id)}`, { method: "DELETE" });
      showToast(`Đã xóa danh mục "${c.name}"`);
      if (categoryModal?.id === c.id) setCategoryModal(null);
      await loadCms();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Không thể xóa danh mục", "negative");
    }
  };

  const handleSaveVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voucherModal) return;
    setSaving(true);
    try {
      await apiRequest("/cms/vouchers", {
        method: "POST",
        body: JSON.stringify(voucherModal),
      });
      showToast(`Đã lưu mã ưu đãi ${voucherModal.code}`);
      setVoucherModal(null);
      await loadCms();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lưu voucher thất bại", "negative");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteVoucher = async (v: VoucherItem) => {
    if (!canManage || !window.confirm(`Xóa vĩnh viễn mã giảm giá "${v.code}"?`)) return;
    try {
      await apiRequest(`/cms/vouchers/${encodeURIComponent(v.id)}`, { method: "DELETE" });
      showToast(`Đã xóa mã ${v.code}`);
      if (voucherModal?.id === v.id) setVoucherModal(null);
      await loadCms();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Không thể xóa mã giảm giá", "negative");
    }
  };

  const handleSaveArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!articleModal) return;
    setSaving(true);
    try {
      const cleanedSections = articleModal.sections.map((sec) => ({
        heading: sec.heading.trim() || "Nội dung",
        paragraphs: sec.paragraphs.map((p) => p.trim()).filter(Boolean),
      }));
      await apiRequest("/cms/articles", {
        method: "POST",
        body: JSON.stringify({ ...articleModal, sections: cleanedSections }),
      });
      showToast(`Đã lưu bài viết "${articleModal.title}"`);
      setArticleModal(null);
      await loadCms();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lưu bài viết thất bại", "negative");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteArticle = async (a: ArticleItem) => {
    if (!canManage || !window.confirm(`Xóa vĩnh viễn bài viết "${a.title}"?`)) return;
    try {
      await apiRequest(`/cms/articles/${encodeURIComponent(a.slug)}`, { method: "DELETE" });
      showToast(`Đã xóa bài viết "${a.title}"`);
      if (articleModal?.slug === a.slug) setArticleModal(null);
      await loadCms();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Không thể xóa bài viết", "negative");
    }
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest("/cms/notifications", {
        method: "POST",
        body: JSON.stringify(pushForm),
      });
      showToast("Đã phát thông báo xuống Zalo Mini App");
      setPushForm({ title: "", body: "", type: "promo", targetLink: "/vouchers" });
      await loadCms();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gửi thông báo thất bại", "negative");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNotification = async (n: NotificationLog) => {
    if (!canManage || !window.confirm(`Xóa thông báo "${n.title}" khỏi hộp thư App?`)) return;
    try {
      await apiRequest(`/cms/notifications/${encodeURIComponent(n.id)}`, { method: "DELETE" });
      showToast("Đã xóa thông báo");
      await loadCms();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Không thể xóa thông báo", "negative");
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest("/settings", {
        method: "PUT",
        body: JSON.stringify({
          companyInfo,
          nearExpiryDays,
          tierDiscounts,
          paymentConfig,
          alertConfig,
        }),
      });
      showToast("Đã lưu cấu hình hệ thống");
      await loadCms();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lưu cấu hình thất bại", "negative");
    } finally {
      setSaving(false);
    }
  };

  const handleTestTelegram = async () => {
    setTestingTelegram(true);
    try {
      await apiRequest("/settings/test-telegram", {
        method: "POST",
        body: JSON.stringify(alertConfig),
      });
      showToast("Đã gửi tin nhắn kiểm thử vào nhóm Telegram!");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Kiểm thử Telegram thất bại", "negative");
    } finally {
      setTestingTelegram(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <h1 className="text-[22px] font-bold text-ink-primary">Nội dung App</h1>
      </div>

      {/* Main White Card */}
      <div className="admin-card space-y-5 p-5">
        <div className="overflow-x-auto">
          <div className="admin-tabs">
            {[
              { id: "banners" as CmsTab, label: `Banner (${banners.length})` },
              { id: "categories" as CmsTab, label: `Danh mục (${categories.length})` },
              { id: "vouchers" as CmsTab, label: `Mã giảm giá (${vouchers.length})` },
              { id: "articles" as CmsTab, label: `Bài viết & Chính sách (${articles.length})` },
              { id: "settings" as CmsTab, label: "Thông báo & Thanh toán" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`admin-tab-btn ${tab === t.id ? "admin-tab-active" : ""}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-[13.5px] text-ink-muted">
            Đang tải nội dung...
          </div>
        ) : (
          <>
            {/* TAB 1: BANNERS */}
            {tab === "banners" && (
              <div className="space-y-4">
                {canManage && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        setBannerModal({
                          id: "",
                          badge: "ƯU ĐÃI NESPHAR",
                          title: "",
                          points: ["Chính hãng 100%", "Giao nhanh nội tỉnh Hà Tĩnh"],
                          imageUrl: "/uploads/media/hero-banner-1.jpg",
                          ctaLink: "/categories",
                          sortOrder: banners.length + 1,
                          isActive: true,
                        })
                      }
                      className="btn-press inline-flex h-9 items-center gap-1.5 rounded-xl bg-sidebar px-3.5 text-[13px] font-semibold text-white hover:bg-pharma-600"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Thêm Banner</span>
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {banners.map((b) => (
                    <div key={b.id} className="admin-card flex flex-col overflow-hidden">
                      <BannerCover src={b.imageUrl} alt={b.title} />
                      <div className="flex flex-1 flex-col justify-between p-4">
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate rounded-md bg-[#EEF0FD] px-2 py-0.5 text-[11px] font-semibold text-pharma-700">
                              {b.badge}
                            </span>
                            <span
                              className="whitespace-nowrap text-[11.5px] font-medium"
                              style={{ color: b.isActive ? "#136C3E" : "#B42318" }}
                            >
                              {b.isActive ? "Đang hiện" : "Đang ẩn"}
                            </span>
                          </div>
                          <h3 className="mt-2 font-semibold text-ink-primary">{b.title}</h3>
                          <ul className="mt-2 space-y-1 text-[12px] text-ink-muted">
                            {b.points.map((pt, i) => (
                              <li key={i}>• {pt}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t border-[#F1F3F9] pt-3">
                          <code className="truncate text-[11.5px] text-ink-muted">
                            {b.ctaLink}
                          </code>
                          <div className="flex shrink-0 items-center gap-3">
                            <button
                              type="button"
                              onClick={() => setBannerModal(b)}
                              className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-pharma-600 hover:underline"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              <span>Sửa</span>
                            </button>
                            {canManage && (
                              <button
                                type="button"
                                onClick={() => handleDeleteBanner(b)}
                                title="Xóa banner"
                                className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[#B42318] hover:underline"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>Xóa</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 2: CATEGORIES */}
            {tab === "categories" && (
              <div className="space-y-4">
                {canManage && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        setCategoryModal({
                          id: "",
                          name: "",
                          shortName: "",
                          iconKey: "supplement",
                          description: "",
                          sortOrder: categories.length + 1,
                          isActive: true,
                        })
                      }
                      className="btn-press inline-flex h-9 items-center gap-1.5 rounded-xl bg-sidebar px-3.5 text-[13px] font-semibold text-white hover:bg-pharma-600"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Thêm danh mục</span>
                    </button>
                  </div>
                )}

                <div className="table-shell">
                  <table>
                    <thead>
                      <tr>
                        <th className="w-14">STT</th>
                        <th>Mã</th>
                        <th>Tên danh mục</th>
                        <th>Tên ngắn</th>
                        <th>Mô tả</th>
                        <th>Trạng thái</th>
                        <th className="text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="anim-rows">
                      {categories.map((c) => (
                        <tr key={c.id}>
                          <td className="text-ink-muted tabular-nums">{c.sortOrder}</td>
                          <td className="whitespace-nowrap">
                            <code className="text-[12px] text-pharma-600">{c.id}</code>
                          </td>
                          <td className="whitespace-nowrap font-semibold text-ink-primary">
                            {c.name}
                          </td>
                          <td className="whitespace-nowrap text-ink-secondary">{c.shortName}</td>
                          <td className="max-w-sm text-[13px] text-ink-muted">{c.description}</td>
                          <td>
                            <button
                              type="button"
                              onClick={() => handleToggleCategory(c)}
                              className="whitespace-nowrap rounded-lg px-2.5 py-1 text-[11.5px] font-medium"
                              style={
                                c.isActive
                                  ? { backgroundColor: "#E8F8EE", color: "#136C3E" }
                                  : { backgroundColor: "#F1F3F8", color: "#4A536D" }
                              }
                            >
                              {c.isActive ? "Đang hiện" : "Tạm ẩn"}
                            </button>
                          </td>
                          <td className="whitespace-nowrap text-right">
                            <button
                              type="button"
                              onClick={() => setCategoryModal(c)}
                              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-pharma-600 hover:bg-[#EEF0FD]"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              <span>Sửa</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 3: VOUCHERS */}
            {tab === "vouchers" && (
              <div className="space-y-4">
                {canManage && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        setVoucherModal({
                          id: "",
                          code: "NESPHAR50",
                          title: "Giảm 50.000đ đơn từ 499.000đ",
                          description: "Áp dụng toàn bộ sản phẩm trên Mini App.",
                          discountType: "fixed",
                          discountValue: 50000,
                          maxDiscount: null,
                          minOrderValue: 499000,
                          expiryDate: "31/12/2026",
                          usageLimit: 300,
                          usedCount: 0,
                          isActive: true,
                        })
                      }
                      className="btn-press inline-flex h-9 items-center gap-1.5 rounded-xl bg-sidebar px-3.5 text-[13px] font-semibold text-white hover:bg-pharma-600"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Tạo mã giảm giá</span>
                    </button>
                  </div>
                )}

                <div className="table-shell">
                  <table>
                    <thead>
                      <tr>
                        <th>Mã</th>
                        <th>Chương trình</th>
                        <th className="text-right">Mức giảm</th>
                        <th className="text-right">Đơn tối thiểu</th>
                        <th className="text-right">Lượt dùng</th>
                        <th>Hạn dùng</th>
                        <th>Trạng thái</th>
                        <th className="text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="anim-rows">
                      {vouchers.map((v) => (
                        <tr key={v.id}>
                          <td className="whitespace-nowrap">
                            <code className="rounded-md bg-[#EEF0FD] px-2 py-1 text-[12.5px] font-semibold text-pharma-700">
                              {v.code}
                            </code>
                          </td>
                          <td>
                            <div className="font-medium text-ink-primary">{v.title}</div>
                            <div className="text-[12px] text-ink-muted">{v.description}</div>
                          </td>
                          <td className="whitespace-nowrap text-right font-semibold text-ink-primary tabular-nums">
                            {v.discountType === "fixed"
                              ? formatVnd(v.discountValue)
                              : `${v.discountValue}%${
                                  v.maxDiscount ? ` (tối đa ${formatVnd(v.maxDiscount)})` : ""
                                }`}
                          </td>
                          <td className="whitespace-nowrap text-right text-ink-secondary tabular-nums">
                            {formatVnd(v.minOrderValue)}
                          </td>
                          <td className="whitespace-nowrap text-right text-ink-secondary tabular-nums">
                            {v.usedCount} / {v.usageLimit}
                          </td>
                          <td className="whitespace-nowrap text-ink-muted tabular-nums">
                            {v.expiryDate}
                          </td>
                          <td>
                            <span
                              className="inline-block whitespace-nowrap rounded-lg px-2.5 py-1 text-[11.5px] font-medium"
                              style={
                                v.isActive
                                  ? { backgroundColor: "#E8F8EE", color: "#136C3E" }
                                  : { backgroundColor: "#F1F3F8", color: "#4A536D" }
                              }
                            >
                              {v.isActive ? "Đang mở" : "Đã khóa"}
                            </span>
                          </td>
                          <td className="whitespace-nowrap text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setVoucherModal(v)}
                                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-pharma-600 hover:bg-[#EEF0FD]"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                                <span>Sửa</span>
                              </button>
                              {canManage && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteVoucher(v)}
                                  title="Xóa mã giảm giá"
                                  className="inline-flex items-center rounded-lg p-1.5 text-[#B42318] hover:bg-[#FEECEB]"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 4: ARTICLES & POLICIES */}
            {tab === "articles" && (
              <div className="space-y-4">
                {canManage && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        setArticleModal({
                          slug: "",
                          group: "health",
                          categoryLabel: "TIN SỨC KHỎE",
                          title: "",
                          summary: "",
                          authorLocation: "Ban Dược học NESPHAR",
                          sections: [
                            {
                              heading: "1. Hướng dẫn từ Dược sĩ",
                              paragraphs: [""],
                            },
                          ],
                          isPublished: true,
                          updatedAt: "",
                        })
                      }
                      className="btn-press inline-flex h-9 items-center gap-1.5 rounded-xl bg-sidebar px-3.5 text-[13px] font-semibold text-white hover:bg-pharma-600"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Viết bài mới</span>
                    </button>
                  </div>
                )}

                <div className="table-shell">
                  <table>
                    <thead>
                      <tr>
                        <th>Nhóm</th>
                        <th>Tiêu đề</th>
                        <th>Đường dẫn</th>
                        <th>Cập nhật</th>
                        <th>Trạng thái</th>
                        <th className="text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="anim-rows">
                      {articles.map((a) => {
                        const groupMeta =
                          a.group === "policy"
                            ? { label: "Chính sách Zalo", bg: "#EEF0FD", ink: "#3E4095" }
                            : a.group === "about"
                              ? { label: "Giới thiệu", bg: "#F1F3F8", ink: "#4A536D" }
                              : { label: "Sức khỏe", bg: "#E8F8EE", ink: "#136C3E" };
                        const isProtected = PROTECTED_POLICY_SLUGS.has(a.slug);
                        return (
                          <tr key={a.slug}>
                            <td>
                              <span
                                className="inline-block whitespace-nowrap rounded-lg px-2.5 py-1 text-[11.5px] font-medium"
                                style={{ backgroundColor: groupMeta.bg, color: groupMeta.ink }}
                              >
                                {groupMeta.label}
                              </span>
                            </td>
                            <td>
                              <div className="font-semibold text-ink-primary">{a.title}</div>
                              <div className="line-clamp-1 max-w-md text-[12px] text-ink-muted">
                                {a.summary}
                              </div>
                            </td>
                            <td className="whitespace-nowrap">
                              <code className="text-[12px] text-ink-secondary">
                                /policy/{a.slug}
                              </code>
                            </td>
                            <td className="whitespace-nowrap text-[12px] text-ink-muted tabular-nums">
                              {formatDateTimeVi(a.updatedAt)}
                            </td>
                            <td>
                              <span
                                className="inline-block whitespace-nowrap rounded-lg px-2.5 py-1 text-[11.5px] font-medium"
                                style={
                                  a.isPublished
                                    ? { backgroundColor: "#E8F8EE", color: "#136C3E" }
                                    : { backgroundColor: "#F1F3F8", color: "#4A536D" }
                                }
                              >
                                {a.isPublished ? "Đã đăng" : "Bản nháp"}
                              </span>
                            </td>
                            <td className="whitespace-nowrap text-right">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setArticleModal(a)}
                                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-pharma-600 hover:bg-[#EEF0FD]"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                  <span>Sửa</span>
                                </button>
                                {canManage && !isProtected && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteArticle(a)}
                                    title="Xóa bài viết"
                                    className="inline-flex items-center rounded-lg p-1.5 text-[#B42318] hover:bg-[#FEECEB]"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 5: PUSH NOTIFICATIONS & SETTINGS */}
            {tab === "settings" && (
              <div className="mx-auto max-w-[1120px] space-y-8 py-2">
                {/* Row 1: Broadcast Notification */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                  <div className="lg:col-span-5">
                    <h2 className="text-[16px] font-semibold text-ink-primary">
                      Gửi thông báo Zalo Mini App
                    </h2>
                    <p className="mt-1 text-[13px] text-ink-muted">
                      Gửi tin khuyến mại hoặc thông báo mới đến hộp thư khách hàng trên App.
                    </p>

                    {notifications.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <div className="text-[12px] font-semibold text-ink-secondary">
                          Đã gửi gần đây ({notifications.length})
                        </div>
                        {notifications.slice(0, 4).map((n) => (
                          <div
                            key={n.id}
                            className="admin-card flex items-start justify-between gap-2 p-2.5 text-[12px]"
                          >
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-ink-primary">
                                {n.title}
                              </div>
                              <div className="line-clamp-1 text-ink-muted">{n.body}</div>
                            </div>
                            {canManage && (
                              <button
                                type="button"
                                onClick={() => handleDeleteNotification(n)}
                                title="Xóa thông báo này"
                                className="shrink-0 rounded p-1 text-ink-muted hover:bg-[#FEECEB] hover:text-[#B42318]"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <form
                    onSubmit={handleSendBroadcast}
                    className="admin-subtle-panel space-y-4 p-5 lg:col-span-7"
                  >
                    <div>
                      <label className="block text-[13px] font-medium text-ink-secondary">
                        Tiêu đề thông báo *
                      </label>
                      <input
                        type="text"
                        required
                        value={pushForm.title}
                        onChange={(e) => setPushForm({ ...pushForm, title: e.target.value })}
                        placeholder="VD: Tặng mã NESPHAR30 giảm 30.000đ"
                        className="mt-1 h-10 w-full px-3"
                      />
                    </div>

                    <div>
                      <label className="block text-[13px] font-medium text-ink-secondary">
                        Nội dung *
                      </label>
                      <textarea
                        rows={3}
                        required
                        value={pushForm.body}
                        onChange={(e) => setPushForm({ ...pushForm, body: e.target.value })}
                        placeholder="Nhập nội dung thông báo ngắn gọn..."
                        className="mt-1 w-full p-3"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-[13px] font-medium text-ink-secondary">
                          Loại thông báo
                        </label>
                        <select
                          value={pushForm.type}
                          onChange={(e) => setPushForm({ ...pushForm, type: e.target.value })}
                          className="mt-1 h-10 w-full pl-3"
                        >
                          <option value="promo">Khuyến mại / Voucher</option>
                          <option value="system">Thông báo hệ thống</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[13px] font-medium text-ink-secondary">
                          Trang đích khi bấm
                        </label>
                        <select
                          value={pushForm.targetLink}
                          onChange={(e) =>
                            setPushForm({ ...pushForm, targetLink: e.target.value })
                          }
                          className="mt-1 h-10 w-full pl-3"
                        >
                          <option value="/vouchers">Kho Voucher (/vouchers)</option>
                          <option value="/categories">Danh mục sản phẩm (/categories)</option>
                          <option value="/orders">Đơn hàng (/orders)</option>
                        </select>
                      </div>
                    </div>

                    {canManage && (
                      <div className="pt-1">
                        <button
                          type="submit"
                          disabled={saving}
                          className="btn-press inline-flex h-10 items-center gap-2 rounded-xl bg-pharma-600 px-5 text-[13.5px] font-semibold text-white hover:bg-pharma-700"
                        >
                          <Bell className="h-4 w-4" />
                          <Send className="h-3.5 w-3.5" />
                          <span>Gửi thông báo</span>
                        </button>
                      </div>
                    )}
                  </form>
                </div>

                <div className="border-t border-[#ECEFF6]" />

                {/* Row 2: Company Info, GSP Threshold & B2B Default Discounts */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                  <div className="lg:col-span-5">
                    <h2 className="text-[16px] font-semibold text-ink-primary">
                      Thông tin liên hệ, Hạn dùng & Chiết khấu sỉ
                    </h2>
                    <p className="mt-1 text-[13px] text-ink-muted">
                      Cập nhật Hotline, Zalo OA ID hiển thị trên Mini App, mốc báo cận hạn và mức giảm theo hạng đối tác.
                    </p>
                  </div>

                  <form
                    onSubmit={handleSaveSettings}
                    className="admin-subtle-panel space-y-4 p-5 lg:col-span-7"
                  >
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div>
                        <label className="block text-[13px] font-medium text-ink-secondary">
                          Hotline hiển thị
                        </label>
                        <input
                          type="text"
                          value={String(companyInfo.hotlineDisplay || "0926.090.668")}
                          onChange={(e) =>
                            setCompanyInfo({
                              ...companyInfo,
                              hotlineDisplay: e.target.value,
                              hotline: e.target.value.replace(/\D/g, ""),
                            })
                          }
                          className="mt-1 h-10 w-full px-3"
                        />
                      </div>
                      <div>
                        <label className="block text-[13px] font-medium text-ink-secondary">
                          Zalo OA ID (Chat nhanh)
                        </label>
                        <input
                          type="text"
                          value={String(companyInfo.zaloOaId || "")}
                          onChange={(e) =>
                            setCompanyInfo({
                              ...companyInfo,
                              zaloOaId: e.target.value.trim(),
                            })
                          }
                          placeholder="VD: 4490716441165809191"
                          className="mt-1 h-10 w-full px-3 tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-[13px] font-medium text-ink-secondary">
                          Báo trước cận hạn (ngày)
                        </label>
                        <input
                          type="number"
                          min={15}
                          max={365}
                          value={nearExpiryDays}
                          onChange={(e) => setNearExpiryDays(Number(e.target.value))}
                          className="mt-1 h-10 w-full px-3 tabular-nums"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[12.5px] font-medium text-ink-secondary">
                          Phòng khám (%)
                        </label>
                        <input
                          type="number"
                          value={tierDiscounts.clinic ?? 8}
                          onChange={(e) =>
                            setTierDiscounts({
                              ...tierDiscounts,
                              clinic: Number(e.target.value),
                            })
                          }
                          className="mt-1 h-10 w-full px-3 tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-[12.5px] font-medium text-ink-secondary">
                          Nhà thuốc (%)
                        </label>
                        <input
                          type="number"
                          value={tierDiscounts.pharmacy ?? 12}
                          onChange={(e) =>
                            setTierDiscounts({
                              ...tierDiscounts,
                              pharmacy: Number(e.target.value),
                            })
                          }
                          className="mt-1 h-10 w-full px-3 tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-[12.5px] font-medium text-ink-secondary">
                          Đại lý (%)
                        </label>
                        <input
                          type="number"
                          value={tierDiscounts.distributor ?? 18}
                          onChange={(e) =>
                            setTierDiscounts({
                              ...tierDiscounts,
                              distributor: Number(e.target.value),
                            })
                          }
                          className="mt-1 h-10 w-full px-3 tabular-nums"
                        />
                      </div>
                    </div>

                    {canManage && (
                      <div className="pt-1">
                        <button
                          type="submit"
                          disabled={saving}
                          className="btn-press h-10 rounded-xl bg-pharma-600 px-5 text-[13.5px] font-semibold text-white hover:bg-pharma-700"
                        >
                          Lưu thông số
                        </button>
                      </div>
                    )}
                  </form>
                </div>

                <div className="border-t border-[#ECEFF6]" />

                {/* Row 3: Dynamic VietQR Banking */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                  <div className="lg:col-span-5">
                    <h2 className="text-[16px] font-semibold text-ink-primary">
                      Tài khoản nhận tiền VietQR
                    </h2>
                    <p className="mt-1 text-[13px] text-ink-muted">
                      Tự sinh mã QR chuyển khoản đúng số tiền đơn hàng và nhận báo có tự động.
                    </p>
                    {paymentConfig.bankBin && paymentConfig.accountNo && !qrBroken && (
                      <div className="admin-card mt-4 inline-flex flex-col items-center p-3">
                        <img
                          src={`https://img.vietqr.io/image/${encodeURIComponent(
                            paymentConfig.bankBin
                          )}-${encodeURIComponent(
                            paymentConfig.accountNo
                          )}-compact2.png?amount=245000&addInfo=${encodeURIComponent(
                            `${paymentConfig.transferPrefix || "NESPHAR"} 00001462201`
                          )}&accountName=${encodeURIComponent(paymentConfig.accountName)}`}
                          alt="Mã VietQR mẫu"
                          onError={() => setQrBroken(true)}
                          className="h-40 w-40 rounded-lg border border-[#ECEFF6] object-contain"
                        />
                        <span className="mt-1.5 text-[12px] text-ink-muted">
                          Mã VietQR hiển thị cho khách
                        </span>
                      </div>
                    )}
                  </div>

                  <form
                    onSubmit={handleSaveSettings}
                    className="admin-subtle-panel space-y-4 p-5 lg:col-span-7"
                  >
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-[13px] font-medium text-ink-secondary">
                          Ngân hàng thụ hưởng
                        </label>
                        <select
                          value={`${paymentConfig.bankBin}|${paymentConfig.bankShortName}`}
                          onChange={(e) => {
                            const [bin, short] = e.target.value.split("|");
                            setPaymentConfig({
                              ...paymentConfig,
                              bankBin: bin,
                              bankShortName: short,
                            });
                          }}
                          className="mt-1 h-10 w-full pl-3"
                        >
                          {[
                            ["970436", "Vietcombank"],
                            ["970418", "BIDV"],
                            ["970415", "VietinBank"],
                            ["970405", "Agribank"],
                            ["970422", "MBBank"],
                            ["970407", "Techcombank"],
                            ["970416", "ACB"],
                            ["970432", "VPBank"],
                            ["970423", "TPBank"],
                            ["970403", "Sacombank"],
                            ["970437", "HDBank"],
                            ["970443", "SHB"],
                          ].map(([bin, name]) => (
                            <option key={bin} value={`${bin}|${name}`}>
                              {name} ({bin})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[13px] font-medium text-ink-secondary">
                          Số tài khoản *
                        </label>
                        <input
                          type="text"
                          required
                          value={paymentConfig.accountNo}
                          onChange={(e) =>
                            setPaymentConfig({
                              ...paymentConfig,
                              accountNo: e.target.value.trim(),
                            })
                          }
                          className="mt-1 h-10 w-full px-3 tabular-nums"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div className="sm:col-span-2">
                        <label className="block text-[13px] font-medium text-ink-secondary">
                          Chủ tài khoản (Không dấu, in hoa)
                        </label>
                        <input
                          type="text"
                          required
                          value={paymentConfig.accountName}
                          onChange={(e) =>
                            setPaymentConfig({
                              ...paymentConfig,
                              accountName: e.target.value.toUpperCase(),
                            })
                          }
                          className="mt-1 h-10 w-full px-3"
                        />
                      </div>

                      <div>
                        <label className="block text-[13px] font-medium text-ink-secondary">
                          Tiền tố nội dung CK
                        </label>
                        <input
                          type="text"
                          value={paymentConfig.transferPrefix}
                          onChange={(e) =>
                            setPaymentConfig({
                              ...paymentConfig,
                              transferPrefix: e.target.value.toUpperCase(),
                            })
                          }
                          className="mt-1 h-10 w-full px-3"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[13px] font-medium text-ink-secondary">
                        Khóa bảo mật Webhook (SePay / Casso)
                      </label>
                      <input
                        type="text"
                        value={paymentConfig.webhookSecret}
                        onChange={(e) =>
                          setPaymentConfig({
                            ...paymentConfig,
                            webhookSecret: e.target.value.trim(),
                          })
                        }
                        className="mt-1 h-10 w-full px-3 text-[13px]"
                      />
                    </div>

                    <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink-primary">
                      <input
                        type="checkbox"
                        checked={paymentConfig.autoConfirmOnPaid}
                        onChange={(e) =>
                          setPaymentConfig({
                            ...paymentConfig,
                            autoConfirmOnPaid: e.target.checked,
                          })
                        }
                      />
                      <span>Tự động xác nhận đơn ngay khi nhận đủ chuyển khoản</span>
                    </label>

                    {canManage && (
                      <div className="pt-1">
                        <button
                          type="submit"
                          disabled={saving}
                          className="btn-press h-10 rounded-xl bg-pharma-600 px-5 text-[13.5px] font-semibold text-white hover:bg-pharma-700"
                        >
                          Lưu tài khoản VietQR
                        </button>
                      </div>
                    )}
                  </form>
                </div>

                <div className="border-t border-[#ECEFF6]" />

                {/* Row 4: Real-time Pharmacist Alerts */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                  <div className="lg:col-span-5">
                    <h2 className="text-[16px] font-semibold text-ink-primary">
                      Báo đơn mới qua Telegram
                    </h2>
                    <p className="mt-1 text-[13px] text-ink-muted">
                      Nhận thông báo tức thì vào nhóm Telegram Dược sĩ khi có đơn hàng hoặc câu hỏi mới.
                    </p>
                  </div>

                  <form
                    onSubmit={handleSaveSettings}
                    className="admin-subtle-panel space-y-4 p-5 lg:col-span-7"
                  >
                    <label className="flex cursor-pointer items-center gap-2 text-[13.5px] font-semibold text-ink-primary">
                      <input
                        type="checkbox"
                        checked={alertConfig.telegramEnabled}
                        onChange={(e) =>
                          setAlertConfig({ ...alertConfig, telegramEnabled: e.target.checked })
                        }
                      />
                      <span>Bật báo đơn qua Telegram Bot</span>
                    </label>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-[13px] font-medium text-ink-secondary">
                          Telegram Bot Token
                        </label>
                        <input
                          type="password"
                          value={alertConfig.telegramBotToken}
                          onChange={(e) =>
                            setAlertConfig({
                              ...alertConfig,
                              telegramBotToken: e.target.value.trim(),
                            })
                          }
                          placeholder="123456789:AAH..."
                          className="mt-1 h-10 w-full px-3"
                        />
                      </div>

                      <div>
                        <label className="block text-[13px] font-medium text-ink-secondary">
                          Telegram Chat ID
                        </label>
                        <input
                          type="text"
                          value={alertConfig.telegramChatId}
                          onChange={(e) =>
                            setAlertConfig({
                              ...alertConfig,
                              telegramChatId: e.target.value.trim(),
                            })
                          }
                          placeholder="-100192837465"
                          className="mt-1 h-10 w-full px-3 tabular-nums"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[13px] font-medium text-ink-secondary">
                        Webhook URL mở rộng (n8n / Zalo ZNS)
                      </label>
                      <input
                        type="text"
                        value={alertConfig.outboundWebhookUrl}
                        onChange={(e) =>
                          setAlertConfig({
                            ...alertConfig,
                            outboundWebhookUrl: e.target.value.trim(),
                          })
                        }
                        placeholder="https://hooks.example.com/nesphar"
                        className="mt-1 h-10 w-full px-3"
                      />
                    </div>

                    {canManage && (
                      <div className="flex flex-wrap items-center gap-2.5 pt-1">
                        <button
                          type="submit"
                          disabled={saving}
                          className="btn-press h-10 rounded-xl bg-pharma-600 px-5 text-[13.5px] font-semibold text-white hover:bg-pharma-700"
                        >
                          Lưu cảnh báo
                        </button>
                        <button
                          type="button"
                          disabled={testingTelegram}
                          onClick={handleTestTelegram}
                          className="btn-press h-10 rounded-xl border border-borderline bg-white px-4 text-[13.5px] font-medium text-ink-secondary hover:bg-frame"
                        >
                          {testingTelegram ? "Đang gửi..." : "Gửi tin thử"}
                        </button>
                      </div>
                    )}
                  </form>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* PORTALED MODAL: BANNER EDITOR */}
      <ModalDialog
        open={Boolean(bannerModal)}
        onClose={() => setBannerModal(null)}
        widthClass="max-w-lg"
        title={bannerModal?.id ? "Chỉnh sửa Banner" : "Thêm Banner mới"}
        footer={
          <>
            {bannerModal?.id && canManage && (
              <button
                type="button"
                onClick={() => bannerModal && handleDeleteBanner(bannerModal)}
                className="mr-auto h-9 rounded-xl border border-[#F5C6C2] bg-white px-3.5 text-[13px] font-medium text-[#B42318] hover:bg-[#FEECEB]"
              >
                Xóa Banner
              </button>
            )}
            <button
              type="button"
              onClick={() => setBannerModal(null)}
              className="h-9 rounded-xl border border-borderline bg-white px-4 text-[13px] font-medium text-ink-secondary hover:bg-frame"
            >
              Đóng
            </button>
            <button
              type="submit"
              form="banner-editor-form"
              disabled={saving}
              className="btn-press h-9 rounded-xl bg-pharma-600 px-5 text-[13px] font-semibold text-white hover:bg-pharma-700"
            >
              Lưu Banner
            </button>
          </>
        }
      >
        {bannerModal && (
          <form id="banner-editor-form" onSubmit={handleSaveBanner} className="space-y-4">
            <BannerCover src={bannerModal.imageUrl} alt={bannerModal.title || "Xem trước"} />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12.5px] font-medium text-ink-secondary">
                  Nhãn nổi bật *
                </label>
                <input
                  type="text"
                  required
                  value={bannerModal.badge}
                  onChange={(e) =>
                    setBannerModal({ ...bannerModal, badge: e.target.value })
                  }
                  className="mt-1 h-9 w-full px-3"
                />
              </div>
              <div>
                <label className="block text-[12.5px] font-medium text-ink-secondary">
                  Trang đích khi bấm (CTA)
                </label>
                <input
                  type="text"
                  value={bannerModal.ctaLink}
                  onChange={(e) =>
                    setBannerModal({ ...bannerModal, ctaLink: e.target.value })
                  }
                  placeholder="/categories hoặc /vouchers"
                  className="mt-1 h-9 w-full px-3"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div className="col-span-3">
                <label className="block text-[12.5px] font-medium text-ink-secondary">
                  Tiêu đề chính *
                </label>
                <input
                  type="text"
                  required
                  value={bannerModal.title}
                  onChange={(e) =>
                    setBannerModal({ ...bannerModal, title: e.target.value })
                  }
                  className="mt-1 h-9 w-full px-3"
                />
              </div>
              <div>
                <label className="block text-[12.5px] font-medium text-ink-secondary">
                  Thứ tự
                </label>
                <input
                  type="number"
                  min={1}
                  value={bannerModal.sortOrder}
                  onChange={(e) =>
                    setBannerModal({ ...bannerModal, sortOrder: Number(e.target.value) || 1 })
                  }
                  className="mt-1 h-9 w-full px-3 tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="block text-[12.5px] font-medium text-ink-secondary">
                Các dòng điểm nhấn (bấm Enter xuống dòng cho từng ý)
              </label>
              <textarea
                rows={3}
                value={bannerModal.points.join("\n")}
                onChange={(e) =>
                  setBannerModal({
                    ...bannerModal,
                    points: e.target.value.split("\n"),
                  })
                }
                className="mt-1 w-full p-2.5 text-[13px]"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-borderline bg-white px-3 text-[12.5px] font-medium text-ink-secondary hover:bg-[#EEF0FD]">
                <Upload className="h-3.5 w-3.5" />
                <span>Tải ảnh mới từ máy</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleUploadBannerImage}
                  className="hidden"
                />
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink-primary">
                <input
                  type="checkbox"
                  checked={bannerModal.isActive}
                  onChange={(e) =>
                    setBannerModal({ ...bannerModal, isActive: e.target.checked })
                  }
                />
                <span>Hiển thị trên App</span>
              </label>
            </div>
          </form>
        )}
      </ModalDialog>

      {/* PORTALED MODAL: CATEGORY EDITOR */}
      <ModalDialog
        open={Boolean(categoryModal)}
        onClose={() => setCategoryModal(null)}
        widthClass="max-w-lg"
        title={categoryModal?.id ? "Chỉnh sửa Danh mục" : "Thêm Danh mục mới"}
        footer={
          <>
            {categoryModal?.id && canManage && (
              <button
                type="button"
                onClick={() => categoryModal && handleDeleteCategory(categoryModal)}
                className="mr-auto h-9 rounded-xl border border-[#F5C6C2] bg-white px-3.5 text-[13px] font-medium text-[#B42318] hover:bg-[#FEECEB]"
              >
                Xóa danh mục
              </button>
            )}
            <button
              type="button"
              onClick={() => setCategoryModal(null)}
              className="h-9 rounded-xl border border-borderline bg-white px-4 text-[13px] font-medium text-ink-secondary hover:bg-frame"
            >
              Hủy
            </button>
            <button
              type="submit"
              form="category-editor-form"
              disabled={saving}
              className="btn-press h-9 rounded-xl bg-pharma-600 px-5 text-[13px] font-semibold text-white hover:bg-pharma-700"
            >
              Lưu danh mục
            </button>
          </>
        }
      >
        {categoryModal && (
          <form id="category-editor-form" onSubmit={handleSaveCategory} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="block text-[12.5px] font-medium text-ink-secondary">
                  Tên đầy đủ danh mục / Công ty *
                </label>
                <input
                  type="text"
                  required
                  value={categoryModal.name}
                  onChange={(e) =>
                    setCategoryModal({ ...categoryModal, name: e.target.value })
                  }
                  placeholder="VD: Công ty Dược phẩm BioCare"
                  className="mt-1 h-9 w-full px-3"
                />
              </div>
              <div>
                <label className="block text-[12.5px] font-medium text-ink-secondary">
                  Tên ngắn trên App *
                </label>
                <input
                  type="text"
                  required
                  value={categoryModal.shortName}
                  onChange={(e) =>
                    setCategoryModal({ ...categoryModal, shortName: e.target.value })
                  }
                  placeholder="VD: BioCare"
                  className="mt-1 h-9 w-full px-3"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12.5px] font-medium text-ink-secondary">
                  Biểu tượng hiển thị
                </label>
                <select
                  value={categoryModal.iconKey}
                  onChange={(e) =>
                    setCategoryModal({ ...categoryModal, iconKey: e.target.value })
                  }
                  className="mt-1 h-9 w-full pl-2.5"
                >
                  <option value="supplement">Viên nang / TPBVSK</option>
                  <option value="rx">Khiên Y tế / Thuốc</option>
                  <option value="imported_rx">Ống nghe / Chuyên khoa</option>
                  <option value="otc">Nhịp tim / Thông dụng</option>
                  <option value="pediatric">Nhi khoa & Gia đình</option>
                </select>
              </div>
              <div>
                <label className="block text-[12.5px] font-medium text-ink-secondary">
                  Thứ tự sắp xếp
                </label>
                <input
                  type="number"
                  min={1}
                  value={categoryModal.sortOrder}
                  onChange={(e) =>
                    setCategoryModal({
                      ...categoryModal,
                      sortOrder: Number(e.target.value) || 1,
                    })
                  }
                  className="mt-1 h-9 w-full px-3 tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="block text-[12.5px] font-medium text-ink-secondary">
                Mô tả ngắn
              </label>
              <textarea
                rows={2}
                value={categoryModal.description}
                onChange={(e) =>
                  setCategoryModal({ ...categoryModal, description: e.target.value })
                }
                className="mt-1 w-full p-2.5 text-[13px]"
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink-primary">
              <input
                type="checkbox"
                checked={categoryModal.isActive}
                onChange={(e) =>
                  setCategoryModal({ ...categoryModal, isActive: e.target.checked })
                }
              />
              <span>Hiển thị trên Zalo Mini App</span>
            </label>
          </form>
        )}
      </ModalDialog>

      {/* PORTALED MODAL: VOUCHER EDITOR */}
      <ModalDialog
        open={Boolean(voucherModal)}
        onClose={() => setVoucherModal(null)}
        widthClass="max-w-lg"
        title={voucherModal?.id ? "Chỉnh sửa Mã giảm giá" : "Tạo Mã giảm giá mới"}
        footer={
          <>
            {voucherModal?.id && canManage && (
              <button
                type="button"
                onClick={() => voucherModal && handleDeleteVoucher(voucherModal)}
                className="mr-auto h-9 rounded-xl border border-[#F5C6C2] bg-white px-3.5 text-[13px] font-medium text-[#B42318] hover:bg-[#FEECEB]"
              >
                Xóa mã
              </button>
            )}
            <button
              type="button"
              onClick={() => setVoucherModal(null)}
              className="h-9 rounded-xl border border-borderline bg-white px-4 text-[13px] font-medium text-ink-secondary hover:bg-frame"
            >
              Hủy
            </button>
            <button
              type="submit"
              form="voucher-editor-form"
              disabled={saving}
              className="btn-press h-9 rounded-xl bg-pharma-600 px-5 text-[13px] font-semibold text-white hover:bg-pharma-700"
            >
              Lưu mã giảm giá
            </button>
          </>
        }
      >
        {voucherModal && (
          <form id="voucher-editor-form" onSubmit={handleSaveVoucher} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-[12.5px] font-medium text-ink-secondary">
                  Mã code *
                </label>
                <input
                  type="text"
                  required
                  value={voucherModal.code}
                  onChange={(e) =>
                    setVoucherModal({
                      ...voucherModal,
                      code: e.target.value.toUpperCase(),
                    })
                  }
                  className="mt-1 h-9 w-full px-3"
                />
              </div>
              <div>
                <label className="block text-[12.5px] font-medium text-ink-secondary">
                  Hạn sử dụng *
                </label>
                <input
                  type="date"
                  required
                  value={toDateInputValue(voucherModal.expiryDate)}
                  onChange={(e) =>
                    setVoucherModal({
                      ...voucherModal,
                      expiryDate: fromDateInputToVi(e.target.value),
                    })
                  }
                  className="mt-1 h-9 w-full px-2.5 tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[12.5px] font-medium text-ink-secondary">
                  Tổng lượt dùng
                </label>
                <input
                  type="number"
                  min={1}
                  value={voucherModal.usageLimit}
                  onChange={(e) =>
                    setVoucherModal({
                      ...voucherModal,
                      usageLimit: Number(e.target.value) || 100,
                    })
                  }
                  className="mt-1 h-9 w-full px-3 tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="block text-[12.5px] font-medium text-ink-secondary">
                Tên chương trình *
              </label>
              <input
                type="text"
                required
                value={voucherModal.title}
                onChange={(e) =>
                  setVoucherModal({ ...voucherModal, title: e.target.value })
                }
                className="mt-1 h-9 w-full px-3"
              />
            </div>

            <div>
              <label className="block text-[12.5px] font-medium text-ink-secondary">
                Mô tả điều kiện hiển thị trên App
              </label>
              <input
                type="text"
                value={voucherModal.description}
                onChange={(e) =>
                  setVoucherModal({ ...voucherModal, description: e.target.value })
                }
                className="mt-1 h-9 w-full px-3"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-[12.5px] font-medium text-ink-secondary">
                  Loại giảm
                </label>
                <select
                  value={voucherModal.discountType}
                  onChange={(e) =>
                    setVoucherModal({
                      ...voucherModal,
                      discountType: e.target.value as "fixed" | "percent",
                    })
                  }
                  className="mt-1 h-9 w-full pl-2.5"
                >
                  <option value="fixed">Số tiền (VNĐ)</option>
                  <option value="percent">Theo %</option>
                </select>
              </div>
              <div>
                <label className="block text-[12.5px] font-medium text-ink-secondary">
                  {voucherModal.discountType === "percent" ? "Mức giảm (%)" : "Mức giảm (đ)"}
                </label>
                <input
                  type="number"
                  min={1}
                  value={voucherModal.discountValue}
                  onChange={(e) =>
                    setVoucherModal({
                      ...voucherModal,
                      discountValue: Number(e.target.value),
                    })
                  }
                  className="mt-1 h-9 w-full px-3 tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[12.5px] font-medium text-ink-secondary">
                  Đơn tối thiểu (đ)
                </label>
                <input
                  type="number"
                  min={0}
                  value={voucherModal.minOrderValue}
                  onChange={(e) =>
                    setVoucherModal({
                      ...voucherModal,
                      minOrderValue: Number(e.target.value),
                    })
                  }
                  className="mt-1 h-9 w-full px-3 tabular-nums"
                />
              </div>
            </div>

            {voucherModal.discountType === "percent" && (
              <div>
                <label className="block text-[12.5px] font-medium text-ink-secondary">
                  Giảm tối đa (VNĐ — để trống nếu không giới hạn)
                </label>
                <input
                  type="number"
                  min={0}
                  value={voucherModal.maxDiscount ?? ""}
                  onChange={(e) =>
                    setVoucherModal({
                      ...voucherModal,
                      maxDiscount: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  placeholder="VD: 150000"
                  className="mt-1 h-9 w-full px-3 tabular-nums"
                />
              </div>
            )}

            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink-primary">
              <input
                type="checkbox"
                checked={voucherModal.isActive}
                onChange={(e) =>
                  setVoucherModal({ ...voucherModal, isActive: e.target.checked })
                }
              />
              <span>Mở áp dụng trên Mini App</span>
            </label>
          </form>
        )}
      </ModalDialog>

      {/* PORTALED MODAL: ARTICLE & POLICY EDITOR */}
      <ModalDialog
        open={Boolean(articleModal)}
        onClose={() => setArticleModal(null)}
        widthClass="max-w-2xl"
        title="Soạn thảo Bài viết / Chính sách"
        footer={
          <>
            {articleModal?.slug &&
              canManage &&
              !PROTECTED_POLICY_SLUGS.has(articleModal.slug) && (
                <button
                  type="button"
                  onClick={() => articleModal && handleDeleteArticle(articleModal)}
                  className="mr-auto h-9 rounded-xl border border-[#F5C6C2] bg-white px-3.5 text-[13px] font-medium text-[#B42318] hover:bg-[#FEECEB]"
                >
                  Xóa bài viết
                </button>
              )}
            <button
              type="button"
              onClick={() => setArticleModal(null)}
              className="h-9 rounded-xl border border-borderline bg-white px-4 text-[13px] font-medium text-ink-secondary hover:bg-frame"
            >
              Đóng
            </button>
            <button
              type="submit"
              form="article-editor-form"
              disabled={saving}
              className="btn-press h-9 rounded-xl bg-pharma-600 px-5 text-[13px] font-semibold text-white hover:bg-pharma-700"
            >
              Lưu bài viết
            </button>
          </>
        }
      >
        {articleModal && (
          <form id="article-editor-form" onSubmit={handleSaveArticle} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[12.5px] font-medium text-ink-secondary">
                  Nhóm bài viết
                </label>
                <select
                  value={articleModal.group}
                  onChange={(e) => {
                    const g = e.target.value as "policy" | "about" | "health";
                    setArticleModal({
                      ...articleModal,
                      group: g,
                      categoryLabel:
                        g === "policy"
                          ? "Điều khoản sử dụng"
                          : g === "about"
                            ? "VỀ CHÚNG TÔI"
                            : "TIN SỨC KHỎE",
                    });
                  }}
                  className="mt-1 h-9 w-full pl-3"
                >
                  <option value="policy">Chính sách điều khoản Zalo</option>
                  <option value="about">Giới thiệu công ty</option>
                  <option value="health">Cẩm nang sức khỏe</option>
                </select>
              </div>
              <div>
                <label className="block text-[12.5px] font-medium text-ink-secondary">
                  Tác giả / Bộ phận
                </label>
                <input
                  type="text"
                  value={articleModal.authorLocation}
                  onChange={(e) =>
                    setArticleModal({ ...articleModal, authorLocation: e.target.value })
                  }
                  className="mt-1 h-9 w-full px-3"
                />
              </div>
            </div>

            <div>
              <label className="block text-[12.5px] font-medium text-ink-secondary">
                Tiêu đề *
              </label>
              <input
                type="text"
                required
                value={articleModal.title}
                onChange={(e) =>
                  setArticleModal({ ...articleModal, title: e.target.value })
                }
                className="mt-1 h-9 w-full px-3"
              />
            </div>

            <div>
              <label className="block text-[12.5px] font-medium text-ink-secondary">
                Tóm tắt ngắn
              </label>
              <textarea
                rows={2}
                value={articleModal.summary}
                onChange={(e) =>
                  setArticleModal({ ...articleModal, summary: e.target.value })
                }
                className="mt-1 w-full p-2.5 text-[13px]"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-ink-primary">
                  Nội dung chi tiết (bấm Enter để tách đoạn)
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setArticleModal({
                      ...articleModal,
                      sections: [
                        ...articleModal.sections,
                        {
                          heading: `${articleModal.sections.length + 1}. Mục mới`,
                          paragraphs: [""],
                        },
                      ],
                    })
                  }
                  className="text-[12.5px] font-semibold text-pharma-600 hover:underline"
                >
                  + Thêm mục
                </button>
              </div>

              {articleModal.sections.map((sec, idx) => (
                <div key={idx} className="admin-subtle-panel space-y-2 p-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={sec.heading}
                      onChange={(e) => {
                        const next = [...articleModal.sections];
                        next[idx] = { ...sec, heading: e.target.value };
                        setArticleModal({ ...articleModal, sections: next });
                      }}
                      className="h-8 flex-1 px-2.5 text-[13px] font-medium"
                    />
                    {articleModal.sections.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setArticleModal({
                            ...articleModal,
                            sections: articleModal.sections.filter((_, i) => i !== idx),
                          })
                        }
                        title="Xóa mục này"
                        className="rounded p-1.5 text-ink-muted hover:bg-[#FEECEB] hover:text-[#B42318]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={3}
                    value={sec.paragraphs.join("\n")}
                    onChange={(e) => {
                      const next = [...articleModal.sections];
                      next[idx] = {
                        ...sec,
                        paragraphs: e.target.value.split("\n"),
                      };
                      setArticleModal({ ...articleModal, sections: next });
                    }}
                    className="w-full p-2.5 text-[13px]"
                  />
                </div>
              ))}
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink-primary">
              <input
                type="checkbox"
                checked={articleModal.isPublished}
                onChange={(e) =>
                  setArticleModal({ ...articleModal, isPublished: e.target.checked })
                }
              />
              <span>Xuất bản hiển thị trên Zalo Mini App</span>
            </label>
          </form>
        )}
      </ModalDialog>
    </div>
  );
};
