import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express from "express";
import { db, initSchema, nowIsoLocal, UPLOADS_DIR } from "./db/database";
import { seedInitialData } from "./db/seed";
import {
  createRateLimiter,
  securityHeadersMiddleware,
} from "./middleware/securityShield";
import { adminRouter } from "./routes/adminRoutes";
import { miniappRouter } from "./routes/miniappRoutes";
import { webhookRouter } from "./routes/webhookRoutes";

initSchema();
seedInitialData();

const app = express();
const PORT = Number(process.env.PORT || 4000);

// Security: Disable Express fingerprint & only trust X-Forwarded-For from local reverse proxies (Nginx / Cloudflared / Docker)
app.disable("x-powered-by");
app.set("trust proxy", "loopback, linklocal, uniquelocal");

// Security Headers (CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Permissions-Policy)
app.use(securityHeadersMiddleware);

// Optional CORS allowlist in production (CORS_ORIGINS=https://h5.zdn.vn,https://api.nesphar.vn)
const rawOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || rawOrigins.length === 0) {
        cb(null, true);
        return;
      }
      if (
        rawOrigins.includes(origin) ||
        origin.endsWith(".zdn.vn") ||
        origin.endsWith(".zalo.me")
      ) {
        cb(null, true);
        return;
      }
      cb(new Error("Origin không nằm trong danh sách cho phép (CORS)."));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    maxAge: 86400,
  })
);

// Anti-DoS payload bounds (uploads use multipart Multer separately; JSON payloads capped at 256KB)
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: false, limit: "128kb", parameterLimit: 100 }));

// Hardened static serving for /uploads (sandboxed CSP prevents stored XSS even if opened directly)
app.use(
  "/uploads",
  express.static(UPLOADS_DIR, {
    maxAge: "7d",
    dotfiles: "deny",
    index: false,
    setHeaders: (res, filePath) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox"
      );
      if (filePath.endsWith(".pdf")) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "inline");
      }
    },
  })
);

// Global API Layer-7 Rate Limiter (240 requests / 60s / IP)
const globalApiLimiter = createRateLimiter({
  prefix: "api-global",
  windowMs: 60_000,
  maxRequests: 240,
  errorMessage:
    "Phát hiện lưu lượng truy cập bất thường từ IP này. Vui lòng thử lại sau ít giây.",
});
app.use("/api/", globalApiLimiter);

app.get("/api/v1/health", (_req, res) => {
  const prodCount = db
    .prepare(`SELECT COUNT(*) AS cnt FROM products`)
    .get() as { cnt: number };
  const orderCount = db
    .prepare(`SELECT COUNT(*) AS cnt FROM orders`)
    .get() as { cnt: number };

  res.json({
    status: "ok",
    service: "nesphar-pharma-core",
    company: "CÔNG TY TNHH DƯỢC PHẨM NESPHAR",
    miniAppId: "1283290697529026891",
    sqliteMode: "WAL",
    products: prodCount.cnt,
    orders: orderCount.cnt,
    serverTime: nowIsoLocal(),
    uptimeSeconds: Math.round(process.uptime()),
  });
});

app.use("/api/v1/miniapp", miniappRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/webhooks", webhookRouter);

// Catch unmatched /api/* routes cleanly with 404 JSON instead of falling through to SPA HTML
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Đường dẫn API không tồn tại." });
});

// Serve built Web Admin SPA dynamically when present (Ubuntu Mini Server single-port mode)
const candidateDistDirs = [
  process.env.WEB_ADMIN_DIST || "",
  path.resolve(__dirname, "../../web-admin/dist"),
  path.resolve(__dirname, "../public"),
].filter(Boolean);

function findActiveDistDir(): string | undefined {
  return candidateDistDirs.find((dir) => fs.existsSync(path.join(dir, "index.html")));
}

app.use((req, res, next) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/uploads/")) {
    next();
    return;
  }
  const distDir = findActiveDistDir();
  if (!distDir) {
    next();
    return;
  }
  express.static(distDir, { maxAge: "1h", dotfiles: "deny" })(req, res, () => {
    res.sendFile(path.join(distDir, "index.html"));
  });
});

app.use(
  (
    err: Error & { status?: number; type?: string },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    if (err.type === "entity.too.large") {
      res.status(413).json({ error: "Dữ liệu gửi lên vượt quá giới hạn cho phép." });
      return;
    }
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: "Cú pháp dữ liệu JSON không hợp lệ." });
      return;
    }
    console.error("[NESPHAR API Error]:", err.message);
    res.status(err.status || 500).json({
      error:
        process.env.NODE_ENV === "production"
          ? "Hệ thống đang xử lý, vui lòng thử lại sau."
          : err.message || "Lỗi hệ thống máy chủ nội bộ.",
    });
  }
);

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `[NESPHAR Server] Running on http://0.0.0.0:${PORT} | Uploads: ${UPLOADS_DIR} | Admin SPA: ${
      findActiveDistDir() || "dev-proxy / dynamic"
    }`
  );
});

// Anti-Slowloris & R-U-Dead-Yet HTTP socket timeouts
server.keepAliveTimeout = 5_000;
server.headersTimeout = 15_000;
server.requestTimeout = 30_000;

// Graceful WAL checkpoint & clean SQLite shutdown on Docker / Ubuntu reboot
function gracefulShutdown(signal: string) {
  console.log(`[NESPHAR Server] Received ${signal}. Flushing SQLite WAL & closing cleanly...`);
  server.close(() => {
    try {
      db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
      db.close();
    } catch {
      // already closed
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5_000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
