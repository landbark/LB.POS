-- ================================================================
-- LANDBARK POS — ผูก LINE เข้ากับสมาชิกเดิมต้องให้ร้านยืนยันก่อน จึงเห็นแต้ม/ประวัติ
--
-- ปัญหาเดิม (/api/shop/link)
--   ลูกค้าล็อกอิน LINE แล้วกรอกเบอร์ → ถ้าเบอร์นั้นมีในระบบและยังไม่ถูกผูก
--   ระบบผูกให้ "ทันที" ไม่มีการพิสูจน์ว่าเป็นเจ้าของเบอร์จริง
--   → ใครรู้ (หรือไล่เดา) เบอร์ลูกค้า ก็สมัคร LINE ใหม่แล้วยึดบัญชีนั้นได้
--     ได้ประวัติการซื้อ ที่อยู่ แต้มสะสม เครดิตร้าน และ QR บัตรสมาชิกไปใช้ที่ร้าน
--
-- วิธีแก้ — แยก "ผูก" ออกจาก "ยืนยัน"
--   line_claimed_at  = LINE ไหนมาจับจองบัญชีนี้ไว้เมื่อไหร่
--   line_verified_at = ร้านยืนยันแล้วว่าเป็นเจ้าของตัวจริง
--
--   ยังไม่ยืนยัน  → เข้าใช้ได้ สั่งของได้ แต่ไม่เห็นแต้ม/เครดิต/ยอดซื้อสะสม/
--                   ประวัติการซื้อ/ที่อยู่ที่เคยบันทึก/QR บัตรสมาชิก และผูก Telegram ไม่ได้
--                   (เห็นเฉพาะออเดอร์ที่ตัวเองสั่งหลัง line_claimed_at)
--   ยืนยันแล้ว    → เห็นทุกอย่างตามปกติ และกันคนอื่นมาจับจองทับ
--
--   สำคัญ: การจับจองที่ "ยังไม่ยืนยัน" ทับกันได้ — ไม่งั้นคนแปลกหน้าไล่ยิงเบอร์
--   จับจองบัญชีลูกค้าทิ้งไว้ทั้งร้าน แล้วเจ้าตัวจะผูกเบอร์ของตัวเองไม่ได้เลย
--   (เงื่อนไขนี้อยู่ในโค้ด ไม่ใช่ใน constraint)
--
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)
-- ================================================================

-- ── 1. คอลัมน์ใหม่ ───────────────────────────────────────────────────────────
ALTER TABLE customers ADD COLUMN IF NOT EXISTS line_claimed_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS line_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN customers.line_claimed_at IS 'LINE ที่ผูกอยู่มาจับจองบัญชีนี้เมื่อไหร่ — ออเดอร์ก่อนเวลานี้ไม่ให้เซสชันที่ยังไม่ยืนยันเห็น';
COMMENT ON COLUMN customers.line_verified_at IS 'ร้านยืนยันแล้วว่า LINE ที่ผูกเป็นเจ้าของบัญชีจริง — NULL = ยังรอยืนยัน เห็นแต้ม/ประวัติไม่ได้';

-- ── 2. ของเดิมที่ผูกไว้แล้ว ถือว่ายืนยันแล้ว ──────────────────────────────────
-- ผูกไปตอนที่ระบบยังเชื่อเบอร์โทร จะมาตัดสิทธิ์ย้อนหลังไม่ได้ (ลูกค้าจริงจะเห็นแต้มหาย)
-- ถ้าเจอรายที่น่าสงสัยภายหลัง แก้มือได้ที่หน้า ลูกค้า → ปลดการเชื่อมต่อ
UPDATE customers
SET line_verified_at = COALESCE(line_verified_at, now()),
    line_claimed_at = COALESCE(line_claimed_at, created_at, now())
WHERE line_user_id IS NOT NULL AND line_verified_at IS NULL;

-- ── 3. แจ้งเตือนที่กระดิ่งในระบบ — เพิ่มชนิด 'member_link' ────────────────────
ALTER TABLE app_notifications DROP CONSTRAINT IF EXISTS app_notifications_kind_check;
ALTER TABLE app_notifications ADD CONSTRAINT app_notifications_kind_check CHECK (kind IN (
  'new_order',          -- ออเดอร์ออนไลน์ใหม่ (รอลูกค้าชำระเงิน)
  'payment_slip',       -- ลูกค้าแจ้งโอน/ส่งสลิปมาแล้ว รอตรวจ
  'receipt_cancelled',  -- มีคนยกเลิกใบเสร็จ
  'product_return',     -- รับคืน / เปลี่ยนสินค้า
  'new_appointment',    -- นัดหมายใหม่จากหน้าเว็บ
  'member_link'         -- ลูกค้าขอผูก LINE กับสมาชิกเดิม รอร้านยืนยันตัวตน
));

-- ── 4. แจ้งเตือนทาง Telegram — เพิ่มสวิตช์ของเรื่องนี้ ────────────────────────
-- ลูกค้ามักยืนรออยู่หน้าร้านตอนขอผูก แต่ถ้าขอมาตอนกลางคืนก็ต้องมีคนรู้
ALTER TABLE notify_settings ADD COLUMN IF NOT EXISTS notify_member_link BOOLEAN NOT NULL DEFAULT true;

-- ── 5. ตรวจผล ────────────────────────────────────────────────────────────────
-- ควรไม่เหลือรายที่ผูกแล้วแต่ยังไม่ยืนยัน (ของเดิมถูก grandfather ไปแล้วในข้อ 2)
SELECT count(*) FILTER (WHERE line_user_id IS NOT NULL) AS linked,
       count(*) FILTER (WHERE line_user_id IS NOT NULL AND line_verified_at IS NULL) AS awaiting_verify
FROM customers;
