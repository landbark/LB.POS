-- LANDBARK POS — Migration: โปรโมชั่นคละสินค้า
--   combine_items — นับชิ้น/ยอดของทุกบรรทัดที่โปรนี้คลุม "รวมกัน" แทนที่จะนับแยกทีละบรรทัด
--   เช่น "ขนมแมวในหมวดนี้ คละได้ ซื้อครบ 3 ชิ้น ลด 10%" หรือ "ซื้อครบ 1000 บาท ลด 5%"
--   ของเดิมทั้งหมดเป็น false = นับแยกบรรทัดเหมือนพฤติกรรมก่อนมีคอลัมน์นี้
-- รันใน Supabase SQL Editor ก่อน deploy เสมอ (รันซ้ำได้ ไม่พังของเดิม)

ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS combine_items BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN promotions.combine_items IS
  'true = คละสินค้าได้ นับชิ้นและยอดของทุกบรรทัดที่โปรคลุมรวมกัน แล้วเฉลี่ยส่วนลดกลับลงแต่ละบรรทัด; false = นับแยกทีละบรรทัดในบิล';
