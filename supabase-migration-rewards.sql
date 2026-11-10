-- LANDBARK POS — Migration: ของแลกแต้ม (rewards)
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)
--
-- ของแลกแต้ม = สินค้าในระบบตัวหนึ่งที่ให้ลูกค้าแลกด้วยแต้ม ไม่ใช่คลังแยก
-- สต็อก/ล็อต/วันหมดอายุใช้ของสินค้าตัวนั้นตามปกติ ตอนปิดบิล deductStock() ตัด FEFO ให้เอง
-- (ของใกล้หมดอายุถูกหยิบไปก่อนอยู่แล้ว ซึ่งเป็นสิ่งที่ต้องการ)

-- ───────────────────────────────────────────────────────────────
-- ตารางของแลก
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  -- แต้มที่ตัดต่อ 1 หน่วยของสินค้านั้น
  points_cost INT NOT NULL CHECK (points_cost > 0),
  -- แลกได้สูงสุดกี่ชิ้นต่อบิล (กันแลกรวบไปทีเดียวทั้งชั้น)
  max_per_bill INT NOT NULL DEFAULT 1 CHECK (max_per_bill > 0),
  -- ข้อความบอกแคชเชียร์/ลูกค้า เช่น "เฉพาะล็อตที่ใกล้หมดอายุ"
  note TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- สินค้าหนึ่งตัวเป็นของแลกได้แถวเดียว ไม่งั้นแคชเชียร์จะเห็นของตัวเดียวกันสองราคาแต้ม
CREATE UNIQUE INDEX IF NOT EXISTS rewards_product_unique ON rewards(product_id);

ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;

-- แคชเชียร์ต้องอ่านได้ (หน้าขายใช้ขึ้นรายการของแลก) แต่แก้ได้แค่แอดมิน เหมือนตาราง promotions
DROP POLICY IF EXISTS "auth read rewards" ON rewards;
CREATE POLICY "auth read rewards" ON rewards
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin manage rewards" ON rewards;
CREATE POLICY "admin manage rewards" ON rewards
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ───────────────────────────────────────────────────────────────
-- ร่องรอยบนบิล
-- ───────────────────────────────────────────────────────────────
-- บรรทัดของแลกบันทึกเหมือนของแถม (ราคาเต็ม + ส่วนลดเต็มจำนวน = subtotal 0)
-- ยอดขายในรายงานจึงไม่พอง แต่ "ส่วนลดรวม" จะพองตามมูลค่าของแลก
-- สองคอลัมน์นี้คือสิ่งที่แยกของแลกออกจากการลดราคาจริงตอนย้อนดูทีหลัง
ALTER TABLE transaction_items
  ADD COLUMN IF NOT EXISTS is_reward BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE transaction_items
  ADD COLUMN IF NOT EXISTS reward_points INT NOT NULL DEFAULT 0;

-- แต้มที่ลูกค้าจ่ายไปกับของแลกในบิลนี้ — แยกจาก points_used (แต้มที่แปลงเป็นส่วนลดเงิน)
-- ไม่งั้นย้อนดูไม่ออกว่าแต้มหายไปเป็นส่วนลดหรือเป็นของ และตอนยกเลิกบิลจะคืนแต้มผิด
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS points_used_reward INT NOT NULL DEFAULT 0;
