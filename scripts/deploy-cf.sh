#!/usr/bin/env bash
# Deploy to Cloudflare Workers (pos.landbark.app)
#
# `npm run deploy` and `npm run deploy:worker` both point here, so the Cloudflare
# token is read from the macOS keychain automatically instead of being exported
# by hand every time.
#
# Two mistakes this exists to prevent:
#   - forgetting the token export: wrangler then falls back to the OAuth login on
#     this Mac (joodfangkhem, the JFK account) and dies with
#     "Authentication error [code: 10000]" after the whole build has run
#   - the plain `opennextjs-cloudflare deploy` path, which dies while populating
#     the R2 cache; this skips that step (it is still there as deploy:cache)
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

# รันคำสั่งจริงตรงนี้ ไม่เรียก npm run deploy:worker กลับ — สคริปต์นี้คือตัวที่ deploy:worker ชี้มา
npx opennextjs-cloudflare build
OPEN_NEXT_DEPLOY=true exec npx wrangler deploy
