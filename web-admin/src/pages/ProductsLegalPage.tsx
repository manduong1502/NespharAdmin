import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  FileSpreadsheet,
  FileText,
  Package,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  Upload,
} from "lucide-react";
import {
  apiRequest,
  downloadAdminCsv,
  downloadProductTemplateXlsx,
  importProductsXlsx,
  uploadAdminFile,
} from "../api/client";
import { SlideDrawer } from "../components/OverlayPortal";
import { useAuth } from "../context/AuthContext";
import {
  AdminProduct,
  CustomerTier,
  ProductUnitOption,
  VolumePriceTier,
} from "../types";
import { formatVnd, TIER_META } from "../utils/format";

type FilterTab = "all" | "visible" | "rx" | "hidden" | "low_stock";

interface CategoryOption {
  id: string;
  name: string;
}

const OFFICIAL_TAGS: Array<{ id: string; label: string; short: string; rx?: boolean }> = [
  { id: "nhom-nhi-khoa", label: "Nhóm Nhi khoa", short: "Nhi khoa" },
  { id: "nhom-thuoc-nhap-khau", label: "Nhóm thuốc Nhập Khẩu", short: "Thuốc NK" },
  { id: "nhom-tpbvsk-nhap-khau", label: "Nhóm Thực phẩm BVSK Nhập khẩu", short: "TPBVSK NK" },
  { id: "nhom-thuoc-ke-don", label: "Nhóm thuốc kê đơn (Rx)", short: "Rx Kê đơn", rx: true },
  { id: "nhom-thuoc-khong-ke-don", label: "Nhóm thuốc không kê đơn", short: "Không kê đơn" },
];

const ALL_TIERS: CustomerTier[] = ["retail", "clinic", "pharmacy", "distributor"];
const PAGE_SIZE = 35;

const CatalogThumb: React.FC<{ src?: string; alt: string; sizeClass?: string }> = ({
  src,
  alt,
  sizeClass = "h-11 w-11",
}) => {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [src]);
  return (
    <div
      className={`anim-thumb flex ${sizeClass} shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#F4F6FA] p-1`}
    >
      {src && !broken ? (
        <img
          src={src}
          alt={alt}
          onError={() => setBroken(true)}
          className="h-full w-full object-contain"
        />
      ) : (
        <Package className="h-4 w-4 text-ink-muted" />
      )}
    </div>
  );
};

