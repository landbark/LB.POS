# ย้าย LANDBARK POS จาก Vercel ไปรันบน VPS

ทำไมถึงย้าย: Vercel Hobby ห้ามใช้เชิงพาณิชย์ และระบบนี้มีร้านขายของออนไลน์อยู่ด้วย
ส่วน Vercel Pro คือ $20/เดือน แพงเกินเหตุสำหรับร้านเดียว — VPS ตัวละ ~$5 จบ
และยังรันเว็บตัวอื่นของร้านบนเครื่องเดียวกันได้อีก

ทำไมไม่ใช่ Cloudflare Workers: free tier จำกัด CPU 10 ms ต่อ request ซึ่งเรนเดอร์หน้า
Next ไม่ทัน (ต้องขึ้นแผน $5 อยู่ดี) แถม `src/proxy.ts` ที่คุมสิทธิ์ทั้งระบบยังอยู่ในสถานะ
experimental บน adapter ของ Cloudflare — เสี่ยงเกินไปสำหรับระบบที่ร้านใช้ขายของทุกวัน

บนเครื่อง Node ธรรมดาแบบนี้ Next รองรับครบทุกฟีเจอร์ ไม่ต้องแก้โค้ดสักบรรทัด

---

## 1. เตรียม VPS

เอาโซน **สิงคโปร์** เท่านั้น เพราะ Supabase ของร้านอยู่สิงคโปร์ (`sin1` เดิมบน Vercel ก็ตั้งไว้แบบนั้น)
อยู่ไกลกว่านี้ทุก query จะช้าลงทั้งระบบ

- สเปกขั้นต่ำ: **1 vCPU / 1 GB RAM / 25 GB SSD** (ราว $5/เดือน)
- ถ้าจะเอา gaiseedvu มารันด้วยในอนาคต ขยับเป็น 2 GB RAM จะสบายกว่า
- เจ้าที่มีโซนสิงคโปร์: DigitalOcean, Vultr, Linode

ติดตั้ง Docker บนเครื่อง (Ubuntu 24.04):

```bash
curl -fsSL https://get.docker.com | sh
```

เปิดไฟร์วอลล์เฉพาะที่จำเป็น:

```bash
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable
```

เปิดอัปเดตความปลอดภัยอัตโนมัติ (จะได้ไม่ต้องคอยตามแพตช์เอง):

```bash
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
```

## 2. ชี้ DNS

สร้าง A record ของโดเมนที่จะใช้ ชี้มาที่ IP ของ VPS

> ทำขั้นตอนนี้ **ก่อน** `docker compose up` เพราะ Caddy ต้องใช้โดเมนที่ชี้มาถูกแล้ว
> ในการขอใบ HTTPS จาก Let's Encrypt

ถ้ายังไม่อยากตัดโดเมนจริง ให้ใช้ซับโดเมนทดสอบก่อน เช่น `new.pos.example.com`
แล้วค่อยสลับตัวจริงตอนมั่นใจ — **ระหว่างนี้ Vercel ยังเสิร์ฟของเดิมอยู่ ร้านขายของได้ตามปกติ**

## 3. ดึงโค้ดและใส่ค่า env

```bash
git clone https://github.com/landbark/LB.POS.git
cd LB.POS
cp .env.example .env
nano .env
```

ค่าทั้งหมดก๊อปมาจาก Vercel ได้ที่ **Project Settings → Environment Variables**
อย่าลืมตั้ง `DOMAIN` กับ `NEXT_PUBLIC_SITE_URL` ให้เป็นโดเมนใหม่

## 4. รัน

```bash
docker compose up -d --build
```

ครั้งแรก build ราว 3-5 นาที เสร็จแล้วเปิดโดเมนได้เลย Caddy จัดการ HTTPS ให้เอง

ดู log:

```bash
docker compose logs -f app
```

## 5. ตั้ง cron สองตัว

เดิม Vercel ยิงให้ตาม `vercel.json` ย้ายมาแล้วใช้ crontab ของเครื่องแทน
**route เช็ค `Authorization: Bearer $CRON_SECRET` อยู่แล้ว ไม่ต้องแก้โค้ด**

`crontab -e` แล้วใส่ (ใช้ค่า `CRON_SECRET` เดียวกับใน `.env`):

```cron
0 1  * * * curl -fsS -H "Authorization: Bearer ใส่CRON_SECRET" https://โดเมนของคุณ/api/cron/stock-alerts  > /dev/null
0 13 * * * curl -fsS -H "Authorization: Bearer ใส่CRON_SECRET" https://โดเมนของคุณ/api/cron/daily-summary > /dev/null
```

