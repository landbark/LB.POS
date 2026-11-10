-- ================================================================
-- LANDBARK POS — ย้ายใบตรวจไปสัตว์อีกตัว
--
-- ปัญหา
--   ระบบเดิมมีสัตว์ซ้ำ พนักงานจึงลงผลตรวจ/วัคซีนผิดตัวไปแล้วหลายใบ
--   ถ้าสองใบนั้นเป็นสัตว์ตัวเดียวกัน ใช้ "รวมข้อมูลซ้ำ" ได้
--   แต่ถ้าเป็นคนละตัวจริง ๆ (ลงผิดตัวเฉย ๆ) รวมไม่ได้ ต้องย้ายทีละใบ
--
-- ย้ายอะไรบ้าง
--   ใบตรวจ + ของที่ผูกกับใบตรวจ (รายการยา / การวินิจฉัย / รูปแนบ ติดไปเอง
--   เพราะอ้าง visit_id) + วัคซีนที่ฉีดในใบนี้ + เอกสารคลินิกที่ออกจากใบนี้
--   ส่วนนัดหมายไม่ย้าย — เป็นคิวของสัตว์ตัวเดิมที่ตั้งไว้ต่างหาก
--
-- สิทธิ์: หมอหรือแอดมิน (คนที่แก้เวชระเบียนได้อยู่แล้ว)
--
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)
-- ================================================================

-- บันทึกการย้ายลง merge_log ตัวเดิม — ต้องเปิดให้ kind = 'visit' ด้วย
ALTER TABLE merge_log DROP CONSTRAINT IF EXISTS merge_log_kind_check;
ALTER TABLE merge_log ADD CONSTRAINT merge_log_kind_check
  CHECK (kind IN ('customer', 'pet', 'visit'));

CREATE OR REPLACE FUNCTION public.move_visit(
  p_visit uuid,
  p_pet uuid,
  p_move_owner boolean DEFAULT true
)
RETURNS jsonb
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v visits;
  old_pet pets;
  new_pet pets;
  new_owner uuid;
  n int;
  moved jsonb := '{}'::jsonb;
BEGIN
  -- เช็คสิทธิ์ที่ DB ด้วย ไม่ใช่เชื่อหน้าเว็บ (ยกเว้น service role ที่อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น)
  IF NOT (public.is_admin() OR public.is_vet())
     AND COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'ย้ายใบตรวจได้เฉพาะสัตวแพทย์หรือผู้ดูแลระบบ';
  END IF;

  SELECT * INTO v FROM visits WHERE id = p_visit FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบใบตรวจนี้'; END IF;
  IF v.status = 'cancelled' THEN RAISE EXCEPTION 'ใบตรวจที่ยกเลิกแล้ว ย้ายไม่ได้'; END IF;

  SELECT * INTO new_pet FROM pets WHERE id = p_pet;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบสัตว์ปลายทาง'; END IF;
  IF new_pet.id = v.pet_id THEN RAISE EXCEPTION 'ใบตรวจนี้อยู่ที่สัตว์ตัวนี้อยู่แล้ว'; END IF;

  SELECT * INTO old_pet FROM pets WHERE id = v.pet_id;

  -- เจ้าของในใบตรวจคือ "คนที่พามาวันนั้น" ปกติไม่แตะ แต่ถ้าลงผิดตัวมาแต่แรก
  -- ชื่อเจ้าของก็ผิดไปด้วย — ให้คนกดเลือกเอง
  new_owner := CASE WHEN p_move_owner THEN new_pet.customer_id ELSE v.customer_id END;

  -- ธงให้ trg_clinic_documents_guard ยอมให้ย้ายเอกสาร (หมดผลเมื่อจบทรานแซคชัน)
  PERFORM set_config('app.merging', 'on', true);

  UPDATE visits SET pet_id = p_pet, customer_id = new_owner WHERE id = p_visit;

  -- วัคซีนที่ฉีดในใบนี้ (ของสัตว์ตัวเดิม) ย้ายตามไปด้วย
  UPDATE pet_vaccinations SET pet_id = p_pet
  WHERE visit_id = p_visit AND pet_id = old_pet.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN moved := moved || jsonb_build_object('pet_vaccinations', n); END IF;

  IF to_regclass('public.clinic_documents') IS NOT NULL THEN
    UPDATE clinic_documents SET pet_id = p_pet, customer_id = new_owner
    WHERE visit_id = p_visit AND pet_id = old_pet.id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN moved := moved || jsonb_build_object('clinic_documents', n); END IF;
  END IF;

  SELECT COUNT(*) INTO n FROM visit_items WHERE visit_id = p_visit;
  IF n > 0 THEN moved := moved || jsonb_build_object('visit_items', n); END IF;

  -- kept_* = ใบตรวจที่ยังอยู่ (ชี้สัตว์ตัวใหม่), merged_* = สัตว์ตัวเดิมที่ลงผิด
  INSERT INTO merge_log (kind, kept_id, kept_hn, kept_name, merged_id, merged_hn,
                         merged_name, merged_phone, snapshot, moved, merged_by)
  VALUES ('visit', p_visit, new_pet.hn, v.visit_number, old_pet.id, old_pet.hn,
          old_pet.name, NULL, to_jsonb(v), moved, auth.uid());

  RETURN jsonb_build_object(
    'kind', 'visit', 'visit_id', p_visit, 'pet_id', p_pet,
    'owner_changed', new_owner IS DISTINCT FROM v.customer_id, 'moved', moved
  );
END;
$$;

REVOKE ALL ON FUNCTION public.move_visit(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.move_visit(uuid, uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.move_visit(uuid, uuid, boolean) TO authenticated;
