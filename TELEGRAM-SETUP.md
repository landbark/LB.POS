# แจ้งเตือนเจ้าของทาง Telegram — คู่มือติดตั้ง

แบ่งเป็น 2 ส่วน: **ส่วนผู้ดูแลระบบ** (ทำครั้งเดียวตอนติดตั้ง) กับ **ส่วนเจ้าของร้าน**
(มีคู่มือแบบทีละขั้นพร้อม QR อยู่ในหน้า `/admin/notifications` อยู่แล้ว ไม่ต้องอ่านไฟล์นี้)

ทั้งหมดนี้ **ฟรี** — Telegram Bot API ไม่คิดค่าข้อความ ต่างจาก LINE OA ที่คิดรายข้อความ

---

## ส่วนที่ 1 — ผู้ดูแลระบบ (ทำครั้งเดียว)

### 1. สร้างบอท

1. เปิด Telegram แล้วค้นหา **@BotFather** (มีเครื่องหมายถูกสีฟ้า)
2. พิมพ์ `/newbot`
3. ตั้งชื่อที่แสดง เช่น `LANDBARK แจ้งเตือน`
4. ตั้ง username ต้องลงท้ายด้วย `bot` เช่น `landbark_alert_bot`
5. BotFather จะให้ **token** หน้าตาแบบ `8123456789:AAF...` — เก็บไว้ อย่าให้ใครเห็น

ตั้งรูปโปรไฟล์ให้บอทด้วยก็ได้: `/setuserpic` แล้วส่งโลโก้ร้าน

### 2. ตั้ง Environment Variables บน Vercel

Settings → Environment Variables (ใส่ทั้ง Production/Preview/Development)

| Key | ค่า |
|---|---|
| `TELEGRAM_BOT_TOKEN` | token ที่ได้จาก BotFather |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | username ของบอท เช่น `landbark_alert_bot` (ไม่ต้องมี `@`) |
| `TELEGRAM_WEBHOOK_SECRET` | สุ่มขึ้นมาเอง เช่นจาก `openssl rand -hex 32` |
| `CRON_SECRET` | สุ่มขึ้นมาเอง — Vercel Cron ใช้ยืนยันตัวตน |
| `NEXT_PUBLIC_SITE_URL` | `https://<โดเมนของร้าน>` — ทำให้ลิงก์ในข้อความแจ้งเตือนกดเข้าหลังร้านได้ |

แล้ว redeploy หนึ่งรอบให้ค่าใหม่มีผล

### 3. รัน migration

เปิด Supabase SQL Editor แล้วรันตามลำดับ (รันซ้ำได้ ไม่พังของเดิม):

1. `supabase-migration-notify-events.sql`
2. `supabase-migration-notify-appointments.sql`
3. `supabase-migration-customer-telegram.sql`

```sql
ALTER TABLE notify_settings ADD COLUMN IF NOT EXISTS notify_new_order BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE notify_settings ADD COLUMN IF NOT EXISTS notify_payment_slip BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE notify_settings ADD COLUMN IF NOT EXISTS notify_shift_close BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE notify_settings ADD COLUMN IF NOT EXISTS notify_daily_sales BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE notify_settings ADD COLUMN IF NOT EXISTS cash_diff_threshold NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE telegram_recipients ADD COLUMN IF NOT EXISTS is_owner BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS notify_log (
  event_key TEXT PRIMARY KEY,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notify_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read" ON notify_log;
CREATE POLICY "authenticated_read" ON notify_log FOR SELECT TO authenticated USING (true);
```

### 4. ผูก webhook ให้บอท