export const ProductsLegalPage: React.FC = () => {
  const { hasPermission, showToast } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<FilterTab>(() => {
    const t = searchParams.get("tab") as FilterTab | null;
    return t && ["all", "visible", "rx", "hidden", "low_stock"].includes(t) ? t : "all";
  });
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q") || "");
  const [catFilter, setCatFilter] = useState(() => searchParams.get("cat") || "all");
  const [tagFilter, setTagFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [importingXlsx, setImportingXlsx] = useState(false);

  // Slide-over Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const [form, setForm] = useState({
    sku: "",
    name: "",
    categoryId: "cty-biocare",
    tags: ["nhom-thuoc-khong-ke-don"] as string[],
    isPrescription: false,
    promoBadge: "",
    volumeTiers: [] as VolumePriceTier[],
    brand: "NESPHAR Pharma",
    manufacturer: "",
    supplier: "Công ty BioCare",
    origin: "Việt Nam",
    registrationNo: "",
    declarationDocUrl: "",
    declarationDocName: "",
    baseUnit: "Hộp",
    specification: "",
    costPrice: 100000,
    retailPrice: 165000,
    originalPrice: 220000,
    minStockAlert: 20,
    imageUrl: "/uploads/media/prod-liver.jpg",
    isVisible: true,
    isNew: false,
    isBestSeller: false,
    isFlashPromo: false,
    shortSummary: "",
    ingredients: "",
    dosage: "",
    targetUsers: "",
    storageNote: "Bảo quản nơi khô mát dưới 30°C, tránh ánh nắng trực tiếp.",
    disclaimer:
      "Thực phẩm này không phải là thuốc và không có tác dụng thay thế thuốc chữa bệnh.",
    allowedTiers: [...ALL_TIERS] as CustomerTier[],
    unitOptions: [
      { id: "u-base", unitName: "Hộp", specificationLabel: "Hộp tiêu chuẩn", multiplier: 1 },
    ] as ProductUnitOption[],
  });

  const openCreateDrawer = () => {
    setEditingId(null);
    setForm({
      sku: `NSP${String(products.length + 1).padStart(3, "0")}`,
      name: "",
      categoryId: categories[0]?.id || "cty-biocare",
      tags: ["nhom-thuoc-khong-ke-don"],
      isPrescription: false,
      promoBadge: "",
      volumeTiers: [],
      brand: "NESPHAR Pharma",
      manufacturer: "Nhà máy đạt chuẩn GMP-WHO",
      supplier: categories[0]?.name || "Công ty BioCare",
      origin: "Việt Nam",
      registrationNo: "",
      declarationDocUrl: "",
      declarationDocName: "",
      baseUnit: "Hộp",
      specification: "Hộp 30 viên",
      costPrice: 95000,
      retailPrice: 155000,
      originalPrice: 210000,
      minStockAlert: 20,
      imageUrl: "/uploads/media/prod-liver.jpg",
      isVisible: true,
      isNew: true,
      isBestSeller: false,
      isFlashPromo: false,
      shortSummary: "",
      ingredients: "",
      dosage: "",
      targetUsers: "",
      storageNote: "Bảo quản nơi khô mát dưới 30°C, tránh ánh nắng trực tiếp.",
      disclaimer:
        "Thực phẩm này không phải là thuốc và không có tác dụng thay thế thuốc chữa bệnh.",
      allowedTiers: [...ALL_TIERS],
      unitOptions: [
        { id: "u-base", unitName: "Hộp", specificationLabel: "Hộp 30 viên", multiplier: 1 },
      ],
    });
    setDrawerOpen(true);
  };

  useEffect(() => {
    const q = searchParams.get("q");
    const cat = searchParams.get("cat");
    const t = searchParams.get("tab") as FilterTab | null;
    if (q !== null) setSearchQuery(q);
    if (cat !== null) setCatFilter(cat || "all");
    else setCatFilter("all");
    if (t && ["all", "visible", "rx", "hidden", "low_stock"].includes(t)) {
      setTab(t);
    } else if (!t) {
      setTab("all");
    }
    if (searchParams.get("create") === "1") {
      openCreateDrawer();
      const next = new URLSearchParams(searchParams);
      next.delete("create");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams]);

  useEffect(() => {
    setPage(1);
  }, [tab, catFilter, tagFilter, searchQuery]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [prodRes, cmsRes] = await Promise.all([
        apiRequest<{ products: AdminProduct[] }>("/products"),
        apiRequest<{ categories: CategoryOption[] }>("/cms/all"),
      ]);
      setProducts(prodRes.products);
      setCategories(cmsRes.categories);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi tải danh sách sản phẩm", "negative");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const pTags = p.tags || [];
      const isRx = p.isPrescription || pTags.includes("nhom-thuoc-ke-don");
      if (tab === "visible" && !p.isVisible) return false;
      if (tab === "rx" && !isRx) return false;
      if (tab === "hidden" && p.isVisible) return false;
      if (tab === "low_stock" && p.stock.availableStock > p.minStockAlert) return false;
      if (catFilter !== "all" && p.categoryId !== catFilter) return false;
      if (tagFilter !== "all" && !pTags.includes(tagFilter)) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          p.sku.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.registrationNo.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.ingredients.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [products, tab, catFilter, tagFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedProducts = filteredProducts.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const openEditDrawer = (p: AdminProduct) => {
    setEditingId(p.id);
    setForm({
      sku: p.sku,
      name: p.name,
      categoryId: p.categoryId,
      tags: p.tags || [],
      isPrescription: Boolean(p.isPrescription),
      promoBadge: p.promoBadge || "",
      volumeTiers: p.volumeTiers || [],
      brand: p.brand,
      manufacturer: p.manufacturer,
      supplier: p.supplier,
      origin: p.origin,
      registrationNo: p.registrationNo,
      declarationDocUrl: p.declarationDocUrl,
      declarationDocName: p.declarationDocName,
      baseUnit: p.baseUnit,
      specification: p.specification,
      costPrice: p.costPrice,
      retailPrice: p.retailPrice,
      originalPrice: p.originalPrice,
      minStockAlert: p.minStockAlert,
      imageUrl: p.imageUrl,
      isVisible: p.isVisible,
      isNew: p.isNew,
      isBestSeller: p.isBestSeller,
      isFlashPromo: p.isFlashPromo,
      shortSummary: p.shortSummary,
      ingredients: p.ingredients,
      dosage: p.dosage,
      targetUsers: p.targetUsers,
      storageNote: p.storageNote,
      disclaimer: p.disclaimer,
      allowedTiers: p.allowedTiers.length > 0 ? p.allowedTiers : [...ALL_TIERS],
      unitOptions:
        p.unitOptions.length > 0
          ? p.unitOptions
          : [{ id: "u-base", unitName: p.baseUnit, specificationLabel: p.specification, multiplier: 1 }],
    });
    setDrawerOpen(true);
  };

  const toggleProductTag = (tagId: string) => {
    setForm((prev) => {
      const exists = prev.tags.includes(tagId);
      let nextTags = exists ? prev.tags.filter((t) => t !== tagId) : [...prev.tags, tagId];
      if (!exists && tagId === "nhom-thuoc-ke-don") {
        nextTags = nextTags.filter((t) => t !== "nhom-thuoc-khong-ke-don");
      } else if (!exists && tagId === "nhom-thuoc-khong-ke-don") {
        nextTags = nextTags.filter((t) => t !== "nhom-thuoc-ke-don");
      }
      const nextRx = nextTags.includes("nhom-thuoc-ke-don");
      return {
        ...prev,
        tags: nextTags,
        isPrescription: nextRx,
        disclaimer: nextRx
          ? "Thuốc kê đơn (Rx) — Chỉ bán theo đơn Bác sĩ hoặc phân phối sỉ cho cơ sở có giấy phép GPP."
          : prev.disclaimer,
      };
    });
  };

  const handleImportXlsx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportingXlsx(true);
    try {
      const res = await importProductsXlsx(file);
      showToast(
        `Đã nhập ${res.importedProducts} sản phẩm & ${res.importedBatches} lô hàng từ "${file.name}"`
      );
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Nhập tệp Excel thất bại", "negative");
    } finally {
      setImportingXlsx(false);
    }
  };

  const handleToggleVisibility = async (p: AdminProduct) => {
    if (!hasPermission("edit_products")) {
      showToast("Vai trò của bạn không có quyền ẩn/hiện sản phẩm.", "negative");
      return;
    }
    try {
      await apiRequest(`/products/${p.id}/visibility`, {
        method: "PATCH",
        body: JSON.stringify({ isVisible: !p.isVisible }),
      });
      setProducts((prev) =>
        prev.map((item) => (item.id === p.id ? { ...item, isVisible: !p.isVisible } : item))
      );
      showToast(`${!p.isVisible ? "Đã bật bán" : "Đã tạm ẩn"} ${p.sku}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Không thể cập nhật trạng thái", "negative");
    }
  };

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingMedia(true);
    try {
      const res = await uploadAdminFile(file, "media");
      setForm((prev) => ({ ...prev, imageUrl: res.url }));
      showToast(`Đã tải ảnh: ${res.originalName}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Tải ảnh thất bại", "negative");
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleUploadDeclarationDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDoc(true);
    try {
      const res = await uploadAdminFile(file, "docs");
      setForm((prev) => ({
        ...prev,
        declarationDocUrl: res.url,
        declarationDocName: res.originalName,
      }));
      showToast(`Đã tải hồ sơ: ${res.originalName}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Tải tệp hồ sơ thất bại", "negative");
    } finally {
      setUploadingDoc(false);
    }
  };

  const toggleAllowedTier = (tier: CustomerTier) => {
    setForm((prev) => {
      const exists = prev.allowedTiers.includes(tier);
      const next = exists
        ? prev.allowedTiers.filter((t) => t !== tier)
        : [...prev.allowedTiers, tier];
      return { ...prev, allowedTiers: next.length > 0 ? next : ["retail"] };
    });
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await apiRequest(`/products/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(form),
        });
        showToast(`Đã cập nhật sản phẩm ${form.sku}`);
      } else {
        await apiRequest("/products", {
          method: "POST",
          body: JSON.stringify(form),
        });
        showToast(`Đã thêm mới sản phẩm ${form.sku}`);
      }
      setDrawerOpen(false);
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lưu sản phẩm thất bại", "negative");
    } finally {
      setSaving(false);
    }
  };

  const canChangePrice = hasPermission("change_price");
  const canEdit = hasPermission("edit_products");
  const rxCount = useMemo(
    () =>
      products.filter(
        (p) => p.isPrescription || (p.tags || []).includes("nhom-thuoc-ke-don")
      ).length,
    [products]
  );

  const visibleCount = products.filter((p) => p.isVisible).length;
  const lowStockCount = products.filter((p) => p.stock.availableStock <= p.minStockAlert).length;
  const hiddenCount = products.length - visibleCount;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-[22px] font-bold tracking-tight text-ink-primary">Sản phẩm</h1>
          <span className="rounded-full bg-[#EEF0FD] px-2.5 py-0.5 text-[12px] font-semibold text-pharma-600 tabular-nums">
            {products.length} mặt hàng
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              downloadProductTemplateXlsx().catch((err) =>
                showToast(err instanceof Error ? err.message : "Lỗi tải mẫu Excel", "negative")
              )
            }
            className="btn-press inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#DCE2F0] bg-white px-3 text-[13px] font-medium text-ink-secondary hover:bg-[#F5F7FC]"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-pharma-600" />
            <span>Mẫu Excel</span>
          </button>

          {canEdit && (
            <label className="btn-press inline-flex h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xl border border-pharma-600/25 bg-[#EEF0FD] px-3 text-[13px] font-semibold text-pharma-700 transition-colors hover:bg-[#E2E6FC]">
              <Upload className="h-3.5 w-3.5" />
              <span>{importingXlsx ? "Đang nhập..." : "Nhập Excel"}</span>
              <input
                type="file"
                accept=".xlsx"
                disabled={importingXlsx}
                onChange={handleImportXlsx}
                className="hidden"
              />
            </label>
          )}

          {hasPermission("export_data") && (
            <button
              type="button"
              onClick={() => downloadAdminCsv("products")}
              className="btn-press inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#DCE2F0] bg-white px-3 text-[13px] font-medium text-ink-secondary hover:bg-[#F5F7FC]"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Xuất CSV</span>
            </button>
          )}

          {canEdit && (
            <button
              type="button"
              onClick={openCreateDrawer}
              className="btn-press inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl bg-gradient-to-r from-[#3E4095] to-[#2F317B] px-4 text-[13px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(62,64,149,0.55)] hover:from-[#343683] hover:to-[#252766]"
            >
              <Plus className="h-4 w-4" />
              <span>Thêm sản phẩm</span>
            </button>
          )}
        </div>
      </div>

      {/* Interactive Metric Ribbon */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => setTab("all")}
          className={`admin-card anim-kpi-interactive flex items-center justify-between p-4 text-left ${
            tab === "all" ? "border-pharma-600 ring-1 ring-pharma-600/20" : ""
          }`}
        >
          <div>
            <div className="text-[12px] font-medium text-ink-muted">Tổng danh mục</div>
            <div className="mt-1 text-[22px] font-bold text-ink-primary tabular-nums">
              {products.length}
            </div>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EEF0FD] text-pharma-600">
            <Package className="h-[18px] w-[18px]" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab("visible")}
          className={`admin-card anim-kpi-interactive flex items-center justify-between p-4 text-left ${
            tab === "visible" ? "border-[#136C3E] ring-1 ring-[#136C3E]/20" : ""
          }`}
        >
          <div>
            <div className="text-[12px] font-medium text-ink-muted">Đang bán trên App</div>
            <div className="mt-1 text-[22px] font-bold text-[#136C3E] tabular-nums">
              {visibleCount}
            </div>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E8F8EE] text-[#136C3E]">
            <CheckCircle2 className="h-[18px] w-[18px]" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab("rx")}
          className={`admin-card anim-kpi-interactive flex items-center justify-between p-4 text-left ${
            tab === "rx" ? "border-[#DC2626] ring-1 ring-[#DC2626]/20" : ""
          }`}
        >
          <div>
            <div className="text-[12px] font-medium text-ink-muted">Thuốc kê đơn (Rx)</div>
            <div className="mt-1 text-[22px] font-bold text-[#B42318] tabular-nums">
              {rxCount}
            </div>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFECEB] text-[#B42318]">
            <ShieldAlert className="h-[18px] w-[18px]" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab("low_stock")}
          className={`admin-card anim-kpi-interactive flex items-center justify-between p-4 text-left ${
            tab === "low_stock" ? "border-[#D97706] ring-1 ring-[#D97706]/25" : ""
          }`}
        >
          <div>
            <div className="text-[12px] font-medium text-ink-muted">Sắp hết tồn</div>
            <div className="mt-1 text-[22px] font-bold text-[#B45309] tabular-nums">
              {lowStockCount}
            </div>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF6E5] text-[#B45309]">
            <AlertTriangle className="h-[18px] w-[18px]" />
          </span>
        </button>
      </div>

      {/* Main White Card */}
      <div className="admin-card space-y-4 p-5">
        <div className="overflow-x-auto">
          <div className="admin-tabs">
            {[
              { id: "all" as FilterTab, label: `Tất cả (${products.length})` },
              { id: "visible" as FilterTab, label: `Đang bán (${visibleCount})` },
              { id: "rx" as FilterTab, label: `Thuốc kê đơn (${rxCount})` },
              { id: "low_stock" as FilterTab, label: `Sắp hết (${lowStockCount})` },
              { id: "hidden" as FilterTab, label: `Tạm ẩn (${hiddenCount})` },
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

        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative w-full sm:w-[270px]">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm tên sản phẩm, mã SKU..."
                className="h-9 w-full pl-9 pr-3 text-[13.5px]"
              />
            </div>

            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className="h-9 pl-3 text-[13.5px]"
            >
              <option value="all">Tất cả công ty ({categories.length})</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="h-9 pl-3 text-[13.5px]"
            >
              <option value="all">Tất cả nhóm</option>
              {OFFICIAL_TAGS.map((tg) => (
                <option key={tg.id} value={tg.id}>
                  {tg.label}
                </option>
              ))}
            </select>
          </div>

          <div className="text-[13px] text-ink-muted tabular-nums">
            {filteredProducts.length} kết quả · Trang {currentPage}/{totalPages}
          </div>
        </div>

        {/* Clean Product Table */}
        <div className="table-shell">
          {loading ? (
            <div className="py-12 text-center text-[13.5px] text-ink-muted">
              Đang tải danh sách sản phẩm...
            </div>
          ) : pagedProducts.length === 0 ? (
            <div className="py-12 text-center text-[13.5px] text-ink-muted">
              Không có sản phẩm phù hợp.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th className="w-12">STT</th>
                  <th className="w-16">Ảnh</th>
                  <th>Tên sản phẩm</th>
                  <th>Công ty</th>
                  <th className="text-right">Giá lẻ</th>
                  <th>Trạng thái</th>
                  <th className="text-right">Đã bán</th>
                  <th className="text-right">Tồn kho</th>
                  <th className="text-right">Sửa</th>
                </tr>
              </thead>
              <tbody className="anim-rows">
                {pagedProducts.map((p, idx) => {
                  const rowNo = (currentPage - 1) * PAGE_SIZE + idx + 1;
                  const outOfStock = p.stock.availableStock <= 0;
                  const isLow = !outOfStock && p.stock.availableStock <= p.minStockAlert;
                  const pTags = p.tags || [];
                  const isRx = p.isPrescription || pTags.includes("nhom-thuoc-ke-don");
                  return (
                    <tr key={p.id}>
                      <td className="text-[13px] text-ink-muted tabular-nums">{rowNo}</td>
                      <td>
                        <CatalogThumb src={p.imageUrl} alt={p.name} />
                      </td>

                      <td>
                        <div className="min-w-[230px] max-w-[340px]">
                          <div className="line-clamp-1 font-semibold text-ink-primary">
                            {p.name}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-muted tabular-nums">
                            <span>{p.sku}</span>
                            {p.specification && <span>· {p.specification}</span>}
                            {isRx && (
                              <span
                                className="whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] font-semibold"
                                style={{ backgroundColor: "#FFECEB", color: "#B42318" }}
                              >
                                Kê đơn
                              </span>
                            )}
                            {p.declarationDocUrl && (
                              <a
                                href={p.declarationDocUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-0.5 text-[11px] font-medium text-pharma-600 hover:underline"
                              >
                                <FileText className="h-3 w-3" />
                                <span>PDF</span>
                              </a>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="whitespace-nowrap text-[13px] text-ink-secondary">
                        {(p.categoryName || p.supplier || "—").replace(/^Công ty\s+/i, "")}
                      </td>

                      <td className="whitespace-nowrap text-right font-semibold text-ink-primary tabular-nums">
                        {formatVnd(p.retailPrice)}
                        {p.volumeTiers && p.volumeTiers.length > 1 && (
                          <div className="text-[11px] font-normal text-pharma-600">
                            {p.volumeTiers.length} bậc sỉ
                          </div>
                        )}
                      </td>

                      <td>
                        <button
                          type="button"
                          onClick={() => handleToggleVisibility(p)}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors"
                          style={
                            !p.isVisible
                              ? { backgroundColor: "#F1F3F8", color: "#4A536D" }
                              : outOfStock
                                ? { backgroundColor: "#FFECEB", color: "#B42318" }
                                : isLow
                                  ? { backgroundColor: "#FFF6E5", color: "#9A5B00" }
                                  : { backgroundColor: "#E8F8EE", color: "#136C3E" }
                          }
                        >
                          {!p.isVisible
                            ? "Đang ẩn"
                            : outOfStock
                              ? "Hết hàng"
                              : isLow
                                ? "Sắp hết"
                                : "Đang bán"}
                        </button>
                      </td>

                      <td className="whitespace-nowrap text-right text-[13.5px] text-ink-secondary tabular-nums">
                        {p.soldCount.toLocaleString("vi-VN")}
                      </td>

                      <td className="whitespace-nowrap text-right text-[13.5px] font-medium text-ink-primary tabular-nums">
                        {p.stock.availableStock.toLocaleString("vi-VN")}
                      </td>

                      <td className="whitespace-nowrap text-right">
                        <button
                          type="button"
                          onClick={() => openEditDrawer(p)}
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-pharma-600 transition-colors hover:bg-[#EEF0FD]"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          <span>Sửa</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-[#F1F3F9] pt-3">
            <span className="text-[12.5px] text-ink-muted tabular-nums">
              {(currentPage - 1) * PAGE_SIZE + 1}–
              {Math.min(currentPage * PAGE_SIZE, filteredProducts.length)} /{" "}
              {filteredProducts.length}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-borderline bg-white px-2.5 text-[12.5px] font-medium text-ink-secondary disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Trước</span>
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-borderline bg-white px-2.5 text-[12.5px] font-medium text-ink-secondary disabled:opacity-40"
              >
                <span>Sau</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* PORTALED SLIDE-OVER PRODUCT EDITOR */}
      <SlideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        widthClass="max-w-2xl"
        title={editingId ? `Sửa sản phẩm · ${form.sku}` : "Thêm sản phẩm mới"}
        subtitle={
          editingId
            ? categories.find((c) => c.id === form.categoryId)?.name || form.supplier
            : "Điền thông tin sản phẩm để hiển thị trên Zalo Mini App"
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="h-9 rounded-xl border border-borderline bg-white px-4 text-[13px] font-medium text-ink-secondary hover:bg-frame"
            >
              Hủy
            </button>
            {canEdit && (
              <button
                type="submit"
                form="product-editor-form"
                disabled={saving}
                className="btn-press h-9 rounded-xl bg-pharma-600 px-5 text-[13px] font-semibold text-white hover:bg-pharma-700 disabled:opacity-60"
              >
                {saving ? "Đang lưu..." : "Lưu sản phẩm"}
              </button>
            )}
          </>
        }
      >
        <form id="product-editor-form" onSubmit={handleSaveProduct} className="space-y-5">
          {/* Basic Identity */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-[13px] font-medium text-ink-secondary">
                Mã SKU *
              </label>
              <input
                type="text"
                required
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                className="mt-1 h-9 w-full px-3"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[13px] font-medium text-ink-secondary">
                Công ty phân phối *
              </label>
              <select
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                className="mt-1 h-9 w-full pl-3"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-medium text-ink-secondary">
              Tên sản phẩm *
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 h-9 w-full px-3"
              placeholder="VD: 5-MTHF Pregnancy & Breastfeeding Care"
            />
          </div>

          {/* 5 Multi-Tags Selector */}
          <div className="admin-subtle-panel space-y-2.5 p-4">
            <div className="text-[13px] font-semibold text-ink-primary">
              Nhóm phân loại (chọn 1 hoặc nhiều thẻ)
            </div>
            <div className="flex flex-wrap gap-2">
              {OFFICIAL_TAGS.map((tg) => {
                const active = form.tags.includes(tg.id);
                return (
                  <button
                    key={tg.id}
                    type="button"
                    onClick={() => toggleProductTag(tg.id)}
                    className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                      active
                        ? tg.rx
                          ? "border-[#DC2626] bg-[#FFEDEA] text-[#991B1B]"
                          : "border-pharma-600 bg-[#EEF0FD] text-pharma-700"
                        : "border-borderline bg-white text-ink-muted"
                    }`}
                  >
                    {tg.label}
                  </button>
                );
              })}
            </div>
            {form.isPrescription && (
              <p className="text-[12px] text-[#991B1B]">
                <strong>Thuốc kê đơn (Rx):</strong> Khách lẻ xem thông tin & nhắn tư vấn; Nhà thuốc/Phòng khám đặt sỉ trực tiếp.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-[13px] font-medium text-ink-secondary">
                Thương hiệu
              </label>
              <input
                type="text"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className="mt-1 h-9 w-full px-3"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-ink-secondary">
                Xuất xứ
              </label>
              <input
                type="text"
                value={form.origin}
                onChange={(e) => setForm({ ...form, origin: e.target.value })}
                className="mt-1 h-9 w-full px-3"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-ink-secondary">
                Nhãn CTKM
              </label>
              <input
                type="text"
                value={form.promoBadge}
                onChange={(e) => setForm({ ...form, promoBadge: e.target.value })}
                placeholder="VD: Mua 6 tặng 2"
                className="mt-1 h-9 w-full px-3"
              />
            </div>
          </div>

          {/* Legal & BYT Declaration Section */}
          <div className="admin-subtle-panel space-y-3 p-4">
            <div className="text-[13px] font-semibold text-ink-primary">
              Hồ sơ pháp lý & Số đăng ký
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-[12.5px] font-medium text-ink-secondary">
                  Số ĐK lưu hành / Công bố *
                </label>
                <input
                  type="text"
                  required
                  value={form.registrationNo}
                  onChange={(e) => setForm({ ...form, registrationNo: e.target.value })}
                  placeholder="VD: 2401/2025/ĐKSP"
                  className="mt-1 h-9 w-full px-3"
                />
              </div>
              <div>
                <label className="block text-[12.5px] font-medium text-ink-secondary">
                  Tệp PDF công bố
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-borderline bg-white px-3 text-[12.5px] font-medium text-ink-secondary hover:bg-[#EEF0FD]">
                    <Upload className="h-3.5 w-3.5" />
                    <span>{uploadingDoc ? "Đang tải..." : "Tải PDF"}</span>
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      onChange={handleUploadDeclarationDoc}
                      className="hidden"
                    />
                  </label>
                  {form.declarationDocUrl && (
                    <a
                      href={form.declarationDocUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-[12px] font-medium text-pharma-600 hover:underline"
                    >
                      {form.declarationDocName || "Xem hồ sơ"}
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[12.5px] font-medium text-ink-secondary">
                Khuyến cáo hiển thị trên App
              </label>
              <input
                type="text"
                value={form.disclaimer}
                onChange={(e) => setForm({ ...form, disclaimer: e.target.value })}
                className="mt-1 h-9 w-full px-3"
              />
            </div>
          </div>

          {/* Pricing & Packaging */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <label className="block text-[13px] font-medium text-ink-secondary">
                Đơn vị tính
              </label>
              <input
                type="text"
                value={form.baseUnit}
                onChange={(e) => setForm({ ...form, baseUnit: e.target.value })}
                className="mt-1 h-9 w-full px-3"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-ink-secondary">
                Giá vốn (đ)
              </label>
              <input
                type="number"
                disabled={!canChangePrice}
                value={form.costPrice}
                onChange={(e) => setForm({ ...form, costPrice: Number(e.target.value) })}
                className="mt-1 h-9 w-full px-3 tabular-nums disabled:bg-[#F3F5FB]"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-ink-secondary">
                Giá bán lẻ (đ)
              </label>
              <input
                type="number"
                disabled={!canChangePrice}
                value={form.retailPrice}
                onChange={(e) => setForm({ ...form, retailPrice: Number(e.target.value) })}
                className="mt-1 h-9 w-full px-3 tabular-nums disabled:bg-[#F3F5FB]"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-ink-secondary">
                Giá gạch (đ)
              </label>
              <input
                type="number"
                disabled={!canChangePrice}
                value={form.originalPrice}
                onChange={(e) => setForm({ ...form, originalPrice: Number(e.target.value) })}
                className="mt-1 h-9 w-full px-3 tabular-nums disabled:bg-[#F3F5FB]"
              />
            </div>
          </div>

          {/* Volume Tier Pricing Editor */}
          <div className="admin-card space-y-2.5 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-ink-primary">
                Giá sỉ theo số lượng
              </span>
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    volumeTiers: [
                      ...form.volumeTiers,
                      {
                        minQty: form.volumeTiers.length === 0 ? 1 : 6,
                        maxQty: form.volumeTiers.length === 0 ? 5 : null,
                        unitPrice: form.retailPrice,
                        label:
                          form.volumeTiers.length === 0
                            ? `1 – 5 ${form.baseUnit.toLowerCase()}`
                            : `Từ 6 ${form.baseUnit.toLowerCase()}`,
                      },
                    ],
                  })
                }
                className="whitespace-nowrap text-[12.5px] font-semibold text-pharma-600 hover:underline"
              >
                + Thêm bậc giá
              </button>
            </div>

            {form.volumeTiers.length > 0 && (
              <div className="grid grid-cols-12 gap-2 px-1 text-[11px] font-medium text-ink-muted">
                <span className="col-span-4">Nhãn hiển thị</span>
                <span className="col-span-2">Từ SL</span>
                <span className="col-span-2">Đến SL</span>
                <span className="col-span-3">Đơn giá (đ)</span>
                <span className="col-span-1" />
              </div>
            )}

            {form.volumeTiers.map((vt, idx) => (
              <div key={idx} className="grid grid-cols-12 items-center gap-2">
                <input
                  type="text"
                  value={vt.label}
                  onChange={(e) => {
                    const next = [...form.volumeTiers];
                    next[idx] = { ...vt, label: e.target.value };
                    setForm({ ...form, volumeTiers: next });
                  }}
                  placeholder="VD: 6 – 20 hộp"
                  className="col-span-4 h-8 px-2 text-[12.5px]"
                />
                <input
                  type="number"
                  value={vt.minQty}
                  onChange={(e) => {
                    const next = [...form.volumeTiers];
                    next[idx] = { ...vt, minQty: Number(e.target.value) };
                    setForm({ ...form, volumeTiers: next });
                  }}
                  placeholder="Từ"
                  className="col-span-2 h-8 px-2 text-[12.5px] tabular-nums"
                />
                <input
                  type="number"
                  value={vt.maxQty ?? ""}
                  onChange={(e) => {
                    const next = [...form.volumeTiers];
                    next[idx] = {
                      ...vt,
                      maxQty: e.target.value ? Number(e.target.value) : null,
                    };
                    setForm({ ...form, volumeTiers: next });
                  }}
                  placeholder="Trống = +"
                  className="col-span-2 h-8 px-2 text-[12.5px] tabular-nums"
                />
                <input
                  type="number"
                  value={vt.unitPrice}
                  onChange={(e) => {
                    const next = [...form.volumeTiers];
                    next[idx] = { ...vt, unitPrice: Number(e.target.value) };
                    setForm({ ...form, volumeTiers: next });
                  }}
                  placeholder="Đơn giá"
                  className="col-span-3 h-8 px-2 text-[12.5px] tabular-nums"
                />
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      volumeTiers: form.volumeTiers.filter((_, i) => i !== idx),
                    })
                  }
                  className="col-span-1 flex justify-center text-ink-muted hover:text-[#B42318]"
                  aria-label="Xóa bậc giá"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[13px] font-medium text-ink-secondary">
                Quy cách đóng gói
              </label>
              <input
                type="text"
                value={form.specification}
                onChange={(e) => setForm({ ...form, specification: e.target.value })}
                className="mt-1 h-9 w-full px-3"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-ink-secondary">
                Ảnh đại diện
              </label>
              <div className="mt-1 flex items-center gap-3">
                <CatalogThumb src={form.imageUrl} alt="Xem trước" sizeClass="h-9 w-9" />
                <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-borderline bg-white px-3 text-[12.5px] font-medium text-ink-secondary hover:bg-[#EEF0FD]">
                  <Upload className="h-3.5 w-3.5" />
                  <span>{uploadingMedia ? "Đang tải..." : "Đổi ảnh"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleUploadImage}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Multi-Unit Conversion Options */}
          <div className="admin-card space-y-2.5 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-ink-primary">
                Đơn vị quy đổi (Hộp / Thùng)
              </span>
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    unitOptions: [
                      ...form.unitOptions,
                      {
                        id: `u-${Date.now()}`,
                        unitName: "Thùng",
                        specificationLabel: "Thùng 24 hộp",
                        multiplier: 24,
                        extraSavePercent: 6,
                      },
                    ],
                  })
                }
                className="whitespace-nowrap text-[12.5px] font-semibold text-pharma-600 hover:underline"
              >
                + Thêm quy đổi
              </button>
            </div>

            <div className="grid grid-cols-12 gap-2 px-1 text-[11px] font-medium text-ink-muted">
              <span className="col-span-3">Đơn vị</span>
              <span className="col-span-4">Quy cách</span>
              <span className="col-span-2">Hệ số</span>
              <span className="col-span-2">Giảm %</span>
              <span className="col-span-1" />
            </div>

            {form.unitOptions.map((opt, idx) => (
              <div key={opt.id} className="grid grid-cols-12 items-center gap-2">
                <input
                  type="text"
                  value={opt.unitName}
                  onChange={(e) => {
                    const next = [...form.unitOptions];
                    next[idx] = { ...opt, unitName: e.target.value };
                    setForm({ ...form, unitOptions: next });
                  }}
                  placeholder="Hộp"
                  className="col-span-3 h-8 px-2 text-[12.5px]"
                />
                <input
                  type="text"
                  value={opt.specificationLabel}
                  onChange={(e) => {
                    const next = [...form.unitOptions];
                    next[idx] = { ...opt, specificationLabel: e.target.value };
                    setForm({ ...form, unitOptions: next });
                  }}
                  placeholder="Hộp 30 viên"
                  className="col-span-4 h-8 px-2 text-[12.5px]"
                />
                <input
                  type="number"
                  step="0.01"
                  value={opt.multiplier}
                  onChange={(e) => {
                    const next = [...form.unitOptions];
                    next[idx] = { ...opt, multiplier: Number(e.target.value) };
                    setForm({ ...form, unitOptions: next });
                  }}
                  className="col-span-2 h-8 px-2 text-[12.5px] tabular-nums"
                />
                <input
                  type="number"
                  value={opt.extraSavePercent || 0}
                  onChange={(e) => {
                    const next = [...form.unitOptions];
                    next[idx] = {
                      ...opt,
                      extraSavePercent: Number(e.target.value) || undefined,
                    };
                    setForm({ ...form, unitOptions: next });
                  }}
                  className="col-span-2 h-8 px-2 text-[12.5px] tabular-nums"
                />
                {form.unitOptions.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        unitOptions: form.unitOptions.filter((_, i) => i !== idx),
                      })
                    }
                    className="col-span-1 flex justify-center text-ink-muted hover:text-[#B42318]"
                    aria-label="Xóa quy đổi"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Customer Tier Visibility */}
          <div>
            <div className="text-[13px] font-medium text-ink-secondary">
              Khách hàng được xem
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {ALL_TIERS.map((t) => {
                const checked = form.allowedTiers.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleAllowedTier(t)}
                    className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                      checked
                        ? "border-pharma-600 bg-[#EEF0FD] text-pharma-700"
                        : "border-borderline bg-white text-ink-muted"
                    }`}
                  >
                    {TIER_META[t].label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Clinical Details */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[13px] font-medium text-ink-secondary">
                Thành phần chính
              </label>
              <textarea
                rows={2}
                value={form.ingredients}
                onChange={(e) => setForm({ ...form, ingredients: e.target.value })}
                className="mt-1 w-full p-2.5 text-[13px]"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-ink-secondary">
                Liều dùng & Cách dùng
              </label>
              <textarea
                rows={2}
                value={form.dosage}
                onChange={(e) => setForm({ ...form, dosage: e.target.value })}
                className="mt-1 w-full p-2.5 text-[13px]"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-5 pt-1">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink-primary">
              <input
                type="checkbox"
                checked={form.isVisible}
                onChange={(e) => setForm({ ...form, isVisible: e.target.checked })}
              />
              <span>Hiển thị trên App</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-secondary">
              <input
                type="checkbox"
                checked={form.isBestSeller}
                onChange={(e) => setForm({ ...form, isBestSeller: e.target.checked })}
              />
              <span>Bán chạy</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-secondary">
              <input
                type="checkbox"
                checked={form.isFlashPromo}
                onChange={(e) => setForm({ ...form, isFlashPromo: e.target.checked })}
              />
              <span>Ưu đãi nổi bật</span>
            </label>
          </div>
        </form>
      </SlideDrawer>
    </div>
  );
};
