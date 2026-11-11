-- LANDBARK POS — Migration: แจ้งเตือนในระบบ (กระดิ่งบนหน้าขาย + หลังร้าน)
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)
--
-- เดิมแจ้งเตือนมีทางเดียวคือ Telegram ซึ่งเข้าเครื่องเจ้าของ ไม่ได้เข้าเครื่องแคชเชียร์
-- ออเดอร์ออนไลน์เข้ามาแล้วคนที่ยืนอยู่หน้าร้านไม่รู้เลย ต้องเดินเข้าเมนูจัดการร้านไปดูเอง
--
-- ตารางนี้คือกล่องแจ้งเตือนกลาง: ฝั่ง server เขียนลง (service role) ทุกเครื่องที่ล็อกอิน
-- อ่านเห็นเหมือนกัน แล้วสถานะ "อ่านแล้ว" แยกเป็นคนต่อคน ไม่ใช่ปักธงรวมทั้งร้าน
CREATE TABLE IF NOT EXISTS app_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ชนิดของเรื่อง — ใช้เลือกไอคอน/สีที่กระดิ่ง และกรองว่าใครควรเห็น
  kind TEXT NOT NULL CHECK (kind IN (
    'new_order',          -- ออเดอร์ออนไลน์ใหม่ (รอลูกค้าชำระเงิน)
    'payment_slip',       -- ลูกค้าแจ้งโอน/ส่งสลิปมาแล้ว รอตรวจ
    'receipt_cancelled',  -- มีคนยกเลิกใบเสร็จ
    'product_return',     -- รับคืน / เปลี่ยนสินค้า
    'new_appointment'     -- นัดหมายใหม่จากหน้าเว็บ
  )),
  title TEXT NOT NULL,
  body TEXT,
  -- ลิงก์ในระบบที่กดแล้วไปถึงเรื่องนั้น เช่น /admin/orders/<id> (เก็บเป็น path ไม่ใช่ URL เต็ม)
  link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_notifications_created ON app_notifications(created_at DESC);

-- "อ่านแล้ว" แยกต่อคน — แคชเชียร์กดอ่านแล้วเจ้าของต้องยังเห็นว่ามีของใหม่
CREATE TABLE IF NOT EXISTS app_notification_reads (
  notification_id UUID NOT NULL REFERENCES app_notifications(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, profile_id)
);

ALTER TABLE app_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_notification_reads ENABLE ROW LEVEL SECURITY;

-- พนักงานอ่านได้ทุกคน แต่เขียนไม่ได้ — แจ้งเตือนต้องมาจากฝั่ง server (service role) เท่านั้น
-- ไม่งั้นใครยิง API ตรงก็ยัดข้อความปลอมขึ้นกระดิ่งทุกเครื่องได้
DROP POLICY IF EXISTS "auth read app_notifications" ON app_notifications;
CREATE POLICY "auth read app_notifications" ON app_notifications FOR SELECT TO authenticated USING (true);

-- ธงอ่านแล้วเป็นของตัวเอง — ปักได้เฉพาะแถวที่เป็นชื่อตัวเอง
DROP POLICY IF EXISTS "own notification reads" ON app_notification_reads;
CREATE POLICY "own notification reads" ON app_notification_reads FOR ALL TO authenticated
  USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());

-- เปิด/ปิดแจ้งเตือน Telegram ของสองเรื่องใหม่ได้ที่ /admin/notifications
-- ยกเลิกใบเสร็จ/รับคืนของเป็นเรื่องเงิน เปิดไว้ตั้งแต่ต้น (วันละไม่กี่ครั้ง ไม่รำคาญ)
ALTER TABLE notify_settings ADD COLUMN IF NOT EXISTS notify_receipt_cancelled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE notify_settings ADD COLUMN IF NOT EXISTS notify_product_return BOOLEAN NOT NULL DEFAULT true;

SELECT public.apply_active_staff_policy();
