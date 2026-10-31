# ย้าย POS ขึ้น Cloudflare Workers

แผนหลักของการ hosting ตั้งแต่ 30 ต.ค. 2026 — `docs/deploy-vps.md` เก็บไว้เป็นแผนสำรอง

ตัวเว็บรันผ่าน **`@opennextjs/cloudflare`** (adapter ตัวเดียวกับที่ `jfk` ใช้อยู่จริง)
ส่วนตารางเวลาแยกเป็น worker ของตัวเองใน `workers/cron/` — เหตุผลอยู่ในหัวข้อ "ตารางเวลา"

## บัญชีที่ต้องใช้ — ห้ามพลาดข้อนี้

| บัญชี | account id | แพลน | ใช้กับ |
|---|---|---|---|
| `arm.maniii@gmail.com` | `804de54b064396831bb303d9b7dd9b49` | **Workers Paid $5** | **POS และที่เหลือทั้งหมด** |
| `joodfangkhem@gmail.com` | `b2b4963d5c312a0eb5796b29153bf6fc` | Free | `jfk` เท่านั้น |

`account_id` ถูกตรึงไว้ใน `wrangler.jsonc` ทั้งสองไฟล์แล้ว เพราะเผลอ deploy ขึ้นบัญชีฟรี
จะไปชนเพดาน **CPU 10 ms ต่อ request** (POS ใช้เฉลี่ย ~37 ms) แล้วพังเป็น Error 1027 โดยหาสาเหตุยาก

⚠️ `wrangler login` บนเครื่องนี้ผูกกับ **joodfangkhem** อยู่ (ใช้ deploy `jfk`) การ login ใหม่
จะทับของเดิม — ให้ใช้ **API token ของบัญชี arm.maniii** แทน แล้ว export ก่อน deploy:

```sh
export CLOUDFLARE_API_TOKEN="$(security find-generic-password -s cloudflare-armmani -w)"
```

สร้าง token ได้ที่ My Profile → API Tokens → เทมเพลต **Edit Cloudflare Workers**
(ต้องมีสิทธิ์ Workers Scripts:Edit + Workers R2 Storage:Edit)

## ขั้นตอนตั้งครั้งแรก

```sh
npx wrangler r2 bucket create landbark-pos-cache
```

ตั้ง secret ทีละตัว (ค่าดึงจาก Vercel → Project Settings → Environment Variables):

```sh
for k in SUPABASE_SERVICE_ROLE_KEY TELEGRAM_BOT_TOKEN TELEGRAM_WEBHOOK_SECRET \
         LINE_LOGIN_CHANNEL_ID LINE_LOGIN_CHANNEL_SECRET LINE_LIFF_CHANNEL_ID \
         CUSTOMER_SESSION_SECRET CRON_SECRET; do npx wrangler secret put "$k"; done
```

ส่วนค่าที่ขึ้นต้นด้วย `NEXT_PUBLIC_` ถูกฝังตอน build ไม่ใช่ตอนรัน จึงต้องอยู่ใน `.env`
ของเครื่องที่สั่ง build (หรือใน Workers Builds ถ้าย้ายไป build บน Cloudflare)

## deploy

```sh
npm run deploy
```

ครั้งแรกจะได้ `https://landbark-pos.<subdomain>.workers.dev` — **ร้านยังขายของผ่าน Vercel อยู่**
`wrangler.jsonc` ตั้ง `workers_dev: true` และยังไม่มี `routes` ไว้ตั้งใจ

## ตารางเวลา (แทน `crons` ใน vercel.json)

Cron Trigger ของ Cloudflare ต้องการ handler ชื่อ `scheduled` ซึ่ง worker ที่ OpenNext สร้างให้ไม่มี
จะเพิ่มต้องเขียน entry ครอบทับของ adapter — พลาดแล้วคือทั้งร้านล่ม ไม่ใช่แค่แจ้งเตือนไม่เข้า
`workers/cron/` จึงเป็น worker เปล่า ๆ ที่ยิง HTTPS เข้าเว็บเหมือนที่ Vercel Cron ทำอยู่ทุกวันนี้

⛔ **ห้าม deploy worker ตัวนี้ก่อนลบ `crons` ออกจาก `vercel.json`** — สองฝั่งจะยิงงานเดียวกัน
วันละสองรอบ `expireStaleOrders()` จะวิ่งซ้ำและแจ้งเตือนจะเข้าซ้ำ ให้ทำพร้อมกันตอนย้ายโดเมน

