#!/bin/bash
# scripts/gen-certs.sh
#
# Generates locally-trusted SSL certificates for development using mkcert.
# mkcert creates a local CA and installs it in your system trust store so
# browsers trust the certs without warnings.
#
# Run once before starting docker compose:
#   chmod +x scripts/gen-certs.sh
#   ./scripts/gen-certs.sh
#
# For production: replace cert.pem and key.pem with your real certs
# (Let's Encrypt via certbot, or your domain registrar).

set -e

echo "=== Checking for mkcert... ==="

if ! command -v mkcert &> /dev/null; then
  echo ""
  echo "mkcert not found. Install it first:"
  echo ""
  echo "  macOS:   brew install mkcert"
  echo "  Ubuntu:  sudo apt install mkcert"
  echo "  Windows: choco install mkcert"
  echo ""
  exit 1
fi

echo "mkcert found: $(mkcert --version)"

# ── Install local CA (one-time, system-wide) ──────────────────────────────────
echo ""
echo "=== Installing local CA (may prompt for password)... ==="
mkcert -install

# ── Generate certs ────────────────────────────────────────────────────────────
echo ""
echo "=== Generating certificates... ==="

mkdir -p nginx/ssl
mkdir -p coturn/ssl

# Detect local IP for LAN testing
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")
echo "Detected local IP: $LOCAL_IP"

# Generate cert covering localhost + LAN IP + common aliases
# The cert is placed in nginx/ssl/ — the nginx container mounts this directory
mkcert \
  -cert-file nginx/ssl/cert.pem \
  -key-file  nginx/ssl/key.pem \
  localhost \
  "127.0.0.1" \
  "192.168.31.99" \
  "::1"

echo ""
echo "✅ Certificates generated:"
echo "   nginx/ssl/cert.pem"
echo "   nginx/ssl/key.pem"

# Copy same certs for coturn (TURNS needs TLS too)
cp nginx/ssl/cert.pem coturn/ssl/cert.pem
cp nginx/ssl/key.pem  coturn/ssl/key.pem
echo "   coturn/ssl/cert.pem  (copied)"
echo "   coturn/ssl/key.pem   (copied)"

echo ""
echo "=== Cert details ==="
openssl x509 -in nginx/ssl/cert.pem -noout -text | grep -E "Subject:|DNS:|IP:"

echo ""
echo "Next steps:"
echo "  1. Copy .env.example to .env and fill in your values"
echo "  2. docker compose up -d"
echo "  3. Open https://localhost in your browser"