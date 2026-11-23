import React, { useEffect, useState } from "react";
import { Edit3, Lock, LockOpen, Plus, Search, Shield } from "lucide-react";
import { apiRequest } from "../api/client";
import { ModalDialog } from "../components/OverlayPortal";
import { useAuth } from "../context/AuthContext";
import { AuditLogEntry, PermissionKey, StaffRole, StaffUser } from "../types";
import {
  formatDateTimeVi,
  PERMISSION_LABELS,
  ROLE_META,
} from "../utils/format";

const ALL_PERMISSIONS: PermissionKey[] = [
  "view_dashboard",
  "edit_products",
  "change_price",
  "manage_inventory",
  "approve_orders",
  "manage_crm",
  "manage_cms",
  "export_data",
  "manage_staff",
];

const DEFAULT_ROLE_PERMS: Record<StaffRole, PermissionKey[]> = {
  ADMIN: [...ALL_PERMISSIONS],
  SALES: [
    "view_dashboard",
    "edit_products",
    "approve_orders",
    "manage_crm",
    "manage_cms",
  ],
  WAREHOUSE: ["view_dashboard", "manage_inventory", "approve_orders"],
};

export const StaffAuditPage: React.FC = () => {
  const { hasPermission, showToast } = useAuth();
  const [tab, setTab] = useState<"staff" | "audit">("staff");
  const [staffList, setStaffList] = useState<StaffUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [entityFilter, setEntityFilter] = useState("");
  const [auditSearch, setAuditSearch] = useState("");

  // Staff Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    role: "SALES" as StaffRole,
    status: "active" as "active" | "locked",
    password: "",
    permissions: [...DEFAULT_ROLE_PERMS.SALES] as PermissionKey[],
  });

  const canManageStaff = hasPermission("manage_staff");

  const loadData = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (entityFilter) qs.set("entityType", entityFilter);
      if (auditSearch.trim()) qs.set("q", auditSearch.trim());

      const [stfRes, audRes] = await Promise.all([
        apiRequest<{ staff: StaffUser[] }>("/staff"),
        apiRequest<{ logs: AuditLogEntry[] }>(`/audit-logs?${qs.toString()}`),
      ]);
      setStaffList(stfRes.staff);
      setAuditLogs(audRes.logs);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Lỗi tải dữ liệu nhân sự", "negative");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [entityFilter]);

  const openCreateModal = () => {
    setEditingStaff(null);
    setForm({
      fullName: "",
      email: "",
      phone: "",
      role: "SALES",
      status: "active",
      password: "Nesphar@2026",
      permissions: [...DEFAULT_ROLE_PERMS.SALES],
    });
    setModalOpen(true);
  };

  const openEditModal = (s: StaffUser) => {
    setEditingStaff(s);
    setForm({
      fullName: s.fullName,
      email: s.email,
      phone: s.phone || "",
      role: s.role,
      status: s.status || "active",
      password: "",
      permissions: s.permissions,
    });
    setModalOpen(true);
  };

  const togglePerm = (perm: PermissionKey) => {
    setForm((prev) => {
      const exists = prev.permissions.includes(perm);
      return {
        ...prev,
        permissions: exists
          ? prev.permissions.filter((p) => p !== perm)
          : [...prev.permissions, perm],
      };
    });
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingStaff) {
        await apiRequest(`/staff/${editingStaff.id}`, {
          method: "PUT",
          body: JSON.stringify({
            fullName: form.fullName,
            role: form.role,
            phone: form.phone,
            status: form.status,
            permissions: form.permissions,
            newPassword: form.password || undefined,
          }),
        });
        showToast(`Đã cập nhật quyền cho ${form.fullName}`);
      } else {
        await apiRequest("/staff", {
          method: "POST",
          body: JSON.stringify(form),
        });
        showToast(`Đã tạo tài khoản cho ${form.fullName}`);
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Không thể lưu nhân sự", "negative");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <h1 className="text-[22px] font-bold tracking-tight text-ink-primary">
          Cài đặt & Nhân sự
        </h1>

        {canManageStaff && tab === "staff" && (
          <button
            type="button"
            onClick={openCreateModal}
            className="btn-press inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl bg-gradient-to-r from-[#3E4095] to-[#2F317B] px-4 text-[13px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(62,64,149,0.55)] hover:from-[#343683] hover:to-[#252766]"
          >
            <Plus className="h-4 w-4" />
            <span>Thêm nhân viên</span>
          </button>
        )}
      </div>

      {/* Main White Card */}
      <div className="admin-card space-y-4 p-5">
        <div className="overflow-x-auto">
          <div className="admin-tabs">
            <button
              type="button"
              onClick={() => setTab("staff")}
              className={`admin-tab-btn ${tab === "staff" ? "admin-tab-active" : ""}`}
            >
              Nhân viên ({staffList.length})
            </button>

            <button
              type="button"
              onClick={() => setTab("audit")}
              className={`admin-tab-btn ${tab === "audit" ? "admin-tab-active" : ""}`}
            >
              Nhật ký hoạt động ({auditLogs.length})
            </button>
          </div>
        </div>

        {/* TAB 1: STAFF & RBAC */}
        {tab === "staff" && (
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>Nhân sự</th>
                  <th>Email</th>
                  <th>Vai trò</th>
                  <th>Quyền được cấp</th>
                  <th>Đăng nhập cuối</th>
                  <th>Trạng thái</th>
                  <th className="text-right">Cấu hình</th>
                </tr>
              </thead>
              <tbody className="anim-rows">
                {staffList.map((s) => {
                  const roleInfo = ROLE_META[s.role];
                  const initial =
                    s.fullName
                      .replace(/\([^)]*\)/g, "")
                      .trim()
                      .split(/\s+/)
                      .pop()?.[0]
                      ?.toUpperCase() || "S";
                  return (
                    <tr key={s.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <span
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold"
                            style={{ backgroundColor: roleInfo.bg, color: roleInfo.ink }}
                          >
                            {initial}
                          </span>
                          <div>
                            <div className="font-semibold text-ink-primary">{s.fullName}</div>
                            {s.phone && (
                              <code className="text-[11.5px] text-ink-muted">{s.phone}</code>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap">
                        <code className="text-[12.5px] text-pharma-600">{s.email}</code>
                      </td>
                      <td>
                        <span
                          className="inline-block whitespace-nowrap rounded-lg px-2.5 py-1 text-[11.5px] font-medium"
                          style={{ backgroundColor: roleInfo.bg, color: roleInfo.ink }}
                        >
                          {roleInfo.label}
                        </span>
                      </td>
                      <td>
                        <div className="flex max-w-md flex-wrap gap-1">
                          {s.role === "ADMIN" ? (
                            <span className="whitespace-nowrap rounded-md bg-[#EEF0FD] px-2 py-0.5 text-[11px] font-medium text-pharma-700">
                              Toàn quyền hệ thống (9/9)
                            </span>
                          ) : (
                            s.permissions.map((p) => (
                              <span
                                key={p}
                                className="whitespace-nowrap rounded-md bg-[#F3F5FB] px-2 py-0.5 text-[11px] text-ink-secondary"
                              >
                                {PERMISSION_LABELS[p]?.title || p}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap text-[12.5px] text-ink-muted tabular-nums">
                        {formatDateTimeVi(s.lastLoginAt)}
                      </td>
                      <td>
                        <span
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11.5px] font-medium"
                          style={
                            s.status === "locked"
                              ? { backgroundColor: "#FFECEB", color: "#B42318" }
                              : { backgroundColor: "#E8F8EE", color: "#136C3E" }
                          }
                        >
                          {s.status === "locked" ? (
                            <>
                              <Lock className="h-3 w-3" />
                              <span>Đã khóa</span>
                            </>
                          ) : (
                            <>
                              <LockOpen className="h-3 w-3" />
                              <span>Hoạt động</span>
                            </>
                          )}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-right">
                        {canManageStaff ? (
                          <button
                            type="button"
                            onClick={() => openEditModal(s)}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-pharma-600 hover:bg-[#EEF0FD]"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            <span>Phân quyền</span>
                          </button>
                        ) : (
                          <span className="text-[12px] text-ink-muted">Chỉ xem</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 2: AUDIT LOGS */}
        {tab === "audit" && (
          <div className="space-y-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative w-full sm:w-[320px]">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
                  <input
                    type="search"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && loadData()}
                    placeholder="Tìm người thực hiện, mã đơn, SKU, mã lô..."
                    className="h-9 w-full pl-9 pr-3 text-[13.5px]"
                  />
                </div>

                <select
                  value={entityFilter}
                  onChange={(e) => setEntityFilter(e.target.value)}
                  className="h-9 pl-3 text-[13.5px]"
                >
                  <option value="">Tất cả phân hệ</option>
                  <option value="order">Đơn hàng</option>
                  <option value="product">Sản phẩm</option>
                  <option value="inventory_batch">Kho & Lô hàng</option>
                  <option value="customer">Khách hàng</option>
                  <option value="staff_user">Nhân sự</option>
                </select>

                <button
                  type="button"
                  onClick={loadData}
                  className="btn-press h-9 rounded-xl border border-borderline bg-white px-3.5 text-[13px] font-medium text-ink-secondary hover:bg-frame"
                >
                  Lọc
                </button>
              </div>
            </div>

            <div className="table-shell">
              {loading ? (
                <div className="py-12 text-center text-[13.5px] text-ink-muted">
                  Đang tải nhật ký hoạt động...
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="py-12 text-center text-[13.5px] text-ink-muted">
                  Không có nhật ký phù hợp.
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Thời điểm</th>
                      <th>Người thực hiện</th>
                      <th>Hành động</th>
                      <th>Chi tiết thay đổi</th>
                      <th>IP</th>
                    </tr>
                  </thead>
                  <tbody className="anim-rows">
                    {auditLogs.map((log) => {
                      const diffPairs = Object.entries(log.diff || {});
                      return (
                        <tr key={log.id}>
                          <td className="whitespace-nowrap text-[12.5px] text-ink-muted tabular-nums">
                            {formatDateTimeVi(log.createdAt)}
                          </td>
                          <td className="whitespace-nowrap">
                            <div className="font-medium text-ink-primary">{log.actorName}</div>
                            <span className="text-[11px] text-ink-muted">{log.actorRole}</span>
                          </td>
                          <td className="whitespace-nowrap">
                            <code className="rounded-md bg-[#F3F5FB] px-2 py-0.5 text-[11.5px] font-medium text-pharma-700">
                              {log.action}
                            </code>
                          </td>
                          <td>
                            <div className="text-[13px] text-ink-primary">{log.summary}</div>
                            {diffPairs.length > 0 && (
                              <div className="mt-0.5 max-w-lg truncate text-[11.5px] text-ink-muted tabular-nums">
                                {diffPairs
                                  .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
                                  .join(" · ")}
                              </div>
                            )}
                          </td>
                          <td className="whitespace-nowrap">
                            <code className="text-[12px] text-ink-muted">{log.ipAddress}</code>
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
      </div>

      {/* PORTALED STAFF RBAC MODAL */}
      <ModalDialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        widthClass="max-w-xl"
        title={
          <>
            <Shield className="h-5 w-5 shrink-0 text-pharma-600" />
            <span>
              {editingStaff
                ? `Phân quyền · ${editingStaff.fullName}`
                : "Thêm tài khoản nhân viên"}
            </span>
          </>
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="h-9 rounded-xl border border-borderline bg-white px-4 text-[13px] font-medium text-ink-secondary hover:bg-frame"
            >
              Đóng
            </button>
            <button
              type="submit"
              form="staff-rbac-form"
              disabled={saving}
              className="btn-press h-9 rounded-xl bg-pharma-600 px-5 text-[13px] font-semibold text-white hover:bg-pharma-700"
            >
              {saving ? "Đang lưu..." : "Lưu phân quyền"}
            </button>
          </>
        }
      >
        <form id="staff-rbac-form" onSubmit={handleSaveStaff} className="space-y-4">
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label className="block text-[12.5px] font-medium text-ink-secondary">
                Họ tên & Chức danh *
              </label>
              <input
                type="text"
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="mt-1 h-9 w-full px-3"
              />
            </div>
            <div>
              <label className="block text-[12.5px] font-medium text-ink-secondary">
                Email đăng nhập *
              </label>
              <input
                type="email"
                required
                disabled={Boolean(editingStaff)}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="mt-1 h-9 w-full px-3 disabled:bg-[#F3F5FB]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <div>
              <label className="block text-[12.5px] font-medium text-ink-secondary">
                Vai trò
              </label>
              <select
                value={form.role}
                onChange={(e) => {
                  const nextRole = e.target.value as StaffRole;
                  setForm({
                    ...form,
                    role: nextRole,
                    permissions: [...DEFAULT_ROLE_PERMS[nextRole]],
                  });
                }}
                className="mt-1 h-9 w-full pl-2.5"
              >
                <option value="ADMIN">Giám đốc</option>
                <option value="SALES">Dược sĩ</option>
                <option value="WAREHOUSE">Thủ kho</option>
              </select>
            </div>

            <div>
              <label className="block text-[12.5px] font-medium text-ink-secondary">
                Trạng thái
              </label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as "active" | "locked" })
                }
                className="mt-1 h-9 w-full pl-2.5"
              >
                <option value="active">Hoạt động</option>
                <option value="locked">Khóa truy cập</option>
              </select>
            </div>

            <div>
              <label className="block text-[12.5px] font-medium text-ink-secondary">
                {editingStaff ? "Mật khẩu mới" : "Mật khẩu *"}
              </label>
              <input
                type="text"
                required={!editingStaff}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={editingStaff ? "Giữ nguyên" : "Nesphar@2026"}
                className="mt-1 h-9 w-full px-3"
              />
            </div>
          </div>

          <div className="admin-subtle-panel space-y-2.5 p-4">
            <div className="text-[13px] font-semibold text-ink-primary">
              Quyền thao tác chi tiết
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ALL_PERMISSIONS.map((perm) => {
                const checked =
                  form.role === "ADMIN" || form.permissions.includes(perm);
                return (
                  <label
                    key={perm}
                    className="admin-card flex cursor-pointer items-start gap-2.5 p-2.5"
                  >
                    <input
                      type="checkbox"
                      disabled={form.role === "ADMIN"}
                      checked={checked}
                      onChange={() => togglePerm(perm)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-medium text-ink-primary">
                        {PERMISSION_LABELS[perm].title}
                      </div>
                      <div className="text-[11px] text-ink-muted">
                        {PERMISSION_LABELS[perm].description}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
};
