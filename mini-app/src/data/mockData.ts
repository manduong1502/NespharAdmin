import {
  Address,
  ArticleItem,
  Category,
  HeroBanner,
  NotificationItem,
  Order,
  Product,
  ProductTagInfo,
  Voucher,
} from "@/types";
import realCatalog from "./realCatalogData.json";
import { resolveCatalogImage, VISUALS } from "./productVisuals";

export const NESPHAR_INFO = {
  companyName: "CÔNG TY TNHH DƯỢC PHẨM NESPHAR",
  shortName: "Dược Phẩm NESPHAR",
  taxCode: "3002297464",
  representative: "Bà Nguyễn Thị Hương",
  address: "Số 90 Đường Hà Hoàng, Tổ dân phố Đoài Thịnh, P. Trần Phú, tỉnh Hà Tĩnh",
  hotline: "0926090668",
  hotlineDisplay: "0926.090.668",
  secondaryHotline: "0978.420.766",
  email: "Duocphamnesphar@gmail.com",
  zaloOaId: "4490716441165809191",
  workingHours: "07:30 – 21:30 (Tất cả các ngày trong tuần)",
  appVersion: "2.0.0-nesphar-b2b",
};

export const CATEGORIES: Category[] = (realCatalog.categories || []).map((c) => ({
  id: c.id,
  name: c.name,
  shortName: c.shortName,
  iconKey: c.iconKey as Category["iconKey"],
  description: c.description,
}));

export const PRODUCT_TAGS: ProductTagInfo[] = (realCatalog.productTags || []).map((t) => ({
  id: t.id,
  name: t.name,
  shortName: t.shortName,
  iconKey: t.iconKey as ProductTagInfo["iconKey"],
  description: t.description,
}));

export const HERO_BANNERS: HeroBanner[] = [
  {
    id: "banner-1",
    badge: "BIOCARE NHẬP KHẨU MỸ · Ý",
    title: "TPBVSK Nhập khẩu — Giá sỉ bậc thang",
    points: [
      "33 mã BioCare nhập khẩu Mỹ, Ý, Thổ Nhĩ Kỳ",
      "Giá sỉ tự động: 1–5 · 6–20 · 21+ hộp",
      "Đầy đủ công bố BYT & tư vấn Dược sĩ",
    ],
    image: VISUALS.hero1,
    ctaLink: "/categories?cat=cty-biocare",
  },
  {
    id: "banner-2",
    badge: "CTKM DAPHARCO THÁNG 10",
    title: "Ưu đãi Mua X Tặng Y cho Nhà thuốc & Gia đình",
    points: [
      "143 mã Vật tư y tế, Sát khuẩn, Tinh dầu & TPBVSK Dapharco",
      "Khuyến mãi Mua 6 tặng 2, Mua 10 tặng 4 áp dụng toàn tỉnh",
      "Kiểm soát chặt chẽ Số lô & Hạn dùng chuẩn GSP/FEFO",
    ],
    image: VISUALS.hero2,
    ctaLink: "/categories?cat=cty-dapharco",
  },
  {
    id: "banner-3",
    badge: "DƯỢC PHẨM AN THIÊN GMP-WHO",
    title: "191 danh mục Thuốc & Nhi khoa phân loại chuẩn BYT",
    points: [
      "Phân tách minh bạch thẻ Thuốc kê đơn (Rx), OTC & Nhi khoa",
      "Freeship đơn sỉ Nhà thuốc/Quầy thuốc từ 1.200.000đ",
      "Hotline Dược sĩ phụ trách: 0926.090.668",
    ],
    image: VISUALS.bpMonitor,
    ctaLink: "/categories?cat=cty-an-thien",
  },
];

