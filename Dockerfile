# syntax=docker/dockerfile:1

# LANDBARK POS — image สำหรับรันบน VPS เอง (แทน Vercel)
#
# แบ่งเป็น 3 ชั้นเพื่อให้ image สุดท้ายเล็ก: ชั้น deps กับ builder มี node_modules
# ครบทั้งกอง (รวม devDependencies) แต่ไม่ถูกก๊อปไปชั้นที่รันจริง

FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1

# ---------- ติดตั้ง dependency ----------
FROM base AS deps
WORKDIR /app
# ก๊อปแค่ 2 ไฟล์นี้ก่อน — แก้โค้ดแล้ว Docker จะได้ไม่ต้อง npm ci ใหม่ทุกครั้ง
COPY package.json package-lock.json ./
RUN npm ci

# ---------- build ----------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* ถูกฝังลงบันเดิลฝั่งเบราว์เซอร์ตั้งแต่ตอน build ไม่ได้อ่านตอนรัน
# ถ้าไม่ส่งเข้ามาตรงนี้ หน้าเว็บจะได้ undefined แล้วล็อกอินไม่ได้ทั้งระบบ
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_LIFF_ID
ARG NEXT_PUBLIC_TELEGRAM_BOT_USERNAME

# /api/favicon ตั้ง revalidate ไว้ Next เลย prerender ตั้งแต่ตอน build แล้วไปอ่านโลโก้ร้านจาก
# Supabase ด้วย service role — ไม่ส่ง key เข้ามาตรงนี้ build จะล้มที่หน้านั้น
# (key อยู่แค่ชั้น builder ไม่ถูกก๊อปไปชั้นที่รันจริง จึงไม่ติดไปกับ image)
ARG SUPABASE_SERVICE_ROLE_KEY

ENV SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_LIFF_ID=$NEXT_PUBLIC_LIFF_ID \
    NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=$NEXT_PUBLIC_TELEGRAM_BOT_USERNAME

# สวิตช์ที่บอก next.config.ts ให้ build แบบ standalone
ENV DOCKER_BUILD=1
RUN npm run build

# ---------- รันจริง ----------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# sharp (ตัวย่อรูปของ next/image) จองหน่วยความจำเกินจำเป็นบน glibc ถ้าไม่จำกัดจำนวน arena
ENV MALLOC_ARENA_MAX=2

# ไม่รันด้วย root — หลุดมาได้ก็ยังแตะไฟล์ระบบไม่ได้
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# standalone ไม่ลาก public/ กับ .next/static มาให้เอง ต้องก๊อปเพิ่มเองสองก้อนนี้
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000 \
    HOSTNAME=0.0.0.0

# เวลาเครื่องเป็น UTC เหมือนตอนอยู่ Vercel — โค้ดคิดวันไทยเองผ่าน lib/thaiDate.ts
# (อย่าตั้ง TZ=Asia/Bangkok เพราะ cron ด้านล่างอิง UTC และ dedupeKey ของ notify ก็อิงวันไทยอยู่แล้ว)
CMD ["node", "server.js"]
