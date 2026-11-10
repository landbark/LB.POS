-- ================================================================
-- LANDBARK POS — รวมข้อมูลซ้ำ (เจ้าของสัตว์ / สัตว์เลี้ยง)
--
-- ปัญหา
--   พนักงานลงทะเบียนซ้ำ — คนเดิมถูกสร้างเป็นลูกค้าหลายราย (คนละเบอร์ก็มี)
--   และสัตว์ตัวเดิมถูกลงใหม่ซ้ำอีกใบ ประวัติจึงกระจายอยู่หลายแถว
--
-- วิธีแก้
--   ฟังก์ชัน merge_customers() / merge_pets() ย้ายข้อมูลที่อ้างถึงแถวซ้ำ
--   ไปไว้ที่แถวที่เลือก "เก็บไว้" แล้วลบแถวซ้ำทิ้ง — ทำในทรานแซคชันเดียว
--   ถ้าพลาดกลางทางจะ rollback ทั้งหมด ไม่มีสภาพครึ่ง ๆ กลาง ๆ
--
--   ก่อนลบจะถ่ายสำเนาแถวเดิมทั้งแถวลง merge_log — HN เก่าอยู่ในเวชระเบียน
--   กระดาษ ค้นด้วยเลขเก่าต้องยังเจอว่าไปรวมอยู่กับตัวไหน
--
-- สิทธิ์: admin เท่านั้น (เช็คในฟังก์ชันด้วย is_admin() ไม่ใช่แค่ที่หน้าเว็บ)
--
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)
-- ================================================================

-- ── 1. บันทึกการรวม ──────────────────────────────────────────────────────────
-- kept_id/merged_id ไม่ทำ FK: ตัวที่เก็บไว้อาจถูกลบทีหลัง แต่ log ต้องอยู่
CREATE TABLE IF NOT EXISTS merge_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('customer', 'pet')),
  kept_id UUID NOT NULL,
  kept_hn TEXT,
  kept_name TEXT,
  merged_id UUID NOT NULL,
  merged_hn TEXT,
  merged_name TEXT,
  merged_phone TEXT,
  -- แถวเดิมทั้งแถวก่อนถูกลบ
  snapshot JSONB NOT NULL,
  -- ตาราง → จำนวนแถวที่ย้ายมา
  moved JSONB NOT NULL DEFAULT '{}'::jsonb,
  merged_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merge_log_kept ON merge_log(kept_id);
CREATE INDEX IF NOT EXISTS idx_merge_log_recent ON merge_log(created_at DESC);
-- ค้นด้วยของเก่า (HN / เบอร์ / ชื่อ) ให้เจอตัวที่เก็บไว้
CREATE INDEX IF NOT EXISTS idx_merge_log_merged_hn ON merge_log(merged_hn);
CREATE INDEX IF NOT EXISTS idx_merge_log_merged_phone ON merge_log(merged_phone);

ALTER TABLE merge_log ENABLE ROW LEVEL SECURITY;

-- อ่านได้ทุกคนในร้าน แต่ "เขียน" ไม่มี policy เลย → แก้มือผ่าน REST ไม่ได้
-- เขียนได้ทางฟังก์ชัน SECURITY DEFINER ข้างล่างเท่านั้น
DROP POLICY IF EXISTS "auth read merge_log" ON merge_log;
CREATE POLICY "auth read merge_log" ON merge_log FOR SELECT TO authenticated USING (true);

-- ตารางใหม่ต้องใส่เองทุกครั้ง — DO block ใน supabase-migration-rls-active-staff.sql
-- ทำงานกับตารางที่มีอยู่ ณ ตอนรันเท่านั้น
DROP POLICY IF EXISTS "active staff only" ON merge_log;
CREATE POLICY "active staff only" ON merge_log
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_active_staff()) WITH CHECK (public.is_active_staff());

