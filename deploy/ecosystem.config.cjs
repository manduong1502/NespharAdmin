// =============================================================================
// PM2 Ecosystem Config (Dành cho cài đặt trực tiếp trên Ubuntu không dùng Docker)
// Yêu cầu: Node.js >= 22.5.0 & PM2 (`sudo npm install -g pm2`)
// Khởi chạy: pm2 start deploy/ecosystem.config.cjs && pm2 save
// =============================================================================

const path = require("path");
const rootDir = path.resolve(__dirname, "..");

module.exports = {
  apps: [
    {
      name: "nesphar-pharma-core",
      cwd: path.join(rootDir, "backend"),
      script: "dist/server.js",
      node_args: "--no-warnings",
      instances: 1, // Giữ 1 tiến trình ghi chính cho SQLite WAL để tránh tranh chấp lock
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        TZ: "Asia/Ho_Chi_Minh",
        PORT: 4000,
        DATA_DIR: path.join(rootDir, "backend", "data"),
        UPLOADS_DIR: path.join(rootDir, "backend", "uploads"),
        WEB_ADMIN_DIST: path.join(rootDir, "web-admin", "dist"),
      },
    },
  ],
};