export const PRODUCTS: Product[] = (realCatalog.products || []).map((p) => {
  const batches = Array.isArray(p.batches) ? p.batches : [];
  const totalQty = batches.reduce((sum, b) => sum + Number(b.qty || 0), 0);
  const sortedExps = batches
    .map((b) => b.expDate)
    .filter(Boolean)
    .sort();
  const primaryImg = resolveCatalogImage(p.imageFile || "", p.categoryId);

  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    categoryId: p.categoryId,
    tags: p.tags || [],
    isPrescription: Boolean(p.isPrescription),
    promoBadge: p.promoBadge || "",
    volumeTiers: (p.volumeTiers || []).map((vt) => ({
      minQty: vt.minQty,
      maxQty: vt.maxQty,
      unitPrice: vt.unitPrice,
      label: vt.label,
    })),
    brand: p.brand,
    origin: p.origin,
    registrationNo: p.registrationNo,
    baseUnit: p.baseUnit,
    specification: p.specification,
    retailPrice: p.retailPrice,
    originalPrice: p.originalPrice,
    inStock: totalQty > 0,
    stockCount: totalQty > 0 ? totalQty : 50,
    nearestExpDate: sortedExps[0] || "2029-02-14",
    soldCount: p.soldCount,
    isNew: Boolean(p.isNew),
    isBestSeller: Boolean(p.isBestSeller),
    isFlashPromo: Boolean(p.isFlashPromo),
    hasVideoPreview: false,
    images: [primaryImg],
    shortSummary: p.shortSummary,
    ingredients: p.ingredients,
    benefits: p.benefits || [],
    dosage: p.dosage,
    targetUsers: p.targetUsers,
    storageNote: p.storageNote,
    disclaimer: p.disclaimer,
    unitOptions: (p.unitOptions || []).map((u) => ({
      id: u.id,
      unitName: u.unitName,
      specificationLabel: u.specificationLabel,
      multiplier: u.multiplier,
      extraSavePercent: (u as { extraSavePercent?: number }).extraSavePercent,
    })),
  };
});

export const VOUCHERS: Voucher[] = [
  {
    id: "v-nesphar30",
    code: "NESPHAR30",
    title: "Giảm 30.000đ đơn từ 299.000đ",
    description: "Áp dụng cho tất cả Thực phẩm bảo vệ sức khỏe & Vật tư y tế trên Mini App.",
    discountType: "fixed",
    discountValue: 30000,
    minOrderValue: 299000,
    expiryDate: "31/12/2027",
  },
  {
    id: "v-chao20",
    code: "BANMOI20",
    title: "Giảm 20.000đ Chào bạn mới Zalo",
    description: "Ưu đãi dành cho đơn hàng đầu tiên từ 150.000đ trên NESPHAR Mini App.",
    discountType: "fixed",
    discountValue: 20000,
    minOrderValue: 150000,
    expiryDate: "31/12/2027",
  },
  {
    id: "v-giaohang",
    code: "FREESHIPHT",
    title: "Hỗ trợ 25.000đ phí giao hàng",
    description: "Miễn/giảm phí vận chuyển cho đơn từ 250.000đ tại Hà Tĩnh & toàn quốc.",
    discountType: "fixed",
    discountValue: 25000,
    minOrderValue: 250000,
    expiryDate: "31/12/2027",
  },
  {
    id: "v-b2b5",
    code: "DOITAC5",
    title: "Chiết khấu thêm 5% (Tối đa 150.000đ)",
    description: "Ưu đãi cộng thêm cho đơn hàng từ 1.000.000đ (Khách lẻ & Đối tác Nhà thuốc).",
    discountType: "percent",
    discountValue: 5,
    maxDiscount: 150000,
    minOrderValue: 1000000,
    expiryDate: "31/12/2027",
  },
];

export const INITIAL_ADDRESSES: Address[] = [
  {
    id: "addr-1",
    recipientName: "Mẫn Nguyễn",
    phone: "0903536849",
    street: "Số 18 Đường Nguyễn Công Trứ",
    ward: "Phường Bắc Hà",
    district: "TP. Hà Tĩnh",
    province: "Tỉnh Hà Tĩnh",
    isDefault: true,
    tag: "Nhà riêng",
  },
  {
    id: "addr-2",
    recipientName: "Quầy Thuốc Minh Tâm (Anh Mẫn)",
    phone: "0903536849",
    street: "Số 45 Đường Trần Phú",
    ward: "Phường Trần Phú",
    district: "TP. Hà Tĩnh",
    province: "Tỉnh Hà Tĩnh",
    isDefault: false,
    tag: "Nhà thuốc / Cơ sở",
  },
];

export const INITIAL_ORDERS: Order[] = [
  {
    id: "ord-1",
    code: "00001462087",
    createdAt: "16/11/2026, 08:20",
    status: "shipping",
    subtotal: 721000,
    discountAmount: 30000,
    shippingFee: 0,
    totalAmount: 691000,
    voucherCode: "NESPHAR30",
    paymentMethod: "cod",
    paymentStatus: "unpaid",
    shippingCarrier: "NESPHAR Express Nội Tỉnh",
    trackingCode: "NSP-HT-88412",
    address: INITIAL_ADDRESSES[0],
    customerTierAtPurchase: "retail",
    items: [
      {
        productId: PRODUCTS[0]?.id || "bio-001",
        sku: PRODUCTS[0]?.sku || "BC001",
        name: PRODUCTS[0]?.name || "5-MTHF Pregnancy & Breastfeeding Care",
        image: PRODUCTS[0]?.images[0] || VISUALS.omega,
        unitName: PRODUCTS[0]?.baseUnit || "Lọ",
        specificationLabel: PRODUCTS[0]?.specification || "Lọ 60 viên",
        unitPrice: PRODUCTS[0]?.retailPrice || 492000,
        quantity: 1,
      },
      {
        productId: PRODUCTS[4]?.id || "bio-005",
        sku: PRODUCTS[4]?.sku || "BC005",
        name: PRODUCTS[4]?.name || "Dr.life Multivitas Syrup",
        image: PRODUCTS[4]?.images[0] || VISUALS.kidsSyrup,
        unitName: PRODUCTS[4]?.baseUnit || "Chai",
        specificationLabel: PRODUCTS[4]?.specification || "Chai 120ml",
        unitPrice: PRODUCTS[4]?.retailPrice || 229000,
        quantity: 1,
      },
    ],
  },
];