-- ── 2. เปิดทางให้ย้ายเอกสารคลินิกตอนรวม ─────────────────────────────────────
-- trg_clinic_documents_guard ล็อกเอกสารที่ออกเกิน 24 ชม. ไม่ให้แก้ และบังคับ
-- NEW.pet_id := OLD.pet_id กันสลับเจ้าของเอกสาร — ถูกต้องสำหรับการแก้มือ
-- แต่ทำให้ "ย้ายเอกสารไปอยู่กับตัวที่เก็บไว้" ทำไม่ได้เลย
--
-- เพิ่มทางออกเดียว: ฟังก์ชัน merge_* ตั้งธง app.merging ไว้ในทรานแซคชันของตัวเอง
-- (GUC ของ session ตั้งผ่าน PostgREST ไม่ได้ ลูกค้า/พนักงานจึงปลอมธงนี้ไม่ได้)
CREATE OR REPLACE FUNCTION public.clinic_documents_guard()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.doc_number IS NULL OR NEW.doc_number = '' THEN
      NEW.doc_number := public.next_clinic_doc_number(NEW.doc_type);
    END IF;
    NEW.created_at := NOW();
    NEW.updated_at := NEW.created_at;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- กำลังรวมสัตว์/เจ้าของซ้ำ — ย้ายเอกสารไปอยู่กับแถวที่เก็บไว้ได้ ไม่ติดกฎ 24 ชม.
    IF COALESCE(current_setting('app.merging', true), '') = 'on' THEN
      NEW.doc_number := OLD.doc_number;
      NEW.doc_type := OLD.doc_type;
      NEW.created_at := OLD.created_at;
      NEW.created_by := OLD.created_by;
      NEW.updated_at := NOW();
      RETURN NEW;
    END IF;

    IF OLD.created_at < NOW() - INTERVAL '24 hours' THEN
      RAISE EXCEPTION 'เอกสารออกไปเกิน 24 ชั่วโมงแล้ว แก้ไขไม่ได้ (%)', OLD.doc_number;
    END IF;
    -- ห้ามขยับของที่ใช้คิดเวลา/อ้างอิง ไม่ให้ยืดอายุแก้ไขหรือสลับเจ้าของเอกสาร
    NEW.doc_number := OLD.doc_number;
    NEW.doc_type := OLD.doc_type;
    NEW.pet_id := OLD.pet_id;
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  -- DELETE: ยกเลิกใบที่ออกผิดได้ใน 24 ชม. เท่ากับการแก้
  IF OLD.created_at < NOW() - INTERVAL '24 hours' THEN
    RAISE EXCEPTION 'เอกสารออกไปเกิน 24 ชั่วโมงแล้ว ลบไม่ได้ (%)', OLD.doc_number;
  END IF;
  RETURN OLD;
END;
$$;

-- ── 3. ตัวช่วยย้าย reference ─────────────────────────────────────────────────
-- to_regclass กันไว้เผื่อร้านไหนยังไม่ได้รัน migration ของตารางนั้น (เช่น orders)
CREATE OR REPLACE FUNCTION public.merge_move_refs(
  p_tables text[],
  p_column text,
  p_from uuid,
  p_to uuid
)
RETURNS jsonb
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  t text;
  n int;
  moved jsonb := '{}'::jsonb;
BEGIN
  FOREACH t IN ARRAY p_tables LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NULL THEN CONTINUE; END IF;

    EXECUTE format('UPDATE %I SET %I = $1 WHERE %I = $2', t, p_column, p_column)
      USING p_to, p_from;
    GET DIAGNOSTICS n = ROW_COUNT;

    IF n > 0 THEN moved := moved || jsonb_build_object(t, n); END IF;
  END LOOP;

  RETURN moved;
END;
$$;