รันครั้งเดียวในเทอร์มินัล (แทนค่า `<TOKEN>`, `<โดเมน>`, `<SECRET>`):

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://<โดเมน>/api/telegram/webhook","secret_token":"<SECRET>"}'
```

ได้ `{"ok":true,...}` = ผูกสำเร็จ · เช็คสถานะด้วย `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`

---

## ส่วนที่ 2ก — เจ้าของสัตว์ / ลูกค้า (ทำเองได้ ~3 นาที)

ลูกค้าเชื่อมเองได้จากหน้าสมาชิก `/account` **ไม่ต้องรอแอดมินอนุมัติ** เพราะผูกผ่าน
deep link เฉพาะตัว (`t.me/<bot>?start=<token>`) ที่ออกให้เฉพาะคนที่ล็อกอินแล้ว
โทเคนใช้ได้ครั้งเดียว อายุ 30 นาที

1. เข้าหน้า **สมาชิก** บนเว็บร้าน (ล็อกอินด้วย LINE ตามปกติ)
2. กดปุ่ม **เชื่อมต่อ Telegram** — แอป Telegram จะเปิดขึ้นมาเอง
3. กดปุ่ม **START** หนึ่งครั้ง บอทจะทักกลับว่าเชื่อมต่อสำเร็จ

ในหน้านั้นมีคู่มือ *ยังไม่เคยใช้ Telegram?* กางดูได้ (ลงแอป → สมัครด้วยเบอร์ → กดเชื่อมต่อ)
ถ้าเปิดจากคอม จะมี QR ให้สแกนด้วยมือถือแทน

ลูกค้าจะได้รับ **เตือนวันนัดล่วงหน้า 1 วัน และซ้ำอีกครั้งเช้าวันนัด**
ปิดชั่วคราวได้จากหน้าสมาชิก หรือพิมพ์ `/stop` ในแชทบอท

---

## ส่วนที่ 2ข — เจ้าของร้าน / พนักงาน (ทำเองได้ ~5 นาที)

เปิดหน้า **หลังร้าน → แจ้งเตือน** จะมีคู่มือทีละขั้นพร้อม QR code ให้สแกน กดปุ่ม **พิมพ์คู่มือ**
เพื่อพิมพ์ใส่กระดาษให้เจ้าของถือทำตามได้ด้วย ย่อมาคือ:

1. ลงแอป **Telegram** จาก App Store / Play Store
2. สมัครด้วยเบอร์มือถือ (รับรหัสทาง SMS)
3. สแกน QR ในหน้าแจ้งเตือน หรือค้นหาชื่อบอทของร้าน
4. กดปุ่ม **START**
5. แอดมินกด **อนุมัติ** ในหน้าแจ้งเตือน
6. กด **ส่งทดสอบ** เช็กว่าข้อความเข้าจริง

เลิกรับเมื่อไหร่ก็พิมพ์ `/stop` ในแชทบอท

---

## แจ้งเตือนอะไรบ้าง

| เหตุการณ์ | เวลา | ใครได้รับ |
|---|---|---|
| 🛒 ออเดอร์ออนไลน์ใหม่ | ทันที | ทุกคน |
| 💸 ลูกค้าแนบสลิปโอนเงิน | ทันที | ทุกคน |
| 🗓️ มีการจองนัดใหม่ | ทันที | ทุกคน |
| 📅 นัดหมายวันนี้ · 🐾 สต็อคต่ำ · ใกล้หมดอายุ · นัดพรุ่งนี้ · วัคซีนครบกำหนด | 08:00 น. | ทุกคน |
| 🧾 ปิดกะ / นับเงิน (ยอดขาย + เงินขาดเกิน) | ทันทีที่กดปิดกะ | **เจ้าของ** |
| 📊 สรุปยอดขายรายวัน (ยอด + วิธีชำระ + ขายดี 5 อันดับ) | 20:00 น. | **เจ้าของ** |

เปิด/ปิดทีละอย่างได้ที่หน้า **แจ้งเตือน** ในหลังร้าน
และตั้งเกณฑ์ได้ว่าปิดกะจะเตือนเฉพาะตอนเงินขาด/เกินเกินกี่บาท (0 = เตือนทุกกะ)

## เจ้าของ vs พนักงาน

ข้อความเรื่องเงิน (ปิดกะ, สรุปยอดขายรายวัน) ส่งเฉพาะผู้รับที่ติ๊ก **เจ้าของ** ไว้
พนักงานที่เชื่อมบอทจะได้แค่เรื่องที่ต้องลงมือทำ — ออเดอร์ สลิป นัดหมาย สต็อค

ติ๊กได้ที่ไอคอน 👑 หลังชื่อในรายการผู้รับแจ้งเตือน

> ถ้าไม่มีใครถูกตั้งเป็นเจ้าของเลย ข้อความเรื่องเงินจะ**ไม่ถูกส่งหาใคร** (จงใจ — กันเผลอส่งยอดขายให้พนักงาน)
> หน้าแจ้งเตือนจะขึ้นแถบสีเหลืองเตือนให้

---

## แก้ปัญหา

**ลูกค้ากดปุ่มเชื่อมต่อแล้วบอทบอกว่าลิงก์หมดอายุ** — โทเคนอายุ 30 นาทีและใช้ได้ครั้งเดียว กดปุ่มในหน้าสมาชิกใหม่อีกครั้ง

**ลูกค้าไม่ได้รับเตือนวันนัด** — เช็คว่ารัน `supabase-migration-customer-telegram.sql` แล้ว, ติ๊ก *เตือนวันนัดให้เจ้าของสัตว์* ไว้, และนัดนั้นสถานะยังเป็น `scheduled`

**กด /start แล้วบอทเงียบ** — webhook ยังไม่ผูก หรือ `TELEGRAM_WEBHOOK_SECRET` ไม่ตรงกับตอน setWebhook
เช็ค `getWebhookInfo` ดูช่อง `last_error_message`

**อนุมัติแล้วแต่ไม่มีข้อความเข้า** — กดปุ่ม *ส่งทดสอบ* ในหน้าแจ้งเตือน ถ้าขึ้น error ว่าไม่ได้ตั้ง
`TELEGRAM_BOT_TOKEN` แปลว่ายังไม่ได้ redeploy หลังใส่ env

**ออเดอร์ใหม่ไม่เด้ง แต่รอบเช้าเด้ง** — ยังไม่ได้รัน migration หรือติ๊ก *ออเดอร์ออนไลน์ใหม่* ออกไว้

**ปิดกะ/ยอดขายรายวันไม่เด้ง แต่อย่างอื่นเด้ง** — ยังไม่มีใครถูกติ๊กเป็น *เจ้าของ* (ไอคอน 👑 ในรายการผู้รับ)

**ข้อความเข้าซ้ำสองรอบ** — ปกติกันไว้แล้วด้วยตาราง `notify_log` ถ้ายังซ้ำ แปลว่า migration ยังไม่ได้รัน

**ลิงก์ในข้อความกดไม่ได้** — ยังไม่ได้ตั้ง `NEXT_PUBLIC_SITE_URL`
