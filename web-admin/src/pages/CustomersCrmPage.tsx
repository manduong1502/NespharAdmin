import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Building2,
  Download,
  Edit3,
  MessageSquare,
  Plus,
  Search,
  Send,
  Users,
  Wallet,
} from "lucide-react";
import { apiRequest, downloadAdminCsv } from "../api/client";
import { SlideDrawer } from "../components/OverlayPortal";
import { useAuth } from "../context/AuthContext";
import { AdminCustomer, CustomerTier, StaffUser, SupportTicket } from "../types";
import { formatDateTimeVi, formatVnd, TIER_META } from "../utils/format";

type CrmView = "customers" | "tickets";

export const CustomersCrmPage: React.FC = () => {
  const { hasPermission, showToast } = useAuth();
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<CrmView>(
    () => (searchParams.get("view") === "tickets" ? "tickets" : "customers")
  );
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [staffList, setStaffList] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);

  const [tierFilter, setTierFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q") || "");

  useEffect(() => {
    const v = searchParams.get("view");
    const q = searchParams.get("q");
    if (v === "tickets" || v === "customers") setView(v);
    if (q !== null) setSearchQuery(q);
  }, [searchParams]);

  const [ticketFilter, setTicketFilter] = useState<"all" | "open" | "replied">("all");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Customer Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<AdminCustomer | null>(null);
  const [custForm, setCustForm] = useState({
    name: "",
    phone: "",
    email: "",
    customerTier: "retail" as CustomerTier,
    customDiscountPercent: "" as string | number,
    businessName: "",
    taxCode: "",
    gppLicenseNo: "",
    loyaltyPoints: 0,
    assignedStaffId: "",
    notes: "",
  });

  const canManage = hasPermission("manage_crm");

  const loadAll = async () => {
    setLoading(true);
    try {
      const [custRes, tickRes, stfRes] = await Promise.all([
        apiRequest<{ customers: AdminCustomer[] }>("/customers"),
        apiRequest<{ tickets: SupportTicket[] }>("/support-tickets"),
        apiRequest<{ staff: StaffUser[] }>("/staff"),
      ]);
      setCustomers(custRes.customers);
      setTickets(tickRes.tickets);
      setStaffList(stfRes.staff);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi tải dữ liệu khách hàng", "negative");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      if (tierFilter !== "all" && c.customerTier !== tierFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          c.name.toLowerCase().includes(q) ||
          c.businessName.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          c.taxCode.toLowerCase().includes(q) ||
          c.gppLicenseNo.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [customers, tierFilter, searchQuery]);

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (ticketFilter === "open" && t.status !== "open") return false;
      if (ticketFilter === "replied" && t.status === "open") return false;
      return true;
    });
  }, [tickets, ticketFilter]);

  const openCreateCustomer = () => {
    setEditingCustomer(null);
    setCustForm({
      name: "",
      phone: "",
      email: "",
      customerTier: "pharmacy",
      customDiscountPercent: "",
      businessName: "",
      taxCode: "",
      gppLicenseNo: "",
      loyaltyPoints: 0,
      assignedStaffId: staffList[0]?.id || "",
      notes: "",
    });
    setDrawerOpen(true);
  };

  const openEditCustomer = (c: AdminCustomer) => {
    setEditingCustomer(c);
    setCustForm({
      name: c.name,
      phone: c.phone,
      email: c.email,
      customerTier: c.customerTier,
      customDiscountPercent:
        c.customDiscountPercent !== null ? c.customDiscountPercent : "",
      businessName: c.businessName,
      taxCode: c.taxCode,
      gppLicenseNo: c.gppLicenseNo,
      loyaltyPoints: c.loyaltyPoints,
      assignedStaffId: c.assignedStaffId || "",
      notes: c.notes,
    });
    setDrawerOpen(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...custForm,
        customDiscountPercent:
          custForm.customDiscountPercent === ""
            ? null
            : Number(custForm.customDiscountPercent),
      };
      if (editingCustomer) {
        await apiRequest(`/customers/${editingCustomer.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        showToast(`Đã cập nhật ${custForm.businessName || custForm.name}`);
      } else {
        await apiRequest("/customers", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        showToast(`Đã thêm ${custForm.businessName || custForm.name}`);
      }
      setDrawerOpen(false);
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Không thể lưu hồ sơ khách hàng", "negative");
    } finally {
      setSaving(false);
    }
  };

  const handleReplyTicket = async (t: SupportTicket) => {
    const reply = (replyDrafts[t.id] ?? t.staffReply).trim();
    if (!reply) {
      showToast("Vui lòng nhập nội dung phản hồi.", "negative");
      return;
    }
    setSaving(true);
    try {
      await apiRequest(`/support-tickets/${t.id}/reply`, {
        method: "PATCH",
        body: JSON.stringify({ staffReply: reply, status: "replied" }),
      });
      showToast(`Đã gửi phản hồi cho ${t.customerName}`);
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gửi phản hồi thất bại", "negative");
    } finally {
      setSaving(false);
    }
  };

  const openCount = tickets.filter((t) => t.status === "open").length;
  const b2bPartnersCount = customers.filter((c) => c.customerTier !== "retail").length;
  const totalCrmSpent = customers.reduce((s, c) => s + c.totalSpent, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-[22px] font-bold tracking-tight text-ink-primary">Khách hàng</h1>
          <span className="rounded-full bg-[#EEF0FD] px-2.5 py-0.5 text-[12px] font-semibold text-pharma-600 tabular-nums">
            {customers.length} hồ sơ
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasPermission("export_data") && (
            <button
              type="button"
              onClick={() => downloadAdminCsv("customers")}
              className="btn-press inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#DCE2F0] bg-white px-3 text-[13px] font-medium text-ink-secondary hover:bg-[#F5F7FC]"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Xuất CSV</span>
            </button>
          )}
          {canManage && (
            <button
              type="button"
              onClick={openCreateCustomer}
              className="btn-press inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl bg-gradient-to-r from-[#3E4095] to-[#2F317B] px-4 text-[13px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(62,64,149,0.55)] hover:from-[#343683] hover:to-[#252766]"
            >
              <Plus className="h-4 w-4" />
              <span>Thêm khách hàng</span>
            </button>
          )}
        </div>
      </div>

      {/* Interactive Metric Ribbon */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => {
            setView("customers");
            setTierFilter("all");
          }}
          className={`admin-card anim-kpi-interactive flex items-center justify-between p-4 text-left ${
            view === "customers" && tierFilter === "all"
              ? "border-pharma-600 ring-1 ring-pharma-600/20"
              : ""
          }`}
        >
          <div>
            <div className="text-[12px] font-medium text-ink-muted">Tổng khách hàng</div>
            <div className="mt-1 text-[22px] font-bold text-ink-primary tabular-nums">
              {customers.length}
            </div>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EEF0FD] text-pharma-600">
            <Users className="h-[18px] w-[18px]" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setView("customers");
            setTierFilter("pharmacy");
          }}
          className={`admin-card anim-kpi-interactive flex items-center justify-between p-4 text-left ${
            view === "customers" && tierFilter !== "all"
              ? "border-[#136C3E] ring-1 ring-[#136C3E]/20"
              : ""
          }`}
        >
          <div>
            <div className="text-[12px] font-medium text-ink-muted">Đối tác sỉ B2B</div>
            <div className="mt-1 text-[22px] font-bold text-[#136C3E] tabular-nums">
              {b2bPartnersCount}
            </div>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E8F8EE] text-[#136C3E]">
            <Building2 className="h-[18px] w-[18px]" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => setView("tickets")}
          className={`admin-card anim-kpi-interactive flex items-center justify-between p-4 text-left ${
            view === "tickets" ? "border-[#D97706] ring-1 ring-[#D97706]/25" : ""
          }`}
        >
          <div>
            <div className="text-[12px] font-medium text-ink-muted">Tin chờ tư vấn</div>
            <div className="mt-1 text-[22px] font-bold text-[#B45309] tabular-nums">
              {openCount}
            </div>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF6E5] text-[#B45309]">
            <MessageSquare className="h-[18px] w-[18px]" />
          </span>
        </button>

        <div className="admin-card flex items-center justify-between p-4">
          <div className="min-w-0">
            <div className="text-[12px] font-medium text-ink-muted">Tổng doanh số CRM</div>
            <div className="mt-1 truncate text-[19px] font-bold text-ink-primary tabular-nums">
              {formatVnd(totalCrmSpent)}
            </div>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F2F4FB] text-ink-primary">
            <Wallet className="h-[18px] w-[18px]" />
          </span>
        </div>
      </div>

      {/* Main White Card */}
      <div className="admin-card space-y-4 p-5">
        <div className="overflow-x-auto">
          <div className="admin-tabs">
            <button
              type="button"
              onClick={() => setView("customers")}
              className={`admin-tab-btn ${view === "customers" ? "admin-tab-active" : ""}`}
            >
              Danh sách khách hàng ({customers.length})
            </button>

            <button
              type="button"
              onClick={() => setView("tickets")}
              className={`admin-tab-btn ${view === "tickets" ? "admin-tab-active" : ""}`}
            >
              <span>Tin nhắn tư vấn ({tickets.length})</span>
              {openCount > 0 && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums"
                  style={{ backgroundColor: "#FFF6E5", color: "#9A5B00" }}
                >
                  {openCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* VIEW 1: CUSTOMERS CRM */}
        {view === "customers" && (
          <div className="space-y-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative w-full sm:w-[310px]">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm tên nhà thuốc, SĐT, MST, số GPP..."
                    className="h-9 w-full pl-9 pr-3 text-[13.5px]"
                  />
                </div>

                <select
                  value={tierFilter}
                  onChange={(e) => setTierFilter(e.target.value)}
                  className="h-9 pl-3 text-[13.5px]"
                >
                  <option value="all">Tất cả hạng khách ({customers.length})</option>
                  <option value="retail">Khách lẻ (0%)</option>
                  <option value="clinic">Phòng khám (-8%)</option>
                  <option value="pharmacy">Nhà thuốc (-12%)</option>
                  <option value="distributor">Đại lý (-18%)</option>
                </select>
              </div>

              <div className="text-[13px] text-ink-muted tabular-nums">
                {filteredCustomers.length} kết quả
              </div>
            </div>

            <div className="table-shell">
              {loading ? (
                <div className="py-12 text-center text-[13.5px] text-ink-muted">
                  Đang tải danh sách khách hàng...
                </div>
              ) : filteredCustomers.length === 0 ? (
                <div className="py-12 text-center text-[13.5px] text-ink-muted">
                  Không tìm thấy khách hàng phù hợp.
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Khách hàng / Đơn vị</th>
                      <th>Điện thoại</th>
                      <th>Hạng giá</th>
                      <th>GPP / MST</th>
                      <th>Phụ trách</th>
                      <th className="text-right">Điểm</th>
                      <th className="text-right">Tổng mua</th>
                      <th className="text-right">Sửa</th>
                    </tr>
                  </thead>
                  <tbody className="anim-rows">
                    {filteredCustomers.map((c) => {
                      const tierMeta = TIER_META[c.customerTier] || TIER_META.retail;
                      const displayLabel = c.businessName || c.name;
                      const initial =
                        displayLabel
                          .replace(/\([^)]*\)/g, "")
                          .trim()
                          .split(/\s+/)
                          .pop()?.[0]
                          ?.toUpperCase() || "K";
                      return (
                        <tr key={c.id}>
                          <td>
                            <div className="flex items-center gap-2.5">
                              <span
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[12.5px] font-bold"
                                style={{ backgroundColor: tierMeta.bg, color: tierMeta.ink }}
                              >
                                {initial}
                              </span>
                              <div className="min-w-0 max-w-[205px]">
                                <div className="truncate font-semibold text-ink-primary">
                                  {displayLabel}
                                </div>
                                {c.businessName && (
                                  <div className="truncate text-[11.5px] text-ink-muted">
                                    {c.name}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="whitespace-nowrap">
                            <code className="text-[12.5px] font-medium text-pharma-600">
                              {c.phone || "Chưa có"}
                            </code>
                            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-muted">
                              <span>{c.phoneLinked ? "Đã xác thực" : "Chưa xác thực"}</span>
                              {c.zaloLoggedIn && (
                                <span
                                  className="whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold"
                                  style={{ backgroundColor: "#EEF0FD", color: "#3E4095" }}
                                >
                                  Zalo
                                </span>
                              )}
                            </div>
                          </td>

                          <td>
                            <span
                              className="inline-block whitespace-nowrap rounded-lg px-2 py-0.5 text-[11.5px] font-medium"
                              style={{ backgroundColor: tierMeta.bg, color: tierMeta.ink }}
                            >
                              {tierMeta.label}
                            </span>
                            {c.customDiscountPercent !== null && (
                              <div className="mt-0.5 whitespace-nowrap text-[11px] text-ink-muted tabular-nums">
                                CK -{c.customDiscountPercent}%
                              </div>
                            )}
                          </td>

                          <td className="whitespace-nowrap text-[12px] text-ink-secondary">
                            {c.gppLicenseNo ? (
                              <div className="truncate max-w-[140px]">
                                <code>{c.gppLicenseNo}</code>
                              </div>
                            ) : (
                              <span className="text-ink-muted">Cá nhân</span>
                            )}
                            {c.taxCode && (
                              <div className="text-[11px] text-ink-muted tabular-nums">
                                MST: {c.taxCode}
                              </div>
                            )}
                          </td>

                          <td className="max-w-[130px] truncate text-[12.5px] text-ink-secondary">
                            {c.assignedStaffName.replace(/\([^)]*\)/g, "").trim()}
                          </td>

                          <td className="whitespace-nowrap text-right text-[13px] font-medium text-ink-secondary tabular-nums">
                            {c.loyaltyPoints.toLocaleString("vi-VN")}
                          </td>

                          <td className="whitespace-nowrap text-right tabular-nums">
                            <div className="font-semibold text-ink-primary">
                              {formatVnd(c.totalSpent)}
                            </div>
                            <div className="text-[11px] text-ink-muted">
                              {c.orderCount} đơn
                            </div>
                          </td>

                          <td className="whitespace-nowrap text-right">
                            <button
                              type="button"
                              onClick={() => openEditCustomer(c)}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12.5px] font-medium text-pharma-600 hover:bg-[#EEF0FD]"
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
          </div>
        )}

        {/* VIEW 2: PHARMACIST SUPPORT & B2B TICKETS */}
        {view === "tickets" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: "all" as const, label: `Tất cả (${tickets.length})` },
                { id: "open" as const, label: `Chờ phản hồi (${openCount})` },
                {
                  id: "replied" as const,
                  label: `Đã trả lời (${tickets.length - openCount})`,
                },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTicketFilter(f.id)}
                  className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                    ticketFilter === f.id
                      ? "border-pharma-600 bg-[#EEF0FD] text-pharma-700"
                      : "border-borderline bg-white text-ink-muted"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {filteredTickets.length === 0 ? (
              <div className="py-12 text-center text-[13.5px] text-ink-muted">
                Không có tin nhắn tư vấn nào trong mục này.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredTickets.map((t) => {
                  const topicLabel =
                    t.topic === "bao-gia-si"
                      ? "Đăng ký giá sỉ"
                      : t.topic === "gop-y"
                        ? "Góp ý dịch vụ"
                        : "Tư vấn Dược sĩ";
                  return (
                    <div key={t.id} className="admin-card space-y-3 p-4 sm:p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <MessageSquare className="h-4 w-4 text-pharma-600" />
                          <span className="font-semibold text-ink-primary">{t.customerName}</span>
                          <code className="rounded bg-[#F3F5FB] px-2 py-0.5 text-[12px] text-pharma-600">
                            {t.phone}
                          </code>
                          <span
                            className="whitespace-nowrap rounded-md px-2 py-0.5 text-[11.5px] font-medium"
                            style={{ backgroundColor: "#EEF0FD", color: "#3E4095" }}
                          >
                            {topicLabel}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="whitespace-nowrap text-[12px] text-ink-muted tabular-nums">
                            {formatDateTimeVi(t.createdAt)}
                          </span>
                          <span
                            className="whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11.5px] font-medium"
                            style={
                              t.status === "open"
                                ? { backgroundColor: "#FFF6E5", color: "#9A5B00" }
                                : { backgroundColor: "#E8F8EE", color: "#136C3E" }
                            }
                          >
                            {t.status === "open" ? "Chờ phản hồi" : `Đã trả lời (${t.repliedBy})`}
                          </span>
                        </div>
                      </div>

                      <p className="rounded-xl bg-[#F8F9FC] p-3 text-[13.5px] text-ink-primary">
                        {t.content}
                      </p>

                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          type="text"
                          value={replyDrafts[t.id] ?? t.staffReply}
                          onChange={(e) =>
                            setReplyDrafts({ ...replyDrafts, [t.id]: e.target.value })
                          }
                          placeholder="Nhập nội dung tư vấn hoặc báo giá cho khách..."
                          className="h-9 flex-1 px-3 text-[13px]"
                        />
                        {canManage && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => handleReplyTicket(t)}
                            className="btn-press inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-pharma-600 px-4 text-[12.5px] font-semibold text-white hover:bg-pharma-700"
                          >
                            <Send className="h-3.5 w-3.5" />
                            <span>Gửi phản hồi</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* PORTALED CUSTOMER CRM DRAWER */}
      <SlideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        widthClass="max-w-xl"
        title={
          editingCustomer
            ? editingCustomer.businessName || editingCustomer.name
            : "Thêm khách hàng mới"
        }
        subtitle={
          editingCustomer
            ? `SĐT: ${editingCustomer.phone || "Chưa liên kết"}`
            : "Phân hạng khách lẻ hoặc đối tác nhà thuốc / phòng khám"
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="h-9 rounded-xl border border-borderline bg-white px-4 text-[13px] font-medium text-ink-secondary hover:bg-frame"
            >
              Đóng
            </button>
            {canManage && (
              <button
                type="submit"
                form="customer-crm-form"
                disabled={saving}
                className="btn-press h-9 rounded-xl bg-pharma-600 px-5 text-[13px] font-semibold text-white hover:bg-pharma-700 disabled:opacity-60"
              >
                {saving ? "Đang lưu..." : "Lưu khách hàng"}
              </button>
            )}
          </>
        }
      >
        <form id="customer-crm-form" onSubmit={handleSaveCustomer} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[13px] font-medium text-ink-secondary">
                Họ tên người liên hệ *
              </label>
              <input
                type="text"
                required
                value={custForm.name}
                onChange={(e) => setCustForm({ ...custForm, name: e.target.value })}
                className="mt-1 h-9 w-full px-3"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-ink-secondary">
                Số điện thoại Zalo *
              </label>
              <input
                type="text"
                required
                value={custForm.phone}
                onChange={(e) => setCustForm({ ...custForm, phone: e.target.value })}
                placeholder="0912345678"
                className="mt-1 h-9 w-full px-3 tabular-nums"
              />
            </div>
          </div>

          <div className="admin-subtle-panel space-y-3 p-4">
            <div className="text-[13px] font-semibold text-ink-primary">
              Hạng khách hàng & Hồ sơ nhà thuốc
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div>
                <label className="block text-[12.5px] font-medium text-ink-secondary">
                  Hạng khách hàng
                </label>
                <select
                  value={custForm.customerTier}
                  onChange={(e) =>
                    setCustForm({
                      ...custForm,
                      customerTier: e.target.value as CustomerTier,
                    })
                  }
                  className="mt-1 h-9 w-full pl-3"
                >
                  <option value="retail">Khách lẻ (0%)</option>
                  <option value="clinic">Phòng khám (-8%)</option>
                  <option value="pharmacy">Nhà thuốc (-12%)</option>
                  <option value="distributor">Đại lý (-18%)</option>
                </select>
              </div>

              <div>
                <label className="block text-[12.5px] font-medium text-ink-secondary">
                  Chiết khấu riêng (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={custForm.customDiscountPercent}
                  onChange={(e) =>
                    setCustForm({ ...custForm, customDiscountPercent: e.target.value })
                  }
                  placeholder="Mặc định theo hạng"
                  className="mt-1 h-9 w-full px-3 tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="block text-[12.5px] font-medium text-ink-secondary">
                Tên Nhà thuốc / Phòng khám / Công ty
              </label>
              <input
                type="text"
                value={custForm.businessName}
                onChange={(e) =>
                  setCustForm({ ...custForm, businessName: e.target.value })
                }
                placeholder="VD: Nhà thuốc Minh Tâm GPP"
                className="mt-1 h-9 w-full px-3"
              />
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div>
                <label className="block text-[12.5px] font-medium text-ink-secondary">
                  Mã số thuế (MST)
                </label>
                <input
                  type="text"
                  value={custForm.taxCode}
                  onChange={(e) => setCustForm({ ...custForm, taxCode: e.target.value })}
                  className="mt-1 h-9 w-full px-3"
                />
              </div>
              <div>
                <label className="block text-[12.5px] font-medium text-ink-secondary">
                  Số giấy phép GPP / GDP
                </label>
                <input
                  type="text"
                  value={custForm.gppLicenseNo}
                  onChange={(e) =>
                    setCustForm({ ...custForm, gppLicenseNo: e.target.value })
                  }
                  placeholder="VD: 089/GPP-SYT-HT"
                  className="mt-1 h-9 w-full px-3"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[13px] font-medium text-ink-secondary">
                Nhân viên phụ trách
              </label>
              <select
                value={custForm.assignedStaffId}
                onChange={(e) =>
                  setCustForm({ ...custForm, assignedStaffId: e.target.value })
                }
                className="mt-1 h-9 w-full pl-3"
              >
                <option value="">Chưa phân công</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-ink-secondary">
                Điểm thưởng tích lũy
              </label>
              <input
                type="number"
                min={0}
                value={custForm.loyaltyPoints}
                onChange={(e) =>
                  setCustForm({ ...custForm, loyaltyPoints: Number(e.target.value) })
                }
                className="mt-1 h-9 w-full px-3 tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-medium text-ink-secondary">
              Ghi chú giao nhận / chăm sóc
            </label>
            <textarea
              rows={2}
              value={custForm.notes}
              onChange={(e) => setCustForm({ ...custForm, notes: e.target.value })}
              className="mt-1 w-full p-2.5 text-[13px]"
            />
          </div>

          {editingCustomer && editingCustomer.recentOrders.length > 0 && (
            <div className="admin-card p-3.5">
              <div className="text-[13px] font-semibold text-ink-primary">
                Đơn hàng gần đây ({editingCustomer.orderCount} đơn)
              </div>
              <div className="mt-2 space-y-1.5">
                {editingCustomer.recentOrders.map((ro, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-[12.5px] tabular-nums"
                  >
                    <span>
                      <code className="text-pharma-600">#{String(ro.code)}</code> ·{" "}
                      {formatDateTimeVi(String(ro.created_at))}
                    </span>
                    <span className="font-semibold text-ink-primary">
                      {formatVnd(Number(ro.total_amount))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>
      </SlideDrawer>
    </div>
  );
};
