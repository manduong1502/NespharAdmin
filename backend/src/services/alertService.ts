import crypto from "node:crypto";
import { db } from "../db/database";

export interface PaymentConfig {
  bankBin: string;
  bankShortName: string;
  accountNo: string;
  accountName: string;
  transferPrefix: string;
  webhookSecret: string;
  autoConfirmOnPaid: boolean;
}

export interface AlertConfig {
  telegramEnabled: boolean;
  telegramBotToken: string;
  telegramChatId: string;
  outboundWebhookUrl: string;
}

const DEFAULT_PAYMENT_CONFIG: PaymentConfig = {
  bankBin: "970436",
  bankShortName: "Vietcombank",
  accountNo: "0201000686868",
  accountName: "CONG TY TNHH DUOC PHAM NESPHAR",
  transferPrefix: "NESPHAR",
  webhookSecret:
    process.env.PAYMENT_WEBHOOK_SECRET ||
    crypto.createHash("sha256").update("nesphar-vietqr-webhook-2026").digest("hex").slice(0, 32),
  autoConfirmOnPaid: true,
};

const DEFAULT_ALERT_CONFIG: AlertConfig = {
  telegramEnabled: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID || "",
  outboundWebhookUrl: process.env.OUTBOUND_WEBHOOK_URL || "",
};

function readSetting<T>(key: string, fallback: T): T {
  try {
    const row = db
      .prepare(`SELECT value_json FROM system_settings WHERE key = ?`)
      .get(key) as { value_json: string } | undefined;
    if (!row) return fallback;
    return { ...fallback, ...(JSON.parse(row.value_json) as Partial<T>) };
  } catch {
    return fallback;
  }
}

export function getPaymentConfig(): PaymentConfig {
  return readSetting<PaymentConfig>("payment_config", DEFAULT_PAYMENT_CONFIG);
}

export function getPublicPaymentConfig(): Omit<PaymentConfig, "webhookSecret"> {
  const full = getPaymentConfig();
  return {
    bankBin: full.bankBin,
    bankShortName: full.bankShortName,
    accountNo: full.accountNo,
    accountName: full.accountName,
    transferPrefix: full.transferPrefix,
    autoConfirmOnPaid: full.autoConfirmOnPaid,
  };
}

export function getAlertConfig(): AlertConfig {
  return readSetting<AlertConfig>("alert_config", DEFAULT_ALERT_CONFIG);
}

export function buildVietQrImageUrl(params: {
  amount: number;
  orderCode: string;
}): string {
  const cfg = getPaymentConfig();
  if (!cfg.bankBin || !cfg.accountNo) return "";
  const memo = `${cfg.transferPrefix || "NESPHAR"} ${params.orderCode}`.trim();
  const qs = new URLSearchParams({
    amount: String(Math.max(0, Math.round(params.amount))),
    addInfo: memo,
    accountName: cfg.accountName || "CONG TY TNHH DUOC PHAM NESPHAR",
  });
  return `https://img.vietqr.io/image/${encodeURIComponent(
    cfg.bankBin
  )}-${encodeURIComponent(cfg.accountNo)}-compact2.png?${qs.toString()}`;
}

async function postTelegramRaw(
  botToken: string,
  chatId: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const resp = await fetch(
      `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        }),
      }
    );
    const json = (await resp.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
    };
    if (!resp.ok || !json.ok) {
      return {
        ok: false,
        error: json.description || `Telegram HTTP ${resp.status}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Lỗi kết nối Telegram API",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function postOutboundWebhook(
  url: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  if (!url) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        company: "CÔNG TY TNHH DƯỢC PHẨM NESPHAR",
        timestamp: new Date().toISOString(),
        data: payload,
      }),
    });
  } catch {
    // Non-blocking operational webhook
  } finally {
    clearTimeout(timer);
  }
}

export async function sendTestTelegramMessage(customCfg?: Partial<AlertConfig>) {
  const cfg = { ...getAlertConfig(), ...(customCfg || {}) };
  if (!cfg.telegramBotToken || !cfg.telegramChatId) {
    throw new Error("Vui lòng nhập đầy đủ Telegram Bot Token và Chat ID nhóm Dược sĩ.");
  }
  const msg = [
    "[NESPHAR PHARMA CORE — KẾT NỐI THÀNH CÔNG]",
    "Hệ thống cảnh báo đơn hàng, lô FEFO & tư vấn Dược sĩ trực tuyến đã sẵn sàng!",
    `Thời gian máy chủ: ${new Date().toLocaleString("vi-VN")}`,
  ].join("\n");

  const res = await postTelegramRaw(cfg.telegramBotToken, cfg.telegramChatId, msg);
  if (!res.ok) {
    throw new Error(res.error || "Không thể gửi tin nhắn tới Telegram.");
  }
  return { ok: true };
}

export function dispatchOperationalAlert(
  event: "NEW_ORDER" | "NEW_TICKET" | "PAYMENT_CONFIRMED",
  lines: string[],
  webhookData: Record<string, unknown>
): void {
  setImmediate(() => {
    const cfg = getAlertConfig();
    const text = lines.join("\n");
    if (cfg.telegramEnabled && cfg.telegramBotToken && cfg.telegramChatId) {
      void postTelegramRaw(cfg.telegramBotToken, cfg.telegramChatId, text);
    }
    if (cfg.outboundWebhookUrl) {
      void postOutboundWebhook(cfg.outboundWebhookUrl, event, webhookData);
    }
  });
}
