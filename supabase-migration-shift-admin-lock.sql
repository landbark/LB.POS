-- LANDBARK POS — Migration: ล็อกกะที่ปิดแล้ว/เงินทอนหลังปิดกะ ไว้ที่เจ้าของร้านจริง ๆ
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)

-- ปุ่มที่ซ่อนในหน้าเว็บกันได้แค่คนที่ไม่รู้ว่ามีปุ่ม — ยิง API ตรง ๆ ก็ยังแก้ได้
-- และของที่ล็อกตรงนี้คือ "ตัวตั้ง" ที่เอาไว้ตรวจคนนับเงินเอง: ยอดยกมากับเงินตั้งต้น
-- ถ้าคนนับเงินแก้ตัวตั้งได้เอง คืนไหนเงินขาดก็ปรับให้ตรงแล้วจบ ระบบตรวจก็ไม่เหลืออะไร

-- ------------------------------------------------------------------
-- 1) กะที่ปิดไปแล้วเป็นบันทึกเงิน — แก้/ลบได้เฉพาะเจ้าของร้าน
-- policy เดิม "auth manage shifts" เป็น permissive (OR กัน) เติมเงื่อนไขเข้าไปไม่ได้ผล
-- ต้องซ้อน RESTRICTIVE (AND กับทุก policy) แบบเดียวกับ "vet readonly" ใน supabase-schema.sql
--
-- USING คิดจากแถวเดิมก่อนแก้ → ตอนพนักงานกดปิดกะ แถวเดิมยัง closed_at IS NULL ผ่านปกติ
-- WITH CHECK ต้องเขียน true ไว้ ไม่งั้น postgres เอา USING ไปใช้ต่อ แล้วปิดกะไม่ได้ทั้งร้าน
-- ------------------------------------------------------------------
DROP POLICY IF EXISTS "closed shift admin only" ON shifts;
CREATE POLICY "closed shift admin only" ON shifts
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (closed_at IS NULL OR public.is_admin())
  WITH CHECK (true);

DROP POLICY IF EXISTS "no delete closed shift" ON shifts;
CREATE POLICY "no delete closed shift" ON shifts
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (closed_at IS NULL OR public.is_admin());

-- ------------------------------------------------------------------
-- 2) ช่องเงินทอนหลังปิดกะ + เงินตั้งต้น — เฉพาะเจ้าของร้าน
-- RLS คุมได้ทีละแถว คุมทีละคอลัมน์ไม่ได้ — ตอนพนักงานกดปิดกะ แถวนั้นยังนับเป็น "กะที่เปิดอยู่"
-- เลยแอบเขียน carry_denominations มาพร้อมกันได้ ต้องกันด้วย trigger
--
-- service role (สคริปต์ backup/verify) ไม่มี auth.uid() — ปล่อยผ่าน เพราะถือคีย์นั้นก็ทำได้ทุกอย่างอยู่แล้ว
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_shift_owner_fields()
RETURNS TRIGGER
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.carry_denominations IS DISTINCT FROM OLD.carry_denominations
    OR NEW.carry_adjusted_at IS DISTINCT FROM OLD.carry_adjusted_at
    OR NEW.carry_adjusted_by IS DISTINCT FROM OLD.carry_adjusted_by
  THEN
    RAISE EXCEPTION 'เงินทอนหลังปิดกะแก้ได้เฉพาะเจ้าของร้าน';
  END IF;

  IF NEW.opening_cash IS DISTINCT FROM OLD.opening_cash THEN
    RAISE EXCEPTION 'เงินสดตั้งต้นของกะที่เปิดแล้ว แก้ได้เฉพาะเจ้าของร้าน';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_shift_owner_fields ON shifts;
CREATE TRIGGER guard_shift_owner_fields
  BEFORE UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION public.guard_shift_owner_fields();
