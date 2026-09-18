-- ================================================================
-- LANDBARK POS — ปิดช่องโหว่: คนที่ยังไม่ได้รับอนุมัติเข้าถึงฐานข้อมูลได้
--
-- ปัญหาเดิม
--   หน้า login เปิดให้พนักงานใหม่ล็อกอิน Google ได้เลย → Supabase ออก JWT
--   role "authenticated" ให้ทันที ส่วน handle_new_user ตั้ง profiles.active = false
--   ไว้รอเจ้าของอนุมัติ แต่ "active" ถูกเช็คแค่ใน proxy.ts เท่านั้น
--
--   proxy.ts กันได้แค่ทางหน้าเว็บ ส่วน REST API ของ Supabase เปิดตรงอยู่แล้ว
--   คนที่รออนุมัติจึงเอา JWT ตัวเองยิงตรงเข้า /rest/v1/customers ได้
--   อ่านและ "เขียน" ได้ทุกตาราง เพราะ policy เดิมเป็น FOR ALL USING (true)
--
-- วิธีแก้
--   เพิ่ม policy แบบ RESTRICTIVE ทุกตาราง — RESTRICTIVE จะถูก AND เข้ากับ
--   policy เดิมทั้งหมด จึงไม่ต้องไปแก้หรือลบ policy ที่มีอยู่ (รวมถึงพวก
--   admin-only และ vet readonly ที่ตั้งไว้ดีแล้ว) ทำให้ย้อนกลับง่ายและไม่เสี่ยง
--
-- หมายเหตุ
--   - service role ข้าม RLS อยู่แล้ว → หน้าเว็บฝั่งลูกค้า (/shop /account /member)
--     ที่ใช้ createAdminClient ไม่กระทบเลย
--   - ลูกค้าไม่เคยเป็น authenticated ของ Supabase (ใช้คุกกี้เซ็น HMAC แยกต่างหาก)
--
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)
-- ================================================================

-- ── 1. helper ────────────────────────────────────────────────────────────────
-- SECURITY DEFINER เพื่อข้าม RLS ตอนอ่าน profiles กัน infinite recursion
-- (แบบเดียวกับ is_admin() / is_vet() ที่มีอยู่แล้ว)
CREATE OR REPLACE FUNCTION public.is_active_staff()
RETURNS boolean
SECURITY DEFINER SET search_path = public
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND active = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_staff() TO authenticated;

-- ── 2. เปิด RLS ให้ครบทุกตาราง ───────────────────────────────────────────────
-- เผื่อมีตารางไหนหลุดไป — ตารางที่ไม่เปิด RLS จะเข้าถึงได้โดยไม่ผ่าน policy เลย
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    RAISE NOTICE 'เปิด RLS ให้ตาราง %', t;
  END LOOP;
END $$;

-- ── 3. บังคับว่าต้องเป็นพนักงานที่อนุมัติแล้ว ทุกตาราง ────────────────────────
-- ยกเว้น profiles ซึ่งจัดการแยกด้านล่าง (ต้องให้อ่านแถวของตัวเองได้
-- ไม่งั้นหน้า /no-access กับ proxy.ts จะไม่รู้ว่าใครเป็นใคร)
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
      AND c.relname <> 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "active staff only" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "active staff only" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      || 'USING (public.is_active_staff()) WITH CHECK (public.is_active_staff())', t);
  END LOOP;
END $$;

-- ── 4. profiles ──────────────────────────────────────────────────────────────
-- อ่าน: พนักงานที่อนุมัติแล้ว หรืออ่านแถวของตัวเอง (คนรออนุมัติต้องเห็นสถานะตัวเอง)
DROP POLICY IF EXISTS "active staff or self read" ON public.profiles;
CREATE POLICY "active staff or self read" ON public.profiles
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.is_active_staff() OR id = auth.uid());

-- เขียน/ลบ: เฉพาะพนักงานที่อนุมัติแล้ว — คนรออนุมัติแก้ profile ตัวเองไม่ได้
-- (ไม่งั้นตั้ง active = true ให้ตัวเองแล้วเข้าระบบได้เลย)
DROP POLICY IF EXISTS "active staff insert" ON public.profiles;
CREATE POLICY "active staff insert" ON public.profiles
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.is_active_staff());

DROP POLICY IF EXISTS "active staff update" ON public.profiles;
CREATE POLICY "active staff update" ON public.profiles
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.is_active_staff()) WITH CHECK (public.is_active_staff());

DROP POLICY IF EXISTS "active staff delete" ON public.profiles;
CREATE POLICY "active staff delete" ON public.profiles
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.is_active_staff());

-- ── 5. ตรวจผล ────────────────────────────────────────────────────────────────
-- ควรได้ 36 แถว (ทุกตารางยกเว้น profiles) — ถ้าน้อยกว่านี้แปลว่ามีตารางตกหล่น
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public' AND policyname LIKE 'active staff%'
ORDER BY tablename;