-- ตัวช่วยนี้ยิง UPDATE ตามชื่อตารางที่ส่งมา — ห้ามให้ใครเรียกตรง ๆ
-- (Supabase มี default privileges ให้ anon/authenticated อยู่แล้ว ต้อง REVOKE ทีละ role)
REVOKE ALL ON FUNCTION public.merge_move_refs(text[], text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_move_refs(text[], text, uuid, uuid) FROM anon, authenticated;

-- ── 4. รวมเจ้าของสัตว์ (ลูกค้า) ──────────────────────────────────────────────
-- p_overrides = ค่าที่พนักงานเลือกเองในหน้าเปรียบเทียบ (เช่นเอาชื่อ/เบอร์ของใบที่จะลบ)
--   คีย์ที่ยอมรับ: name, last_name, phone, address, hn
--
-- แต้ม / เครดิต / ยอดซื้อสะสม = บวกรวมทุกใบ (เป็นของคนเดียวกันอยู่แล้ว)
-- HN = เลขที่เก่าสุดในกลุ่ม (ฐานเก่าสุดคือเลขที่ลูกค้าถืออยู่จริง) แก้ทับได้ด้วย overrides
CREATE OR REPLACE FUNCTION public.merge_customers(
  p_keep uuid,
  p_merge uuid[],
  p_overrides jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  c_tables text[] := ARRAY[
    'pets', 'visits', 'appointments', 'clinic_documents', 'transactions',
    'orders', 'customer_addresses', 'member_link_requests', 'customer_telegram_tokens'
  ];
  allowed text[] := ARRAY['name', 'last_name', 'phone', 'address', 'hn'];
  keep customers;
  dup customers;
  ids uuid[];
  overrides jsonb;
  moved jsonb;
  total jsonb := '{}'::jsonb;
  k text;
  merged int := 0;
  json_keep jsonb;
BEGIN
  -- เช็คสิทธิ์ที่ DB ด้วย ไม่ใช่เชื่อหน้าเว็บ (ใครก็ยิง rpc ตรงด้วย JWT ตัวเองได้)
  -- ยกเว้น service role ที่อยู่บนเซิร์ฟเวอร์เท่านั้นและข้าม RLS ได้ทุกตารางอยู่แล้ว
  -- (เผื่อสคริปต์ฝั่งเซิร์ฟเวอร์ / ตรวจการทำงานโดยไม่ต้องมี session พนักงาน)
  IF NOT public.is_admin()
     AND COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'รวมข้อมูลลูกค้าได้เฉพาะผู้ดูแลระบบ';
  END IF;

  -- ธงให้ trg_clinic_documents_guard ยอมให้ย้ายเอกสาร (หมดผลเมื่อจบทรานแซคชัน)
  PERFORM set_config('app.merging', 'on', true);

  SELECT * INTO keep FROM customers WHERE id = p_keep FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบลูกค้าที่จะเก็บไว้'; END IF;

  ids := ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(p_merge, '{}'::uuid[])) AS x
               WHERE x IS NOT NULL AND x <> p_keep);
  IF COALESCE(array_length(ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'ไม่ได้เลือกรายการที่จะรวมเข้ามา';
  END IF;

  -- รับเฉพาะคอลัมน์ที่อนุญาต กันส่ง points/total_spent มาทับยอดจริง
  SELECT COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb) INTO overrides
  FROM jsonb_each(COALESCE(p_overrides, '{}'::jsonb)) AS e
  WHERE e.key = ANY(allowed);

  json_keep := to_jsonb(keep);

  -- เรียงใบเก่าก่อน เพื่อให้ "เติมช่องที่ว่าง" ได้ค่าของใบที่เก่ากว่าเป็นหลัก
  FOR dup IN SELECT * FROM customers WHERE id = ANY(ids) ORDER BY created_at, id FOR UPDATE LOOP
    moved := public.merge_move_refs(c_tables, 'customer_id', dup.id, p_keep);

    -- ยอดสะสมบวกรวม
    json_keep := json_keep || jsonb_build_object(
      'points',         (json_keep->>'points')::int + dup.points,
      'total_spent',    (json_keep->>'total_spent')::numeric + dup.total_spent,
      'credit_balance', (json_keep->>'credit_balance')::numeric + dup.credit_balance
    );

    -- ช่องที่ตัวที่เก็บไว้ยังว่าง เติมจากใบที่จะลบ (ข้อมูลครบขึ้น ไม่ทับของเดิม)
    IF json_keep->>'address' IS NULL AND dup.address IS NOT NULL THEN
      json_keep := json_keep || jsonb_build_object('address', dup.address);
    END IF;
    -- นามสกุลเก็บทีหลัง ใบเก่าอาจมีที่ใบใหม่ยังว่าง (หรือกลับกัน) — ไม่ให้หายตอนรวม
    IF COALESCE(btrim(json_keep->>'last_name'), '') = '' AND COALESCE(btrim(dup.last_name), '') <> '' THEN
      json_keep := json_keep || jsonb_build_object('last_name', dup.last_name);
    END IF;
    IF json_keep->>'line_user_id' IS NULL AND dup.line_user_id IS NOT NULL THEN
      json_keep := json_keep || jsonb_build_object('line_user_id', dup.line_user_id);
    END IF;
    IF json_keep->>'telegram_chat_id' IS NULL AND dup.telegram_chat_id IS NOT NULL THEN
      json_keep := json_keep || jsonb_build_object(
        'telegram_chat_id', dup.telegram_chat_id,
        'telegram_linked_at', to_jsonb(dup.telegram_linked_at)
      );
    END IF;
    -- HN เก่าสุดชนะ (เลขในเวชระเบียนกระดาษของลูกค้า)
    IF dup.hn IS NOT NULL AND (json_keep->>'hn' IS NULL OR dup.hn < json_keep->>'hn') THEN
      json_keep := json_keep || jsonb_build_object('hn', dup.hn);
    END IF;

    INSERT INTO merge_log (kind, kept_id, kept_hn, kept_name, merged_id, merged_hn,
                           merged_name, merged_phone, snapshot, moved, merged_by)
    VALUES ('customer', p_keep, keep.hn, keep.name, dup.id, dup.hn,
            dup.name, dup.phone, to_jsonb(dup), moved, auth.uid());

    DELETE FROM customers WHERE id = dup.id;
    merged := merged + 1;

    FOR k IN SELECT jsonb_object_keys(moved) LOOP
      total := total || jsonb_build_object(k, COALESCE((total->>k)::int, 0) + (moved->>k)::int);
    END LOOP;
  END LOOP;

  -- ค่าที่พนักงานเลือกเองมาทับท้ายสุด — ทำหลังลบใบซ้ำแล้ว เบอร์/HN ที่ unique จึงว่างให้ย้ายมาได้
  json_keep := json_keep || overrides;

  UPDATE customers AS t SET
    name = r.name,
    last_name = r.last_name,
    phone = r.phone,
    hn = r.hn,
    address = r.address,
    points = r.points,
    total_spent = r.total_spent,
    credit_balance = r.credit_balance,
    line_user_id = r.line_user_id,
    telegram_chat_id = r.telegram_chat_id,
    telegram_linked_at = r.telegram_linked_at
  FROM jsonb_populate_record(NULL::customers, json_keep) AS r
  WHERE t.id = p_keep;

  -- ที่อยู่จัดส่งอาจมี "ค่าเริ่มต้น" ติดมาหลายใบ เหลือไว้ใบเดียว
  IF to_regclass('public.customer_addresses') IS NOT NULL THEN
    UPDATE customer_addresses SET is_default = false
    WHERE customer_id = p_keep AND is_default
      AND id <> (SELECT id FROM customer_addresses
                 WHERE customer_id = p_keep AND is_default
                 ORDER BY created_at, id LIMIT 1);
  END IF;

  RETURN jsonb_build_object('kind', 'customer', 'kept_id', p_keep, 'merged', merged, 'moved', total);
END;
$$;

REVOKE ALL ON FUNCTION public.merge_customers(uuid, uuid[], jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_customers(uuid, uuid[], jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.merge_customers(uuid, uuid[], jsonb) TO authenticated;

-- ── 5. รวมสัตว์เลี้ยง ────────────────────────────────────────────────────────
-- ประวัติตรวจรักษา / นัด / วัคซีน / เอกสาร ย้ายมาอยู่กับตัวที่เก็บไว้ทั้งหมด
-- visits.customer_id (คนที่พามาวันนั้น) ไม่แตะ — เป็น snapshot ของบิลวันนั้น
--
-- pets.hn ของตัวที่เก็บไว้ไม่เปลี่ยน (เลขเวชระเบียนของสัตว์ตัวนั้น)
-- เลขของตัวที่ถูกรวมไปอยู่ใน merge_log ค้นเจอได้
CREATE OR REPLACE FUNCTION public.merge_pets(
  p_keep uuid,
  p_merge uuid[],
  p_overrides jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  p_tables text[] := ARRAY['visits', 'appointments', 'pet_vaccinations', 'clinic_documents'];
  allowed text[] := ARRAY[
    'customer_id', 'name', 'species', 'breed', 'sex', 'birth_date', 'color', 'microchip',
    'sterilized', 'sterilized_date', 'allergies', 'chronic_conditions', 'notes', 'photo_url', 'active'
  ];
  -- ช่องที่ "ว่างอยู่ก็เติมให้" จากตัวที่จะลบ
  fillable text[] := ARRAY[
    'breed', 'sex', 'birth_date', 'color', 'microchip', 'sterilized_date',
    'allergies', 'chronic_conditions', 'notes', 'photo_url'
  ];
  keep pets;
  dup pets;
  ids uuid[];
  overrides jsonb;
  moved jsonb;
  total jsonb := '{}'::jsonb;
  dup_json jsonb;
  f text;
  k text;
  merged int := 0;
  json_keep jsonb;
BEGIN
  -- เช็คสิทธิ์ที่ DB ด้วย ไม่ใช่เชื่อหน้าเว็บ (ใครก็ยิง rpc ตรงด้วย JWT ตัวเองได้)
  -- ยกเว้น service role ที่อยู่บนเซิร์ฟเวอร์เท่านั้นและข้าม RLS ได้ทุกตารางอยู่แล้ว
  -- (เผื่อสคริปต์ฝั่งเซิร์ฟเวอร์ / ตรวจการทำงานโดยไม่ต้องมี session พนักงาน)
  IF NOT public.is_admin()
     AND COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'รวมข้อมูลสัตว์เลี้ยงได้เฉพาะผู้ดูแลระบบ';
  END IF;

  -- ธงให้ trg_clinic_documents_guard ยอมให้ย้ายเอกสาร (หมดผลเมื่อจบทรานแซคชัน)
  PERFORM set_config('app.merging', 'on', true);

  SELECT * INTO keep FROM pets WHERE id = p_keep FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบสัตว์เลี้ยงที่จะเก็บไว้'; END IF;

  ids := ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(p_merge, '{}'::uuid[])) AS x
               WHERE x IS NOT NULL AND x <> p_keep);
  IF COALESCE(array_length(ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'ไม่ได้เลือกรายการที่จะรวมเข้ามา';
  END IF;

  SELECT COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb) INTO overrides
  FROM jsonb_each(COALESCE(p_overrides, '{}'::jsonb)) AS e
  WHERE e.key = ANY(allowed);

  json_keep := to_jsonb(keep);

  FOR dup IN SELECT * FROM pets WHERE id = ANY(ids) ORDER BY created_at, id FOR UPDATE LOOP
    moved := public.merge_move_refs(p_tables, 'pet_id', dup.id, p_keep);
    dup_json := to_jsonb(dup);

    FOREACH f IN ARRAY fillable LOOP
      IF json_keep->>f IS NULL AND dup_json->>f IS NOT NULL THEN
        json_keep := json_keep || jsonb_build_object(f, dup_json->f);
      END IF;
    END LOOP;

    -- ทำหมันแล้ว: ถ้าใบใดใบหนึ่งบอกว่าทำแล้ว ให้ถือว่าทำแล้ว
    IF dup.sterilized AND NOT (json_keep->>'sterilized')::boolean THEN
      json_keep := json_keep || jsonb_build_object('sterilized', true);
    END IF;

    INSERT INTO merge_log (kind, kept_id, kept_hn, kept_name, merged_id, merged_hn,
                           merged_name, merged_phone, snapshot, moved, merged_by)
    VALUES ('pet', p_keep, keep.hn, keep.name, dup.id, dup.hn,
            dup.name, NULL, dup_json, moved, auth.uid());

    DELETE FROM pets WHERE id = dup.id;
    merged := merged + 1;

    FOR k IN SELECT jsonb_object_keys(moved) LOOP
      total := total || jsonb_build_object(k, COALESCE((total->>k)::int, 0) + (moved->>k)::int);
    END LOOP;
  END LOOP;

  json_keep := json_keep || overrides;

  UPDATE pets AS t SET
    customer_id = r.customer_id,
    name = r.name,
    species = r.species,
    breed = r.breed,
    sex = r.sex,
    birth_date = r.birth_date,
    color = r.color,
    microchip = r.microchip,
    sterilized = r.sterilized,
    sterilized_date = r.sterilized_date,
    allergies = r.allergies,
    chronic_conditions = r.chronic_conditions,
    notes = r.notes,
    photo_url = r.photo_url,
    active = r.active
  FROM jsonb_populate_record(NULL::pets, json_keep) AS r
  WHERE t.id = p_keep;

  RETURN jsonb_build_object('kind', 'pet', 'kept_id', p_keep, 'merged', merged, 'moved', total);
END;
$$;

REVOKE ALL ON FUNCTION public.merge_pets(uuid, uuid[], jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_pets(uuid, uuid[], jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.merge_pets(uuid, uuid[], jsonb) TO authenticated;
