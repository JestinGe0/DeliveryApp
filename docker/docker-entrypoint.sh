#!/bin/sh
set -e

CERT_KEY=/app/server/certs/server.key
CERT_CRT=/app/server/certs/server.cert

# Auto-generate self-signed TLS cert on first run if HTTPS is enabled
if [ "${HTTPS_ENABLED}" = "true" ]; then
    if [ ! -f "$CERT_KEY" ] || [ ! -f "$CERT_CRT" ]; then
        echo "[entrypoint] Generating self-signed TLS certificate..."
        node /app/server/generate-cert.js
    else
        echo "[entrypoint] TLS certificate already exists — skipping generation."
    fi
fi

exec node /app/server/server.js
