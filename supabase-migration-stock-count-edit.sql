-- LANDBARK POS — Migration: แก้รอบนับสต็อกที่ปิดแล้ว + ล็อกว่าใครแก้เมื่อไหร่
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)
--
-- เดิมรอบนับที่กด "ยืนยันปรับสต็อก" หรือ "ยกเลิกรอบ" แล้วถูกล็อกทั้งใบ แก้อะไรไม่ได้เลย
-- แม้แต่ชื่อรอบ (ซึ่งตั้งได้ครั้งเดียวตอนเปิดรอบ) — คีย์ผิดหลักเดียว เช่น 10 แทน 100
-- ก็ต้องเปิดรอบใหม่มานับทับ ทำให้รายการนับย้อนหลังอ่านไม่รู้เรื่อง
--
-- ของใหม่
--   • ชื่อรอบ / หมายเหตุรอบ  — พนักงานแก้ได้ทุกสถานะ
--   • จำนวนที่นับได้ของรอบที่ปรับสต็อกแล้ว — เจ้าของร้านแก้ได้เลย (ระบบปรับสต็อก
--     ตามส่วนต่างที่เปลี่ยน + ลง stock_movements ให้), พนักงานส่งเป็น "คำขอ" รออนุมัติ
--   • ทุกการแก้ลงตารางเดียวกันข้างล่าง — ใครแก้ แก้อะไร จากเท่าไหร่เป็นเท่าไหร่ เมื่อไหร่

-- ตารางนี้เป็นทั้งคิวคำขอและประวัติการแก้ในตัวเดียว
--   status = 'applied'   แก้ไปแล้ว (เจ้าของร้านแก้เอง หรือเป็นการแก้ที่ไม่แตะสต็อก)
--            'pending'   พนักงานขอแก้ รอเจ้าของร้านอนุมัติ — ยังไม่แตะข้อมูลอะไร
--            'approved'  เจ้าของร้านกดอนุมัติแล้ว และระบบลงมือแก้ให้เรียบร้อย
--            'rejected'  ไม่อนุมัติ — เก็บไว้ให้เห็นว่ามีคนเคยขอ
CREATE TABLE IF NOT EXISTS stock_count_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id UUID NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
  -- แถวที่ถูกแก้ — null = แก้ตัวรอบ (ชื่อ/หมายเหตุ/สถานะ)
  -- SET NULL ไม่ใช่ CASCADE: ประวัติว่าเคยแก้ต้องอยู่ต่อแม้แถวนั้นถูกเอาออกไปแล้ว
  item_id UUID REFERENCES stock_count_items(id) ON DELETE SET NULL,
  -- เก็บสินค้าซ้ำไว้เอง เพราะ item_id กลายเป็น null ได้ แล้วจะอ่านไม่รู้ว่าแก้ของตัวไหน
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  field TEXT NOT NULL CHECK (field IN ('name', 'note', 'counted_quantity', 'item_note', 'status')),
  old_value TEXT,
  new_value TEXT,
  -- ส่วนต่างที่ปรับเข้าสต็อกจริงจากการแก้ครั้งนี้ (null = การแก้นี้ไม่แตะสต็อก)
  stock_delta INT,
  status TEXT NOT NULL DEFAULT 'applied'
    CHECK (status IN ('applied', 'pending', 'approved', 'rejected')),
  requested_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  reject_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_stock_count_edits_count
  ON stock_count_edits(count_id, requested_at DESC);

-- คิวรออนุมัติ — หน้าหลังร้านถามบ่อยว่า "ยังมีค้างไหม"
CREATE INDEX IF NOT EXISTS idx_stock_count_edits_pending
  ON stock_count_edits(requested_at DESC) WHERE status = 'pending';

-- หนึ่งแถวค้างคำขอได้ทีละใบ — ขอซ้ำ = ทับใบเดิม (API ทับให้) ไม่ใช่กองสะสม
CREATE UNIQUE INDEX IF NOT EXISTS stock_count_edits_one_pending
  ON stock_count_edits(item_id, field) WHERE status = 'pending' AND item_id IS NOT NULL;

ALTER TABLE stock_count_edits ENABLE ROW LEVEL SECURITY;

-- อ่านได้ทุกคนในทีม แต่ "เขียนไม่ได้เลย" — ไม่มี policy ของ INSERT/UPDATE/DELETE
-- แปลว่าถูกปฏิเสธโดยปริยาย เขียนได้ทางเดียวคือผ่าน API ฝั่งเซิร์ฟเวอร์ (service role
-- ไม่ผ่าน RLS) ซึ่งเป็นจุดที่เช็คสิทธิ์และบังคับให้ทุกการแก้ลงล็อกพร้อมกัน
-- ถ้าเปิดให้เบราว์เซอร์เขียนตรง คนที่แก้จะลบร่องรอยของตัวเองได้ ล็อกก็ไม่มีความหมาย
DROP POLICY IF EXISTS "auth read stock_count_edits" ON stock_count_edits;
CREATE POLICY "auth read stock_count_edits" ON stock_count_edits
  FOR SELECT TO authenticated USING (true);

