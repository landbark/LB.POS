-- LANDBARK POS — Migration: ช่องข้อควรระวังในประวัติสัตว์
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)
--
-- เดิมมี allergies (แพ้ยา/อาหาร) + chronic_conditions (โรคประจำตัว) ซึ่งเป็นเรื่องทางยา
-- แต่สิ่งที่คนหน้าเคาน์เตอร์ต้องรู้ก่อนจับตัวสัตว์มีมากกว่านั้น — ดุ/กัด/ต้องใส่ตะกร้อ,
-- เจ้าของขอให้โทรก่อน, อุ้มท้องตรงไหนไม่ได้ — ของพวกนี้ไม่ใช่ "แพ้ยา" และไม่ใช่
-- "โรคประจำตัว" เลยไม่มีที่ลง แล้วไปจบที่ notes ซึ่งไม่เคยขึ้นเตือนที่ไหน
--
-- caution = ข้อความอิสระที่ขึ้นเป็นแถบเตือนทุกจุดที่เจอสัตว์ตัวนี้
-- (ค้นหา / ลงทะเบียน / ตรวจรักษา / ฉลากสัตว์ป่วย) — notes ยังเป็นบันทึกเงียบ ๆ เหมือนเดิม
-- แต่จากนี้ขึ้นให้เห็นในจุดเดียวกันด้วย ในโทนที่ไม่ตะโกน

ALTER TABLE pets ADD COLUMN IF NOT EXISTS caution TEXT;

-- ── รวมตัวซ้ำ: ให้ caution ติดไปด้วย ─────────────────────────────────────────
-- merge_pets มี whitelist คอลัมน์อยู่ข้างใน ถ้าไม่เติมชื่อคอลัมน์ใหม่เข้าไป
-- ข้อควรระวังของใบที่ถูกรวมทิ้งจะหายไปเฉย ๆ (เหลือแต่ใน snapshot ของ merge_log)
-- ตัวฟังก์ชันคัดลอกมาจาก supabase-migration-merge-duplicates.sql ทั้งก้อน
-- แก้แค่สามจุด: allowed / fillable / UPDATE SET

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
    'sterilized', 'sterilized_date', 'allergies', 'chronic_conditions', 'caution',
    'notes', 'photo_url', 'active'
  ];
  -- ช่องที่ "ว่างอยู่ก็เติมให้" จากตัวที่จะลบ
  fillable text[] := ARRAY[
    'breed', 'sex', 'birth_date', 'color', 'microchip', 'sterilized_date',
    'allergies', 'chronic_conditions', 'caution', 'notes', 'photo_url'
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
    caution = r.caution,
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
