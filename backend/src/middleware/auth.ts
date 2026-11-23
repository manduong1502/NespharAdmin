import { NextFunction, Request, Response } from "express";
import { db } from "../db/database";
import { JwtPayload, verifyJwt } from "../utils/security";

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

export const ROLE_DEFAULT_PERMISSIONS: Record<
  "ADMIN" | "SALES" | "WAREHOUSE",
  PermissionKey[]
> = {
  ADMIN: [
    "view_dashboard",
    "edit_products",
    "change_price",
    "manage_inventory",
    "approve_orders",
    "manage_crm",
    "manage_cms",
    "export_data",
    "manage_staff",
  ],
  SALES: [
    "view_dashboard",
    "edit_products",
    "approve_orders",
    "manage_crm",
    "manage_cms",
  ],
  WAREHOUSE: ["view_dashboard", "manage_inventory", "approve_orders"],
};

export interface AuthenticatedRequest extends Request {
  staff?: JwtPayload & { permissions: PermissionKey[] };
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (!token) {
    res.status(401).json({ error: "Vui lòng đăng nhập tài khoản quản trị NESPHAR." });
    return;
  }

  const payload = verifyJwt(token);
  if (!payload) {
    res.status(401).json({ error: "Phiên đăng nhập đã hết hạn hoặc không hợp lệ." });
    return;
  }

  const row = db
    .prepare(
      `SELECT id, email, full_name, role, status, permissions_json FROM staff_users WHERE id = ?`
    )
    .get(payload.sub) as
    | {
        id: string;
        email: string;
        full_name: string;
        role: "ADMIN" | "SALES" | "WAREHOUSE";
        status: string;
        permissions_json: string;
      }
    | undefined;

  if (!row || row.status !== "active") {
    res.status(403).json({ error: "Tài khoản nhân sự đã bị khóa hoặc không tồn tại." });
    return;
  }

  let permissions: PermissionKey[] = [];
  try {
    const parsed = JSON.parse(row.permissions_json);
    permissions = Array.isArray(parsed) && parsed.length > 0
      ? parsed
      : ROLE_DEFAULT_PERMISSIONS[row.role];
  } catch {
    permissions = ROLE_DEFAULT_PERMISSIONS[row.role];
  }

  req.staff = {
    sub: row.id,
    email: row.email,
    name: row.full_name,
    role: row.role,
    exp: payload.exp,
    permissions,
  };

  next();
}

export function requirePermission(perm: PermissionKey) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.staff) {
      res.status(401).json({ error: "Chưa xác thực quyền truy cập." });
      return;
    }
    if (req.staff.role === "ADMIN" || req.staff.permissions.includes(perm)) {
      next();
      return;
    }
    res.status(403).json({
      error: `Tài khoản vai trò ${req.staff.role} không có quyền thực hiện thao tác này (${perm}).`,
    });
  };
}
