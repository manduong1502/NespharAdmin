export interface ZaloVerifiedPhoneResult {
  phone: string;
  verifiedByZaloServer: boolean;
}

export function normalizeVnPhone(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.startsWith("84") && digits.length >= 11) {
    return `0${digits.slice(2)}`;
  }
  return digits;
}

/**
 * Resolves a Zalo Mini App `getPhoneNumber()` token via Zalo's official OpenAPI:
 * GET https://graph.zalo.me/v2.0/me/info
 * Headers: access_token, code, secret_key
 */
export async function resolveZaloPhoneFromToken(params: {
  accessToken?: string;
  phoneToken?: string;
  fallbackPhone?: string;
}): Promise<ZaloVerifiedPhoneResult> {
  const secretKey = (process.env.ZALO_APP_SECRET || "").trim();
  const accessToken = (params.accessToken || "").trim();
  const phoneToken = (params.phoneToken || "").trim();

  if (accessToken && phoneToken && secretKey) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6_000);
    try {
      const resp = await fetch("https://graph.zalo.me/v2.0/me/info", {
        method: "GET",
        signal: controller.signal,
        headers: {
          access_token: accessToken,
          code: phoneToken,
          secret_key: secretKey,
        },
      });
      const json = (await resp.json().catch(() => null)) as {
        data?: { number?: string };
        error?: number;
        message?: string;
      } | null;

      if (json && json.error === 0 && json.data?.number) {
        return {
          phone: normalizeVnPhone(json.data.number),
          verifiedByZaloServer: true,
        };
      }
      throw new Error(
        json?.message || "Không thể giải mã token SĐT từ máy chủ Zalo."
      );
    } finally {
      clearTimeout(timer);
    }
  }

  // Fallback for Zalo Studio Simulator / Local Dev / Pre-OA-Verification mode
  const allowFallback = process.env.ALLOW_SIMULATOR_PHONE_FALLBACK !== "false";
  const cleanFallback = normalizeVnPhone(params.fallbackPhone || "");
  if (allowFallback && cleanFallback.length >= 9) {
    return {
      phone: cleanFallback,
      verifiedByZaloServer: false,
    };
  }

  throw new Error(
    "Chưa cấu hình ZALO_APP_SECRET trên máy chủ hoặc chưa cấp quyền SĐT trên Zalo."
  );
}