export const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "noti-1",
    type: "promo",
    title: "Cập nhật 367 sản phẩm BioCare, An Thiên & CTKM Dapharco",
    body: "Tra cứu nhanh theo 9 Công ty đối tác & 5 Thẻ nhóm (Nhi khoa, Nhập khẩu, Kê đơn Rx, OTC) ngay trên NESPHAR Mini App.",
    createdAt: "Hôm nay, 08:30",
    read: false,
    targetLink: "/categories",
  },
  {
    id: "noti-2",
    type: "promo",
    title: "Tặng mã NESPHAR30 giảm ngay 30.000đ",
    body: "Áp dụng cho mọi đơn hàng từ 299.000đ đặt trực tuyến trên ứng dụng.",
    createdAt: "Hôm qua, 19:15",
    read: false,
    targetLink: "/vouchers",
  },
];

export const ARTICLES: ArticleItem[] = [
  {
    slug: "dieu-khoan-chinh-sach",
    group: "policy",
    categoryLabel: "Điều khoản sử dụng",
    title: "Điều khoản chính sách sử dụng",
    updatedAt: "16/11/2026",
    authorLocation: "Dược Phẩm NESPHAR",
    summary:
      "Quy định chung về tra cứu danh mục 9 hãng dược đối tác, phân loại Thuốc kê đơn (Rx) và đặt hàng trên Zalo Mini App NESPHAR.",
    bannerTone: "emerald",
    sections: [
      {
        heading: "1. Phạm vi danh mục & Quy định Thuốc kê đơn (Rx)",
        paragraphs: [
          "Ứng dụng Zalo Mini App chính thức của CÔNG TY TNHH DƯỢC PHẨM NESPHAR (MST: 3002297464) niêm yết minh bạch Thực phẩm bảo vệ sức khỏe, Vật tư y tế, Thiết bị y tế và Danh mục Dược phẩm phân phối chính hãng.",
          "Đối với mặt hàng gắn thẻ Nhóm thuốc kê đơn (Rx), khách hàng cá nhân chỉ tra cứu thông tin hoạt chất và kết nối Dược sĩ tư vấn; tính năng đặt sỉ trực tuyến chỉ mở cho đối tác Nhà thuốc / Phòng khám đã xác thực chứng chỉ GPP/GPHĐ.",
        ],
      },
      {
        heading: "2. Quy định quyền riêng tư (User Intent)",
        paragraphs: [
          "Người dùng được toàn quyền xem danh mục, giá bán bậc thang và chi tiết sản phẩm mà không bị bắt buộc đăng nhập hay cung cấp số điện thoại trước.",
        ],
      },
    ],
  },
  {
    slug: "chinh-sach-bao-mat",
    group: "policy",
    categoryLabel: "Điều khoản sử dụng",
    title: "Chính sách bảo mật dữ liệu cá nhân",
    updatedAt: "16/11/2026",
    authorLocation: "Dược Phẩm NESPHAR",
    summary:
      "Cam kết bảo vệ dữ liệu cá nhân và hồ sơ nhà thuốc đối tác theo Nghị định 13/2023/NĐ-CP.",
    bannerTone: "teal",
    sections: [
      {
        heading: "Cam kết bảo mật theo Nghị định 13/2023/NĐ-CP",
        paragraphs: [
          "Thông tin cá nhân và chứng chỉ cơ sở dược của Quý khách được bảo mật tuyệt đối trên máy chủ nội bộ của NESPHAR, chỉ phục vụ xác nhận và giao nhận đơn hàng.",
        ],
      },
    ],
  },
  {
    slug: "chinh-sach-doi-tra",
    group: "policy",
    categoryLabel: "Điều khoản sử dụng",
    title: "Chính sách kiểm hàng & đổi trả",
    updatedAt: "16/11/2026",
    authorLocation: "Dược Phẩm NESPHAR",
    summary:
      "Quyền đồng kiểm Số lô & Hạn dùng khi nhận hàng, đổi mới 100% sản phẩm lỗi bao bì hoặc sai quy cách.",
    bannerTone: "mint",
    sections: [
      {
        heading: "Đồng kiểm Số lô (Batch/Lot) & Hạn sử dụng",
        paragraphs: [
          "Tất cả kiện hàng từ NESPHAR đều hỗ trợ đồng kiểm ngoại quan, tem niêm phong, Số lô và Hạn sử dụng trước khi thanh toán.",
        ],
      },
    ],
  },
  {
    slug: "chinh-sach-giao-hang",
    group: "policy",
    categoryLabel: "Điều khoản sử dụng",
    title: "Chính sách giao hàng & thanh toán",
    updatedAt: "16/11/2026",
    authorLocation: "Dược Phẩm NESPHAR",
    summary:
      "Giao nhanh nội tỉnh Hà Tĩnh trong ngày, giao tuyến huyện/liên tỉnh chuẩn bảo quản GSP/GDP và thanh toán VietQR tự động.",
    bannerTone: "botanical",
    sections: [
      {
        heading: "Phương thức vận chuyển & Thanh toán",
        paragraphs: [
          "1. Thanh toán tiền mặt khi nhận hàng (COD).",
          "2. Chuyển khoản mã QR động Napas / VietQR chính xác theo mã đơn hàng tới tài khoản pháp nhân Công ty TNHH Dược Phẩm NESPHAR.",
        ],
      },
    ],
  },
  {
    slug: "thong-tin-lien-he",
    group: "about",
    categoryLabel: "VỀ CHÚNG TÔI",
    title: "Thông tin liên hệ & Pháp lý",
    updatedAt: "16/11/2026",
    authorLocation: "P. Trần Phú, Tỉnh Hà Tĩnh",
    summary:
      "Thông tin pháp nhân chính thức, địa chỉ trụ sở và tổng đài Dược sĩ tư vấn của Công ty TNHH Dược Phẩm NESPHAR.",
    bannerTone: "emerald",
    sections: [
      {
        heading: "Đơn vị chủ quản ứng dụng",
        paragraphs: [
          "Tên doanh nghiệp: CÔNG TY TNHH DƯỢC PHẨM NESPHAR",
          "Mã số thuế / GPKD: 3002297464",
          "Người đại diện pháp luật: Bà Nguyễn Thị Hương – Giám đốc",
          "Trụ sở: Số 90 Đường Hà Hoàng, Tổ dân phố Đoài Thịnh, Phường Trần Phú, tỉnh Hà Tĩnh.",
          "Hotline Dược sĩ: 0926.090.668 – 0978.420.766 | Email: Duocphamnesphar@gmail.com",
        ],
      },
    ],
  },
  {
    slug: "gioi-thieu-nesphar",
    group: "about",
    categoryLabel: "VỀ CHÚNG TÔI",
    title: "Giới thiệu Dược Phẩm NESPHAR",
    updatedAt: "16/11/2026",
    authorLocation: "Dược Phẩm NESPHAR",
    summary:
      "Đối tác phân phối uy tín của BioCare, Dapharco, An Thiên, Dược TW3, Phú Thái, Minh Cường, Nam Việt, Phenikaa.",
    bannerTone: "teal",
    sections: [
      {
        heading: "Hệ thống phân phối chuẩn GSP / GDP",
        paragraphs: [
          "Dược Phẩm NESPHAR cung cấp danh mục hơn 360+ mặt hàng thuốc, TPBVSK nhập khẩu và vật tư y tế chính hãng, kiểm soát chặt chẽ Số lô & Hạn dùng theo nguyên tắc FEFO.",
        ],
      },
    ],
  },
  {
    slug: "cam-nang-bao-ve-gan",
    group: "health",
    categoryLabel: "TIN SỨC KHỎE",
    title: "5 nguyên tắc vàng sử dụng thuốc & TPBVSK an toàn",
    updatedAt: "16/11/2026",
    authorLocation: "Ban Dược học NESPHAR",
    summary:
      "Cách phân biệt nhãn Thuốc kê đơn (Rx), Thuốc không kê đơn (OTC) và Thực phẩm bảo vệ sức khỏe nhập khẩu.",
    bannerTone: "botanical",
    sections: [
      {
        heading: "Đọc kỹ phân loại trước khi sử dụng",
        paragraphs: [
          "Luôn kiểm tra kỹ phân loại Thuốc kê đơn (Rx), Thuốc không kê đơn (OTC) hoặc Thực phẩm bảo vệ sức khỏe và tham vấn Dược sĩ NESPHAR qua Zalo OA khi cần phối hợp.",
        ],
      },
    ],
  },
];
