import crypto from "node:crypto";

const DEFAULT_FALLBACK_SECRET =
  "nesphar-pharma-ubuntu-secret-key-2026-change-in-prod";

const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_FALLBACK_SECRET;

if (
  process.env.NODE_ENV === "production" &&
  (JWT_SECRET === DEFAULT_FALLBACK_SECRET || JWT_SECRET.length < 32)
) {
  console.warn(
    "[NESPHAR SECURITY WARNING] JWT_SECRET đang dùng giá trị mặc định hoặc ngắn hơn 32 ký tự. Hãy đặt JWT_SECRET ngẫu nhiên (openssl rand -hex 32) trong file .env!"
  );
}

const MAX_PASSWORD_LENGTH = 128;

export function hashPassword(password: string): string {
  if (!password || password.length > MAX_PASSWORD_LENGTH) {
    throw new Error("Độ dài mật khẩu không hợp lệ (tối đa 128 ký tự).");
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto
    .scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 })
    .toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!password || typeof password !== "string" || password.length > MAX_PASSWORD_LENGTH) {
    return false;
  }
  const [salt, key] = (storedHash || "").split(":");
  if (!salt || !key) return false;
  try {
    const keyBuf = Buffer.from(key, "hex");
    const derivedBuf = crypto.scryptSync(password, salt, 64, {
      N: 16384,
      r: 8,
      p: 1,
    });
    if (keyBuf.length !== derivedBuf.length) return false;
    return crypto.timingSafeEqual(keyBuf, derivedBuf);
  } catch {
    return false;
  }
}

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  role: "ADMIN" | "SALES" | "WAREHOUSE";
  iat?: number;
  exp: number;
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(input: string): string {
  const padLen = (4 - (input.length % 4)) % 4;
  const padded = input.replace(/-/g, "+").replace(/\//g, "/") + "=".repeat(padLen);
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLen), "base64").toString("utf8");
}

export function signJwt(
  payload: Omit<JwtPayload, "exp" | "iat">,
  expiresInSeconds = 60 * 60 * 12 // 12 giờ phiên làm việc chuẩn bảo mật nội bộ
): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const fullPayload: JwtPayload = {
    ...payload,
    iat: nowSec,
    exp: nowSec + expiresInSeconds,
  };
  const body = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${body}`)
    .digest();
  return `${header}.${body}.${base64UrlEncode(signature)}`;
}

export function verifyJwt(token: string): JwtPayload | null {
  try {
    if (!token || token.length > 2048) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, bodyB64, sig] = parts;
    if (!headerB64 || !bodyB64 || !sig) return null;

    // Enforce strict HS256 header to block alg:none or algorithm confusion attacks
    const parsedHeader = JSON.parse(base64UrlDecode(headerB64)) as {
      alg?: string;
      typ?: string;
    };
    if (parsedHeader.alg !== "HS256") {
      return null;
    }

    const expectedSig = base64UrlEncode(
      crypto
        .createHmac("sha256", JWT_SECRET)
        .update(`${headerB64}.${bodyB64}`)
        .digest()
    );
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const decoded = JSON.parse(base64UrlDecode(bodyB64)) as JwtPayload;
    const nowSec = Math.floor(Date.now() / 1000);
    if (!decoded.sub || !decoded.exp || decoded.exp < nowSec) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}