```sh
cd workers/cron
npx wrangler secret put CRON_SECRET     # ค่าเดียวกับฝั่งเว็บ (อยู่ใน .env.cloudflare)
npx wrangler deploy
```

แก้ `vars.POS_URL` ใน `workers/cron/wrangler.jsonc` ให้ชี้โดเมนจริงตอนย้ายโดเมนแล้ว

## ต้องพิสูจน์ให้ได้ก่อนย้ายโดเมน (ผ่านครบแล้ว 31 ต.ค. — เก็บไว้ใช้กับโปรเจกต์ถัดไป)

- [ ] **worker ส่ง Telegram ออกได้จริง** — ยังไม่เคยมีข้อความไหนออกจาก workerd สำเร็จสักครั้ง
      token ตรวจด้วย `getMe` แล้วใช้ได้ แต่คนละเรื่องกับการส่งออกจาก worker
      วิธีที่ตรงที่สุด: ล็อกอินเป็น admin บน URL ของ Cloudflare → `/admin/notifications` → **ส่งทดสอบ**
      (ยิง `POST /api/notify/test` ซึ่งไม่มี dedupe จึงส่งจริงทุกครั้ง)
      ⚠️ ปุ่มเดียวกันบนเว็บ Vercel หน้าตาเหมือนกันเป๊ะ แต่พิสูจน์คนละฝั่ง ดูให้แน่ว่าอยู่โดเมนไหน
- [ ] **หน้า `/pos` เร็วพอ** — ดูหัวข้อความเร็วข้างล่าง
- [ ] **LINE Login** — ต้องเพิ่ม Callback URL ของโดเมนใหม่ใน LINE Developers ก่อน
      ไม่งั้น LINE จะปฏิเสธตอน redirect กลับ (ฝั่งเราเด้งไป LINE ถูกแล้ว ตรวจเมื่อ 30 ต.ค.)

### Supabase Auth — อาการที่หลอกคนมาแล้วหนึ่งรอบ

ล็อกอิน Google บนโดเมนใหม่แล้ว **เด้งไปโผล่เว็บ Vercel** ทั้งที่โค้ดเราใช้ origin ของ request ทุกจุด
เพราะ Supabase เทียบ `redirectTo` กับ allow-list ก่อน ถ้าไม่ตรง มัน**ไม่ฟ้อง error แต่ใช้ Site URL แทน**
ซึ่งตั้งเป็นโดเมน Vercel ไว้ ผลคือล็อกอินผ่านแต่ไปอยู่ผิดเว็บโดยไม่รู้ตัว

แก้ที่ Authentication → URL Configuration → **Redirect URLs** (เพิ่มเข้าไป ห้ามแก้ Site URL
ตราบใดที่ Vercel ยังขายของอยู่) เพิ่ม `https://landbark-pos.arm-maniii.workers.dev/**` ไปแล้ว 30 ต.ค.
วันย้ายโดเมนจริงต้องเพิ่มของโดเมนจริงด้วย แล้วค่อยเปลี่ยน Site URL ตอนตัด Vercel ทิ้ง

## โดเมนจริง — `landbark.app`

**`landbark.com` ซื้อไม่ได้** จดตั้งแต่ 2008 และมีเว็บโรงเรียนฝึกสุนัข
"Landbark | Distinguishing Dog Training" ใช้งานอยู่จริง ไม่ใช่โดเมนจอดขาย

เลือก **`landbark.app`** เมื่อ 31 ต.ค. 2026 (renew $14.20/ปี) เพราะถูกกว่า `.me` ($16.56)
และ `.shop` ($30) **และ `.app` ทั้ง TLD อยู่ใน HSTS preload list** → เบราว์เซอร์ปฏิเสธ `http://`
ตั้งแต่ก่อนยิง request ไม่ใช่ redirect ทีหลัง ซึ่งมีค่ากับ POS ที่มีล็อกอินพนักงานวิ่งอยู่บน WiFi ร้าน

```
pos.landbark.app   ← ระบบขาย (worker ตัวนี้)
landbark.app       ← เผื่อหน้าร้านลูกค้าในอนาคต
```

**ต้องจดในบัญชี `arm.maniii@gmail.com`** (บัญชีที่ซื้อ Workers Paid ไว้) ไม่งั้นผูก custom domain
ข้ามบัญชีไม่ได้ และ Cloudflare **ไม่มีปุ่มย้าย zone ข้ามบัญชี** ต้องลบแล้วจดใหม่

## ย้ายเสร็จแล้ว — 31 ต.ค. 2026

