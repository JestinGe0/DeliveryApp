# ── Stage 1: build native modules (bcrypt, sqlite3) ─────────────────────────
FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /build
COPY server/package*.json ./
RUN npm ci --omit=dev

# ── Stage 2: runtime image ───────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Compiled node_modules from builder stage
COPY --from=builder /build/node_modules ./server/node_modules

# Server source
COPY server/server.js   ./server/
COPY server/auth.js     ./server/
COPY server/email.js    ./server/
COPY server/logger.js   ./server/
COPY server/backup.js   ./server/
COPY server/migrate.js  ./server/
COPY server/validate.js ./server/
COPY server/route-controller.js ./server/
COPY server/generate-cert.js    ./server/
COPY server/package.json        ./server/

# Static files served from project root
COPY index.html                  ./
COPY customer-passport-modal.html ./
COPY styles.css                  ./
COPY js/                         ./js/

# Persistent directories (overridden by volume mounts at runtime)
RUN mkdir -p server/data server/certs logs

COPY docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000 3443

ENTRYPOINT ["docker-entrypoint.sh"]