> เวลาเป็น **UTC** เหมือนที่ Vercel ใช้ — `0 1` = 08:00 น. และ `0 13` = 20:00 น. เวลาไทย
> ถ้าเครื่องตั้งโซนเวลาเป็นอย่างอื่น ให้ `timedatectl set-timezone UTC` ก่อน ไม่งั้นเวลาแจ้งเตือนเพี้ยน

## 6. สิ่งที่ต้องไปแก้ที่อื่นตอนสลับโดเมน ⚠️

อันนี้พลาดบ่อยที่สุด — ของพวกนี้ผูกกับ **โดเมนเดิม** ต้องไล่แก้ให้ครบ:

| ที่ไหน | แก้อะไร |
|---|---|
| Supabase → Authentication → URL Configuration | เพิ่ม Site URL และ Redirect URLs ของโดเมนใหม่ (ไม่งั้นพนักงานล็อกอินไม่ได้) |
| LINE Developers → LINE Login | Callback URL ใหม่ (`/api/shop/callback`) |
| LINE Developers → LIFF | Endpoint URL ใหม่ (`/member`) |
| Telegram | เรียก `setWebhook` ชี้มา `/api/telegram/webhook` ของโดเมนใหม่ |
| Shopee Open Platform | Redirect URL ใหม่ (`/api/shopee/callback`) ถ้าเปิดใช้อยู่ |
| `.env` | `NEXT_PUBLIC_SITE_URL` ต้องเป็นโดเมนใหม่ แล้ว **build ใหม่** (ค่านี้ฝังตอน build) |

## 7. อัปเดตเวอร์ชันใหม่

```bash
cd LB.POS
git pull
docker compose up -d --build
```

ระหว่าง build ตัวเก่ายังรันอยู่ สลับตอน container ใหม่พร้อม ดาวน์ไม่ถึงวินาที

## 8. เช็กลิสต์ก่อนตัดโดเมนจริง

ทดสอบบนซับโดเมนทดสอบให้ครบก่อน:

- [ ] ล็อกอินพนักงานได้ (admin / แคชเชียร์ / หมอ เข้าได้คนละหน้า)
- [ ] ขายของจบบิลได้ ปริ้นใบเสร็จออก
- [ ] เปิด/ปิดรอบกะ ยอดเงินตรง
- [ ] ยิงบาร์โค้ดจากกล้องได้ (ต้องมี HTTPS ถึงจะเปิดกล้องได้)
- [ ] อัปโหลดรูปสินค้าได้
- [ ] ร้านออนไลน์: ลูกค้าล็อกอิน LINE สั่งของได้
- [ ] แจ้งเตือน Telegram เข้า
- [ ] ยิง cron ด้วยมือดูว่าได้ 200 (`curl -H "Authorization: Bearer ..."`)
- [ ] ปุ่มสำรองข้อมูลในหน้าตั้งค่าโหลด zip ได้

ครบแล้วค่อยย้าย A record ของโดเมนจริง แล้วลบโปรเจกต์ออกจาก Vercel

---

## หมายเหตุทางเทคนิค

- `next.config.ts` เปิด `output: 'standalone'` **เฉพาะตอนมี `DOCKER_BUILD=1`** เพื่อไม่ให้
  กระทบ build ฝั่ง Vercel ระหว่างที่ยังใช้งานคู่กันอยู่
- ค่า `NEXT_PUBLIC_*` ถูกฝังลงบันเดิลตอน build ไม่ใช่อ่านตอนรัน — แก้ค่าพวกนี้ต้อง build ใหม่เสมอ
- `SUPABASE_SERVICE_ROLE_KEY` ต้องส่งตอน build ด้วย เพราะ `/api/favicon` ตั้ง `revalidate`
  ไว้ Next เลย prerender ตั้งแต่ตอน build (key อยู่แค่ชั้น builder ไม่ติดไปกับ image ที่รันจริง)
- เวลาในคอนเทนเนอร์เป็น UTC เหมือนตอนอยู่ Vercel โค้ดคิดวันไทยเองผ่าน `src/lib/thaiDate.ts`
  ซึ่งระบุ `timeZone: 'Asia/Bangkok'` ไว้ทุกฟังก์ชัน **อย่าตั้ง `TZ` ในคอนเทนเนอร์**