-- ตารางใหม่ต้องใส่ policy นี้เองทุกครั้ง — DO block ใน
-- supabase-migration-rls-active-staff.sql ทำงานกับตารางที่มีอยู่ ณ ตอนรันเท่านั้น
DROP POLICY IF EXISTS "active staff only" ON stock_count_edits;
CREATE POLICY "active staff only" ON stock_count_edits
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_active_staff()) WITH CHECK (public.is_active_staff());

-- ── ปิดทางแก้ผลนับผ่านเบราว์เซอร์ตรงเมื่อรอบปิดแล้ว ──────────────────────────
-- policy เดิม "auth manage stock_count_items" เป็น FOR ALL จึงเปิดให้พนักงานทุกคน
-- UPDATE/DELETE ได้ทุกแถว ไม่สนสถานะรอบ — ถ้าปล่อยไว้ หน้าเว็บจะเลี่ยง API
-- ไปแก้ตรงได้ แล้วสต็อกกับล็อกจะไม่ตรงกับความจริง
-- ทับด้วย RESTRICTIVE (AND กับทุก policy): แถวของรอบที่ยัง counting แก้ได้ตามปกติ
-- รอบที่ posted/cancelled แก้ได้แต่ทาง service role เท่านั้น
--
-- แยกเป็นคำสั่ง ๆ ไม่ใช่ FOR ALL ตัวเดียว — FOR ALL คลุม SELECT ด้วย แล้วหน้ารายละเอียด
-- ของรอบที่ปิดแล้ว (ซึ่งอ่านผ่าน session ของพนักงาน ไม่ใช่ service role) จะมองไม่เห็น
-- แถวที่นับไว้เลย กลายเป็นรอบเปล่า
CREATE OR REPLACE FUNCTION public.stock_count_is_open(p_count_id uuid)
RETURNS boolean
SECURITY DEFINER SET search_path = public
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stock_counts c WHERE c.id = p_count_id AND c.status = 'counting'
  );
$$;

REVOKE ALL ON FUNCTION public.stock_count_is_open(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stock_count_is_open(uuid) TO authenticated;

DROP POLICY IF EXISTS "closed count items are server only" ON stock_count_items;

DROP POLICY IF EXISTS "closed count items no insert" ON stock_count_items;
CREATE POLICY "closed count items no insert" ON stock_count_items
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.stock_count_is_open(count_id));

DROP POLICY IF EXISTS "closed count items no update" ON stock_count_items;
CREATE POLICY "closed count items no update" ON stock_count_items
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.stock_count_is_open(count_id))
  WITH CHECK (public.stock_count_is_open(count_id));

DROP POLICY IF EXISTS "closed count items no delete" ON stock_count_items;
CREATE POLICY "closed count items no delete" ON stock_count_items
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.stock_count_is_open(count_id));

-- ── ตัวรอบนับ: แก้ได้ทาง API เท่านั้น ────────────────────────────────────────
-- ชื่อรอบ / หมายเหตุ / การยกเลิกรอบ ต้องลงล็อกพร้อมกันทุกครั้ง ถ้าเบราว์เซอร์
-- UPDATE ตรงได้ ก็เปลี่ยนชื่อรอบทิ้งโดยไม่มีร่องรอยได้ (เปิดรอบใหม่ยังทำได้ตามปกติ —
-- ปิดแต่ UPDATE ไม่ได้ปิด INSERT)
DROP POLICY IF EXISTS "stock_counts update server only" ON stock_counts;
CREATE POLICY "stock_counts update server only" ON stock_counts
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

-- ลบรอบนับทิ้งไม่ได้ — ยกเลิกได้เท่านั้น (ประวัติว่าเคยนับต้องอยู่ต่อ)
DROP POLICY IF EXISTS "stock_counts no delete" ON stock_counts;
CREATE POLICY "stock_counts no delete" ON stock_counts
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

-- ── แจ้งเตือนเจ้าของร้านเมื่อมีคำขอแก้ ───────────────────────────────────────
ALTER TABLE app_notifications DROP CONSTRAINT IF EXISTS app_notifications_kind_check;
ALTER TABLE app_notifications ADD CONSTRAINT app_notifications_kind_check CHECK (kind IN (
  'new_order',          -- ออเดอร์ออนไลน์ใหม่ (รอลูกค้าชำระเงิน)
  'payment_slip',       -- ลูกค้าแจ้งโอน/ส่งสลิปมาแล้ว รอตรวจ
  'receipt_cancelled',  -- มีคนยกเลิกใบเสร็จ
  'product_return',     -- รับคืน / เปลี่ยนสินค้า
  'new_appointment',    -- นัดหมายใหม่จากหน้าเว็บ
  'member_link',        -- ลูกค้าขอผูก LINE กับสมาชิกเดิม รอร้านยืนยันตัวตน
  'stock_count_edit'    -- พนักงานขอแก้ผลนับของรอบที่ปรับสต็อกแล้ว รอเจ้าของอนุมัติ
));

-- เรื่องสต็อกที่ปรับไปแล้วเป็นเรื่องมูลค่าของในร้าน — เปิดไว้ตั้งแต่ต้น
ALTER TABLE notify_settings
  ADD COLUMN IF NOT EXISTS notify_stock_count_edit BOOLEAN NOT NULL DEFAULT true;

SELECT public.apply_active_staff_policy();
