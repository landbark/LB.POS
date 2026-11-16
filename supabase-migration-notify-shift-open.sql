-- LANDBARK POS — Migration: แจ้งเตือน Telegram ตอนเปิดกะแล้วเงินในเก๊ะไม่ตรง
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)

-- ส่วนต่างตอนเปิดกะเคยถูกเขียนลง shifts.notes อย่างเดียว ไม่มีใครรู้จนกว่าจะเปิดหลังร้านไปอ่าน
-- และตอนปิดกะเย็นนั้น cash_difference จะขึ้น 0 เพราะส่วนต่างถูกซึมเข้าไปในยอดตั้งต้นแล้ว
-- เงินขาดเล็ก ๆ จึงหายเงียบวันต่อวัน (16 พ.ย. 2026 ขาด ฿25 · 2 พ.ย. ขาด ฿2 · 14 พ.ย. เกิน ฿10)
ALTER TABLE notify_settings ADD COLUMN IF NOT EXISTS notify_shift_open BOOLEAN NOT NULL DEFAULT true;
