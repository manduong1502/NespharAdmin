# ==============================================================================
# NESPHAR Pharma Core — Hardened Multi-Stage Production Dockerfile
# Runs as non-root `node` user (UID 1000) with SQLite WAL + Static Admin SPA
# ==============================================================================

# --- Stage 1: Build Web Admin SPA ---
FROM node:22-bookworm-slim AS web-admin-builder
WORKDIR /build/web-admin
COPY web-admin/package*.json ./
RUN npm ci
COPY web-admin/ ./
RUN npm run build

# --- Stage 2: Build Backend TypeScript ---
FROM node:22-bookworm-slim AS backend-builder
WORKDIR /build/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# --- Stage 3: Hardened Non-Root Production Runtime ---
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV TZ=Asia/Ho_Chi_Minh
ENV PORT=4000
ENV DATA_DIR=/app/backend/data
ENV UPLOADS_DIR=/app/backend/uploads
ENV WEB_ADMIN_DIST=/app/web-admin/dist

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    sqlite3 \
    tzdata \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=backend-builder /build/backend/dist ./dist
COPY backend/assets ./assets
COPY --from=web-admin-builder /build/web-admin/dist /app/web-admin/dist

RUN mkdir -p /app/backend/data /app/backend/uploads/media /app/backend/uploads/docs \
  && chown -R node:node /app

USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:4000/api/v1/health || exit 1

CMD ["node", "--no-warnings", "dist/server.js"]
