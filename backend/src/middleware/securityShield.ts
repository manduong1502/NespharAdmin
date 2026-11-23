import { NextFunction, Request, Response } from "express";

interface BucketEntry {
  count: number;
  resetAt: number;
}

const MAX_TRACKED_KEYS = 10_000;

class BoundedRateStore {
  private map = new Map<string, BucketEntry>();

  constructor() {
    // Periodic cleanup every 2 minutes (.unref() so it never blocks graceful shutdown)
    const timer = setInterval(() => this.sweep(), 120_000);
    timer.unref();
  }

  public hit(key: string, windowMs: number): BucketEntry {
    const now = Date.now();
    const existing = this.map.get(key);
    if (existing && existing.resetAt > now) {
      existing.count += 1;
      return existing;
    }

    // Memory cap defense against spoofed-IP DDoS floods on Ubuntu Mini Server
    if (this.map.size >= MAX_TRACKED_KEYS) {
      this.sweep();
      if (this.map.size >= MAX_TRACKED_KEYS) {
        const oldestKey = this.map.keys().next().value;
        if (oldestKey) this.map.delete(oldestKey);
      }
    }

    const fresh: BucketEntry = { count: 1, resetAt: now + windowMs };
    this.map.set(key, fresh);
    return fresh;
  }

  public reset(key: string): void {
    this.map.delete(key);
  }

  public get(key: string): BucketEntry | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.resetAt <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return entry;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [k, v] of this.map.entries()) {
      if (v.resetAt <= now) {
        this.map.delete(k);
      }
    }
  }
}

const globalRateStore = new BoundedRateStore();
export const loginFailureStore = new BoundedRateStore();

export function getClientIp(req: Request): string {
  // Relies on Express safe 'trust proxy' ('loopback, linklocal, uniquelocal')
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function createRateLimiter(options: {
  prefix: string;
  windowMs: number;
  maxRequests: number;
  errorMessage: string;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = getClientIp(req);
    const key = `${options.prefix}:${ip}`;
    const entry = globalRateStore.hit(key, options.windowMs);

    const remaining = Math.max(0, options.maxRequests - entry.count);
    const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000));

    res.setHeader("X-RateLimit-Limit", String(options.maxRequests));
    res.setHeader("X-RateLimit-Remaining", String(remaining));

    if (entry.count > options.maxRequests) {
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        error: options.errorMessage,
        retryAfterSeconds: retryAfterSec,
      });
      return;
    }

    next();
  };
}

export function securityHeadersMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );

  const isHttps =
    req.secure ||
    String(req.headers["x-forwarded-proto"] || "")
      .toLowerCase()
      .startsWith("https");
  if (isHttps) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  // Content Security Policy for Web Admin SPA HTML responses
  if (!req.path.startsWith("/api/") && !req.path.startsWith("/uploads/")) {
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' https://static.cloudflareinsights.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' https:",
        "frame-ancestors 'self'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; ")
    );
  }

  next();
}

/**
 * Inspects actual file header magic bytes to block disguised HTML/SVG/EXE polyglots.
 */
export function verifyFileMagicBytes(
  buf: Buffer,
  expectedFolder: "media" | "docs"
): boolean {
  if (!buf || buf.length < 8) return false;

  // JPEG: FF D8 FF
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a;
  // WebP: "RIFF" .... "WEBP"
  const isWebp =
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP";
  // PDF: "%PDF-"
  const isPdf = buf.subarray(0, 5).toString("ascii") === "%PDF-";

  if (expectedFolder === "docs") {
    return isPdf || isJpeg || isPng || isWebp;
  }
  return isJpeg || isPng || isWebp;
}