| โดเมน | ใคร | เปิดมาเจอ |
|---|---|---|
| `pos.landbark.app` | พนักงาน | หน้างานตาม role (`homePath`) |
| `landbark.app` · `www.landbark.app` | ลูกค้า | หน้าร้าน |
| `landbarkpos.vercel.app` | ของเดิม | **ส่งต่ออย่างเดียว** ไม่เสิร์ฟอะไรแล้ว |
| `landbark-pos.*.workers.dev` | — | ปิดแล้ว |

ที่ตั้งไว้: Telegram webhook ชี้ `pos.landbark.app` · cron ย้ายมา `workers/cron/` (ตั้ง `CRON_SECRET`
แยกเอง **`wrangler deploy` ไม่พา secret มาให้**) · Supabase Site URL + Redirect URLs ครบ ·
LINE callback 4 โดเมน · `NEXT_PUBLIC_SITE_URL` เป็น var ใช้เฉพาะลิงก์ใน Telegram

⚠️ **`siteOrigin()` ใน `src/lib/line-login.ts` ต้องใช้ origin ของ request เท่านั้น** ห้ามตรึงด้วย
`NEXT_PUBLIC_SITE_URL` อีก — worker ตัวเดียวเสิร์ฟทั้งโดเมนลูกค้าและโดเมนพนักงาน ถ้าตรึงไว้
ลูกค้าที่ล็อกอิน LINE จากหน้าร้านจะถูกพาไปโผล่โดเมน POS

### `vercel.json` เหลือหน้าที่เดียว: ส่งต่อ

ไม่ได้ลบโปรเจกต์ทิ้ง เพราะเครื่องในร้านที่ยังไม่เปลี่ยน URL จะขายไม่ได้ทันที
ตอนนี้มันตอบ 307 ไปโดเมนใหม่แทน — เครื่องเก่ายังใช้งานได้ และไม่มีเว็บสองชุดวิ่งพร้อมกัน
เส้นทางงาน (`/pos` `/admin/*` `/login` `/`) → `pos.landbark.app` · ที่เหลือ → `landbark.app`

ลบโปรเจกต์ Vercel จริงได้เมื่อ log ยืนยันว่าไม่มีใครยิงเข้ามาอีกแล้ว

### งานที่เหลือและยากที่สุด: ไล่เครื่องในร้าน — PWA ผูกกับ origin

เครื่องที่ **ติดตั้ง LANDBARK POS ไว้บนโฮมสกรีน** จะยังเปิด `landbarkpos.vercel.app` ต่อไป
เพราะ `start_url: '/'` ใน `src/app/manifest.ts` เป็น path เทียบกับ origin ที่ติดตั้ง ไม่ใช่โดเมนใหม่
**ไอคอนเดิมใช้ไม่ได้ ต้องลบแล้วติดตั้งใหม่ทุกเครื่อง** — ไม่มีทางสั่งให้มันย้ายเอง

ที่ตามมาด้วย:
- bookmark ทุกเครื่องต้องแก้
- cookie session ผูกกับโดเมน → **ทุกคนถูกเตะออกจากระบบ ต้องล็อกอินใหม่หมด**
- `public/sw.js` ไม่แคชอะไรเลยโดยตั้งใจ ข้อนี้จึงไม่มีปัญหาเนื้อหาค้างรุ่นเก่า โชคดีไป

**อันตรายที่ซ่อนอยู่:** ถ้าปิด Vercel (ขั้น 10) ก่อนไล่เครื่องครบ เครื่องที่ยังไม่ย้ายจะ**ขายไม่ได้ทันที**
ให้ปล่อย Vercel ค้างไว้อีกสักพักหลังย้ายเสร็จ แล้วเช็ก log ว่าไม่มีใครยิงเข้าโดเมนเก่าแล้วจริง ๆ ก่อนปิด
(ดูวิธีดู log ย้อนหลังในบันทึกความจำ `project-hosting-cloudflare`)

## ที่ตรวจไปแล้ว (30 ต.ค. 2026)

- `opennextjs-cloudflare build` ผ่าน (ต้องอัป Next เป็น **16.4.2** — adapter กำหนด peer `>=16.4.1`)
- รันบน workerd ในเครื่อง: `/` `/login` `/shop` `/manifest.webmanifest` `/api/favicon` ตอบ 200
  และ `/pos` เด้ง 307 ไป `/login` → **`proxy.ts` คุยกับ Supabase Auth บน Workers ได้จริง**
- build เตือนว่า Node.js middleware ยัง experimental บน Cloudflare — `jfk` เจอเตือนเดียวกันและรันอยู่
