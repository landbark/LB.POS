-- LANDBARK POS — Migration: ให้พนักงานตั้งเงินทอนที่ยกไปได้ "ตอนปิดกะ" (แต่แก้ทีหลังไม่ได้)
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)

-- หน้าปิดกะเลิกมีช่อง "แยกให้เจ้าของ" แล้ว เหลือช่องเดียวคือ "เงินทอนที่เหลือไว้ให้พรุ่งนี้"
-- ซึ่งเขียนลง carry_denominations ตรง ๆ ตอนกดปิดกะ — แต่ trigger จาก shift-admin-lock
-- ห้ามคนที่ไม่ใช่เจ้าของแตะคอลัมน์นั้นเลย พนักงานจึงปิดกะไม่ได้ ขึ้นว่า "แก้ได้เฉพาะเจ้าของร้าน"
--
-- ปล่อยเฉพาะ "อัปเดตที่ปิดกะ" (OLD.closed_at IS NULL → NEW.closed_at IS NOT NULL) ครั้งเดียว
-- หลังจากนั้นแถวมี closed_at แล้ว กลับไปติดล็อกเดิมทุกข้อ แก้ได้แต่เจ้าของ
--
-- ของที่ต้องกันไว้คือ "เจ้าของมาจัดทีหลัง" ไม่ใช่ตัวเงินทอนที่ยกไป เพราะพนักงานกำหนดยอดยกไป
-- ได้อยู่แล้วตั้งแต่ก่อนมีช่องนี้ (เดิมยอดยกไป = ที่นับได้ − ที่ให้เจ้าของ ซึ่งไม่เคยถูกล็อก)
-- ตัวที่ตรวจพนักงานจริง ๆ คือเจ้าของเห็นยอด "ให้เจ้าของ" ใน Telegram ตอนปิดกะ แล้วรู้ว่าได้รับครบไหม
-- ฉะนั้นห้าม carry_adjusted_at/by ติดมาด้วยในจังหวะนี้ ไม่งั้นพนักงานปลอมเป็น "เจ้าของจัดแล้ว" ได้
CREATE OR REPLACE FUNCTION public.guard_shift_owner_fields()
RETURNS TRIGGER
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  closing BOOLEAN := OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL;
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- ลายเซ็น "เจ้าของมาจัดเงินทอนทีหลัง" ปลอมไม่ได้ ไม่ว่าจังหวะไหน
  IF NEW.carry_adjusted_at IS DISTINCT FROM OLD.carry_adjusted_at
    OR NEW.carry_adjusted_by IS DISTINCT FROM OLD.carry_adjusted_by
  THEN
    RAISE EXCEPTION 'เงินทอนหลังปิดกะแก้ได้เฉพาะเจ้าของร้าน';
  END IF;

  IF NEW.carry_denominations IS DISTINCT FROM OLD.carry_denominations AND NOT closing THEN
    RAISE EXCEPTION 'เงินทอนหลังปิดกะแก้ได้เฉพาะเจ้าของร้าน';
  END IF;

  IF NEW.opening_cash IS DISTINCT FROM OLD.opening_cash THEN
    RAISE EXCEPTION 'เงินสดตั้งต้นของกะที่เปิดแล้ว แก้ได้เฉพาะเจ้าของร้าน';
  END IF;

  RETURN NEW;
END;
$$;

-- trigger ตัวเดิมชี้มาที่ฟังก์ชันนี้อยู่แล้ว (CREATE OR REPLACE ไม่ต้องผูกใหม่) — ผูกให้ด้วยกันพลาด
DROP TRIGGER IF EXISTS guard_shift_owner_fields ON shifts;
CREATE TRIGGER guard_shift_owner_fields
  BEFORE UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION public.guard_shift_owner_fields();
