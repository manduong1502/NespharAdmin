export type StaffRole = "ADMIN" | "SALES" | "WAREHOUSE";

export type PermissionKey =
  | "view_dashboard"
  | "edit_products"
  | "change_price"
  | "manage_inventory"
  | "approve_orders"
  | "manage_crm"
  | "manage_cms"
  | "export_data"
  | "manage_staff";

export interface StaffUser {
  id: string;
  email: string;
  fullName: string;
  role: StaffRole;
  phone?: string;
  status?: "active" | "locked";
  permissions: PermissionKey[];
  lastLoginAt?: string | null;
  createdAt?: string;
}

export type CustomerTier = "retail" | "clinic" | "pharmacy" | "distributor";

export interface ProductUnitOption {
  id: string;
  unitName: string;
  specificationLabel: string;
  multiplier: number;
  extraSavePercent?: number;
}

export interface ProductStockSummary {
  availableStock: number;
  nearExpiryStock: number;
  expiredStock: number;
  quarantinedStock: number;
  activeBatchCount: number;
  nearestExpDate: string | null;
}

export interface VolumePriceTier {
  minQty: number;
  maxQty: number | null;
  unitPrice: number;
  label: string;
}

export interface AdminProduct {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  categoryName: string;
  tags: string[];
  isPrescription: boolean;
  promoBadge: string;
  volumeTiers: VolumePriceTier[];
  brand: string;
  manufacturer: string;
  supplier: string;
  origin: string;
  registrationNo: string;
  declarationDocUrl: string;
  declarationDocName: string;
  baseUnit: string;
  specification: string;
  costPrice: number;
  retailPrice: number;
  originalPrice: number;
  minStockAlert: number;
  imageUrl: string;
  gallery: string[];
  unitOptions: ProductUnitOption[];
  allowedTiers: CustomerTier[];
  isVisible: boolean;
  isNew: boolean;
  isBestSeller: boolean;
  isFlashPromo: boolean;
  soldCount: number;
  shortSummary: string;
  ingredients: string;
  benefits: string[];
  dosage: string;
  targetUsers: string;
  storageNote: string;
  disclaimer: string;
  updatedAt: string;
  stock: ProductStockSummary;
}

export interface InventoryBatch {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  baseUnit: string;
  registrationNo: string;
  batchCode: string;
  mfgDate: string;
  expDate: string;
  daysLeft: number;
  expiryState: "quarantined" | "expired" | "near_expiry" | "healthy";
  costPrice: number;
  initialQty: number;
  remainingQty: number;
  shelfLocation: string;
  supplierInvoice: string;
  status: "active" | "quarantined";
  createdAt: string;
}

export interface InventoryMovement {
  id: string;
  batchId: string;
  batchCode: string;
  productId: string;
  productName: string;
  movementType: "IMPORT" | "ORDER_EXPORT_FEFO" | "ORDER_RETURN" | "ADJUSTMENT";
  qtyChange: number;
  balanceAfter: number;
  referenceCode: string;
  note: string;
  performedBy: string;
  createdAt: string;
}

export interface BatchAllocation {
  batchId: string;
  batchCode: string;
  expDate: string;
  qty: number;
}

export interface AdminOrderItem {
  id: string;
  productId: string;
  sku: string;
  name: string;
  image: string;
  unitName: string;
  specificationLabel: string;
  unitMultiplier: number;
  unitPrice: number;
  quantity: number;
  baseQtyDeducted: number;
  allocations: BatchAllocation[];
}

export type OrderStatus = "pending" | "confirmed" | "shipping" | "completed" | "cancelled";

export interface AdminOrder {
  id: string;
  code: string;
  customerId: string;
  customerName: string;
  businessName: string;
  customerPhone: string;
  customerTierSnapshot: CustomerTier;
  status: OrderStatus;
  returnStatus: "none" | "requested" | "returned";
  returnReason: string;
  subtotal: number;
  discountAmount: number;
  shippingFee: number;
  totalAmount: number;
  voucherCode: string | null;
  paymentMethod: string;
  paymentStatus: "unpaid" | "paid" | "refunded";
  shippingCarrier: string;
  trackingCode: string;
  address: {
    recipientName?: string;
    phone?: string;
    street?: string;
    ward?: string;
    district?: string;
    province?: string;
    tag?: string;
  };
  note: string;
  handledByStaffId: string | null;
  handledByName: string;
  createdAt: string;
  updatedAt: string;
  items: AdminOrderItem[];
}

export interface AdminCustomer {
  id: string;
  zaloId: string | null;
  avatarUrl?: string;
  zaloLoggedIn?: boolean;
  name: string;
  phone: string;
  email: string;
  customerTier: CustomerTier;
  customDiscountPercent: number | null;
  businessName: string;
  taxCode: string;
  gppLicenseNo: string;
  loyaltyPoints: number;
  assignedStaffId: string | null;
  assignedStaffName: string;
  notes: string;
  phoneLinked: boolean;
  orderCount: number;
  totalSpent: number;
  addresses: Array<Record<string, unknown>>;
  recentOrders: Array<Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicket {
  id: string;
  customerId: string | null;
  customerName: string;
  phone: string;
  topic: "tu-van" | "bao-gia-si" | "gop-y";
  content: string;
  status: "open" | "replied" | "resolved";
  staffReply: string;
  repliedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  diff: Record<string, unknown>;
  ipAddress: string;
  createdAt: string;
}
