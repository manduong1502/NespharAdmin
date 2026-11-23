import crypto from "node:crypto";
import { Request, Router } from "express";
import { db, logAudit, nowIsoLocal } from "../db/database";
import { createRateLimiter } from "../middleware/securityShield";
import {
  dispatchOperationalAlert,
  getPaymentConfig,
} from "../services/alertService";

export const webhookRouter = Router();

const webhookLimiter = createRateLimiter({
  prefix: "webhook-payment",
  windowMs: 60_000,
  maxRequests: 60,
  errorMessage: "Too many webhook requests.",
});

function extractIncomingToken(req: Request): string {
  const auth = String(req.headers.authorization || "").trim();
  if (auth.toLowerCase().startsWith("apikey ")) {
    return auth.slice(7).trim();
  }
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return String(
    req.headers["secure-token"] || req.headers["x-webhook-secret"] || ""
  ).trim();
}

function safeCompareSecret(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function reconcileBankTransfer(params: {
  amount: number;
  content: string;
  referenceCode: string;
  sourceIp?: string;
}): { matched: boolean; orderCode?: string; status?: string; reason?: string } {
  const cfg = getPaymentConfig();
  const memo = String(params.content || "");
  const amount = Math.round(Number(params.amount || 0));

  if (amount <= 0 || !memo) {
    return { matched: false, reason: "invalid_amount_or_memo" };
  }

  // Extract 9-12 digit NESPHAR order code (e.g. 00001462201) from bank transfer description
  const codeMatch = memo.match(/\b(\d{9,12})\b/);
  if (!codeMatch) {
    return { matched: false, reason: "no_order_code_in_memo" };
  }

  const candidateCode = codeMatch[1];
  const order = db
    .prepare(`SELECT * FROM orders WHERE code = ?`)
    .get(candidateCode) as Record<string, unknown> | undefined;

  if (!order) {
    return { matched: false, orderCode: candidateCode, reason: "order_not_found" };
  }
  if (String(order.payment_status) === "paid") {
    return { matched: true, orderCode: candidateCode, status: "already_paid" };
  }
  if (String(order.status) === "cancelled") {
    return { matched: false, orderCode: candidateCode, reason: "order_cancelled" };
  }

  const expectedTotal = Number(order.total_amount);
  if (amount < expectedTotal) {
    logAudit({
      actorId: "vietqr-webhook",
      actorName: "Cổng đối soát Ngân hàng",
      actorRole: "SYSTEM_WEBHOOK",
      action: "PAYMENT_AMOUNT_SHORTFALL",
      entityType: "order",
      entityId: String(order.id),
      summary: `Nhận chuyển khoản ${amount.toLocaleString("vi-VN")}đ cho đơn #${candidateCode} nhưng thiếu so với tổng đơn ${expectedTotal.toLocaleString("vi-VN")}đ (Mã GD: ${params.referenceCode})`,
      diff: { receivedAmount: amount, expectedTotal, referenceCode: params.referenceCode },
      ipAddress: params.sourceIp,
    });
    return { matched: false, orderCode: candidateCode, reason: "underpaid" };
  }

  const nextStatus =
    cfg.autoConfirmOnPaid && String(order.status) === "pending"
      ? "confirmed"
      : String(order.status);
  const ts = nowIsoLocal();

  db.exec("BEGIN");
  try {
    db.prepare(
      `UPDATE orders
       SET payment_status = 'paid',
           status = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(nextStatus, ts, String(order.id));

    db.prepare(
      `INSERT INTO notifications (id, customer_id, type, title, body, target_link, is_read, created_at)
       VALUES (?, ?, 'order', ?, ?, '/orders', 0, ?)`
    ).run(
      `noti-${Date.now()}`,
      String(order.customer_id),
      `Đã nhận thanh toán VietQR đơn #${candidateCode}`,
      `Hệ thống NESPHAR đã nhận ${amount.toLocaleString(
        "vi-VN"
      )}đ qua VietQR và chuyển đơn hàng sang khâu xuất lô FEFO.`,
      ts
    );

    logAudit({
      actorId: "vietqr-webhook",
      actorName: "VietQR Auto-Webhook",
      actorRole: "SYSTEM_WEBHOOK",
      action: "AUTO_PAYMENT_CONFIRMED",
      entityType: "order",
      entityId: String(order.id),
      summary: `Tự động gạch nợ VietQR đơn #${candidateCode} (+${amount.toLocaleString(
        "vi-VN"
      )}đ · Mã GD: ${params.referenceCode || "BANK"})`,
      diff: {
        paymentStatus: { from: order.payment_status, to: "paid" },
        status: { from: order.status, to: nextStatus },
        referenceCode: params.referenceCode,
      },
      ipAddress: params.sourceIp,
    });

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  dispatchOperationalAlert(
    "PAYMENT_CONFIRMED",
    [
      `[ĐÃ NHẬN TIỀN VIETQR] Đơn #${candidateCode}`,
      `Khách hàng: ${order.customer_name}`,
      `Số tiền nhận: ${amount.toLocaleString("vi-VN")}đ`,
      `Mã GD ngân hàng: ${params.referenceCode || "N/A"}`,
      `Trạng thái đơn: ${nextStatus === "confirmed" ? "Đã tự động xác nhận" : nextStatus}`,
    ],
    {
      orderId: order.id,
      orderCode: candidateCode,
      amount,
      referenceCode: params.referenceCode,
    }
  );

  return { matched: true, orderCode: candidateCode, status: "paid" };
}

/**
 * POST /api/v1/webhooks/payment
 * Supports both SePay (single object) and Casso (`data: [...]` array) payloads.
 */
webhookRouter.post("/payment", webhookLimiter, (req, res) => {
  const cfg = getPaymentConfig();
  const incomingToken = extractIncomingToken(req);

  if (!safeCompareSecret(incomingToken, cfg.webhookSecret)) {
    res.status(401).json({ error: "Invalid webhook secret token." });
    return;
  }

  const body = req.body || {};
  const results: Array<ReturnType<typeof reconcileBankTransfer>> = [];

  if (Array.isArray(body.data)) {
    // Casso payload format
    for (const tx of body.data) {
      results.push(
        reconcileBankTransfer({
          amount: Number(tx.amount || 0),
          content: String(tx.description || ""),
          referenceCode: String(tx.tid || tx.id || ""),
          sourceIp: req.ip,
        })
      );
    }
  } else {
    // SePay / Standard VietQR webhook payload format
    if (body.transferType && String(body.transferType).toLowerCase() !== "in") {
      res.json({ success: true, ignored: "outgoing_transfer" });
      return;
    }
    results.push(
      reconcileBankTransfer({
        amount: Number(body.transferAmount ?? body.amount ?? 0),
        content: String(body.content ?? body.description ?? ""),
        referenceCode: String(body.referenceCode ?? body.id ?? ""),
        sourceIp: req.ip,
      })
    );
  }

  res.json({ success: true, results });
});
