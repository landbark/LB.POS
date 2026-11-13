#!/usr/bin/env bash
# Deploy to Cloudflare Workers (pos.landbark.app)
#
# Wraps `npm run deploy:worker` so the Cloudflare token is read from the macOS
# keychain automatically instead of being exported by hand every time.
#
# Two mistakes this exists to prevent:
#   - forgetting the token export, which makes wrangler fail partway through
#   - running `npm run deploy`, which dies while populating the R2 cache;
#     deploy:worker skips that step
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  CLOUDFLARE_API_TOKEN=$(security find-generic-password -s cloudflare-armmani -w 2>/dev/null || true)
  export CLOUDFLARE_API_TOKEN
fi

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "ไม่พบ Cloudflare token ใน keychain (service: cloudflare-armmani)" >&2
  echo "เพิ่มด้วย: security add-generic-password -s cloudflare-armmani -a arm.maniii -w <token>" >&2
  exit 1
fi

echo "Deploying to Cloudflare Workers (account arm.maniii)..."
exec npm run deploy:worker
