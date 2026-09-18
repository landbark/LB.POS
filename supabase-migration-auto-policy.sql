-- ================================================================
-- LANDBARK POS — ใส่ policy "active staff only" ให้ตารางใหม่อัตโนมัติ
--
-- ปัญหา: DO loop ใน supabase-migration-rls-active-staff.sql ทำงานกับตาราง
--        ที่มีอยู่ ณ ตอนรันเท่านั้น ตารางที่สร้างทีหลังจะไม่มี policy นี้
--        → เปิดให้ทุกคนที่ล็อกอินเข้าถึงได้ แม้จะยังไม่ได้รับอนุมัติ
--
-- แก้สองชั้น:
--   1. ฟังก์ชัน apply_active_staff_policy() — รันเมื่อไหร่ก็ได้ ไล่ใส่ให้ตารางที่ยังขาด
--      ใช้ตรวจสอบก็ได้ (คืนรายการที่แก้ไป ถ้าไม่คืนอะไรเลย = ครบแล้ว)
--   2. event trigger — พอมีใครสร้างตารางใหม่ ใส่ policy ให้ทันทีโดยไม่ต้องจำ
--
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)
-- ================================================================

-- ── 1. ไล่ใส่ให้ตารางที่ยังขาด (ใช้ตรวจสอบได้ด้วย) ────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_active_staff_policy()
RETURNS TABLE(table_name text, action text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t text;
  has_rls boolean;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      -- profiles มี policy ของตัวเองแยกไว้ (ต้องให้อ่านแถวตัวเองได้)
      AND c.relname <> 'profiles'
    ORDER BY c.relname
  LOOP
    SELECT relrowsecurity INTO has_rls FROM pg_class
    WHERE oid = format('public.%I', t)::regclass;

    IF NOT has_rls THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      table_name := t; action := 'เปิด RLS'; RETURN NEXT;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = 'active staff only'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "active staff only" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
        || 'USING (public.is_active_staff()) WITH CHECK (public.is_active_staff())', t);
      table_name := t; action := 'เพิ่ม policy'; RETURN NEXT;
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.apply_active_staff_policy() FROM PUBLIC;

-- ── 2. ใส่ให้อัตโนมัติตอนสร้างตารางใหม่ ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_new_public_tables()
RETURNS event_trigger
LANGUAGE plpgsql AS $$
DECLARE obj record;
BEGIN
  FOR obj IN
    SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE command_tag = 'CREATE TABLE' AND schema_name = 'public'
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', obj.object_identity);
      EXECUTE format(
        'CREATE POLICY "active staff only" ON %s AS RESTRICTIVE FOR ALL TO authenticated '
        || 'USING (public.is_active_staff()) WITH CHECK (public.is_active_staff())',
        obj.object_identity);
      RAISE NOTICE 'ใส่ policy "active staff only" ให้ % แล้ว', obj.object_identity;
    EXCEPTION WHEN OTHERS THEN
      -- ห้ามทำให้ CREATE TABLE ล้มเหลวเด็ดขาด — เตือนไว้แล้วไปต่อ
      RAISE WARNING 'ใส่ policy ให้ % ไม่สำเร็จ (%) — รัน SELECT public.apply_active_staff_policy(); เอง',
        obj.object_identity, SQLERRM;
    END;
  END LOOP;
END $$;

DO $$
BEGIN
  DROP EVENT TRIGGER IF EXISTS guard_new_public_tables_trg;
  CREATE EVENT TRIGGER guard_new_public_tables_trg
    ON ddl_command_end WHEN TAG IN ('CREATE TABLE')
    EXECUTE FUNCTION public.guard_new_public_tables();
  RAISE NOTICE 'event trigger พร้อมใช้งาน — ตารางใหม่จะได้ policy เองอัตโนมัติ';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'โปรเจกต์นี้ไม่อนุญาตให้สร้าง event trigger — ใช้วิธีเรียก';
  RAISE NOTICE '  SELECT public.apply_active_staff_policy();';
  RAISE NOTICE 'ต่อท้าย migration ทุกครั้งที่สร้างตารางใหม่แทน';
END $$;

-- ── 3. ไล่ใส่ให้ครบตอนนี้เลย + แสดงผล ────────────────────────────────────────
-- ถ้าไม่คืนแถวไหนเลย = ทุกตารางมี policy ครบแล้ว
SELECT * FROM public.apply_active_staff_policy();
