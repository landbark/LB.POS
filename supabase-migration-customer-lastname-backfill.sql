-- แยกนามสกุลออกจากชื่อเดิม (2026-11-12)
--
-- ต่อจาก supabase-migration-customer-lastname.sql ที่เพิ่มคอลัมน์ไว้แล้ว
-- ชื่อเก่าถูกกรอกรวมกันมาในช่องเดียว ("สมชาย ใจดี") — ย้ายคำท้ายไปช่องนามสกุล
--
-- ⚠️ หลังรัน ใบเสร็จ/ฉลากยา/แจ้งเตือน Telegram จะขึ้นเฉพาะชื่อ (ไม่มีนามสกุล)
--    เพราะจุดพวกนั้นใช้ customers.name — ส่วนการค้นหาไม่กระทบ เพราะ full_name
--    ประกอบ name + last_name กลับมาได้ค่าเดิมเป๊ะ
--
-- กฎการแยก (แยกเฉพาะที่มั่นใจ ที่เหลือปล่อยไว้ให้คนดู)
--   - เหลือคำท้าย "คำเดียว" เท่านั้นถึงแยก  "สมชาย ใจดี" ✓ / "สมชาย ใจดี มากมาย" ✗
--   - คำนำหน้าที่เขียนแยก ("คุณ สมชาย ใจดี") นับรวมกับชื่อ ไม่ใช่นามสกุล
--   - คำท้ายต้องเป็นตัวอักษรล้วน  "(บ้านสวน)" / "ห้อง 3" / "ม.3" ✗
--   - ใบที่กรอกนามสกุลไว้แล้ว ไม่แตะ
--
-- รันใน Supabase SQL Editor ตามลำดับ 1 → 2 → 3 (รันซ้ำได้ ไม่พังของเดิม)

-- ════════════════════════════════════════════════════════════════════════
-- ขั้น 0 — สำรองชื่อเดิมไว้ก่อน (ย้อนกลับได้ทุกเมื่อ)
-- IF NOT EXISTS = รันซ้ำแล้วยังเก็บ "ชื่อก่อนแตะครั้งแรก" ไว้เหมือนเดิม
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS customers_name_backup AS
SELECT id, name, last_name, now() AS backed_up_at FROM customers;

ALTER TABLE customers_name_backup ENABLE ROW LEVEL SECURITY;


-- ════════════════════════════════════════════════════════════════════════
-- ขั้น 1 — ดูก่อนว่าจะเปลี่ยนอะไรบ้าง (ยังไม่แก้อะไร)
-- ════════════════════════════════════════════════════════════════════════
WITH p AS (
  SELECT id, name, last_name,
         string_to_array(btrim(regexp_replace(name, '\s+', ' ', 'g')), ' ') AS parts
  FROM customers
),
t AS (
  SELECT *,
    CASE WHEN coalesce(array_length(parts, 1), 0) >= 3
          AND lower(parts[1]) = ANY (ARRAY[
                'นาย','นาง','นางสาว','น.ส.','ด.ช.','ด.ญ.','เด็กชาย','เด็กหญิง',
                'คุณ','พี่','น้อง','หมอ','คุณหมอ',
                'mr','mrs','ms','miss','mr.','mrs.','ms.','khun','k.'])
         THEN 1 ELSE 0 END AS off
  FROM p
),
s AS (
  SELECT id, name, last_name,
         array_to_string(parts[1 : 1 + off], ' ') AS new_name,
         parts[(2 + off) : coalesce(array_length(parts, 1), 0)] AS rest
  FROM t
)
SELECT
  CASE
    WHEN coalesce(btrim(last_name), '') <> ''          THEN 'ข้าม — มีนามสกุลแล้ว'
    WHEN coalesce(array_length(rest, 1), 0) = 0        THEN 'ข้าม — ไม่มีเว้นวรรค'
    WHEN array_length(rest, 1) > 1                     THEN 'ข้าม — ท้ายชื่อหลายคำ ดูเอง'
    WHEN rest[1] !~ '^[A-Za-zก-๛]+$'                   THEN 'ข้าม — มีวงเล็บ/ตัวเลข ดูเอง'
    WHEN char_length(rest[1]) < 2                      THEN 'ข้าม — ท้ายชื่อสั้นเกิน ดูเอง'
    ELSE 'จะแยก'
  END AS ผลลัพธ์,
  count(*) AS จำนวน
FROM s
GROUP BY 1
ORDER BY 2 DESC;


-- ════════════════════════════════════════════════════════════════════════
-- ขั้น 2 — ดูรายตัวว่าชื่อไหนจะกลายเป็นอะไร (ยังไม่แก้ ตรวจก่อนค่อยไปขั้น 3)
-- เปลี่ยน 'จะแยก' เป็นข้อความอื่นในบรรทัด WHERE เพื่อดูกลุ่มที่ข้าม
-- ════════════════════════════════════════════════════════════════════════
WITH p AS (
  SELECT id, name, last_name,
         string_to_array(btrim(regexp_replace(name, '\s+', ' ', 'g')), ' ') AS parts
  FROM customers
),
t AS (
  SELECT *,
    CASE WHEN coalesce(array_length(parts, 1), 0) >= 3
          AND lower(parts[1]) = ANY (ARRAY[
                'นาย','นาง','นางสาว','น.ส.','ด.ช.','ด.ญ.','เด็กชาย','เด็กหญิง',
                'คุณ','พี่','น้อง','หมอ','คุณหมอ',
                'mr','mrs','ms','miss','mr.','mrs.','ms.','khun','k.'])
         THEN 1 ELSE 0 END AS off
  FROM p
),
s AS (
  SELECT id, name, last_name,
         array_to_string(parts[1 : 1 + off], ' ') AS new_name,
         parts[(2 + off) : coalesce(array_length(parts, 1), 0)] AS rest
  FROM t
),
c AS (
  SELECT *,
    CASE
      WHEN coalesce(btrim(last_name), '') <> ''   THEN 'ข้าม — มีนามสกุลแล้ว'
      WHEN coalesce(array_length(rest, 1), 0) = 0 THEN 'ข้าม — ไม่มีเว้นวรรค'
      WHEN array_length(rest, 1) > 1              THEN 'ข้าม — ท้ายชื่อหลายคำ ดูเอง'
      WHEN rest[1] !~ '^[A-Za-zก-๛]+$'            THEN 'ข้าม — มีวงเล็บ/ตัวเลข ดูเอง'
      WHEN char_length(rest[1]) < 2               THEN 'ข้าม — ท้ายชื่อสั้นเกิน ดูเอง'
      ELSE 'จะแยก'
    END AS ผลลัพธ์
  FROM s
)
SELECT ผลลัพธ์, name AS ชื่อเดิม, new_name AS ชื่อใหม่, array_to_string(rest, ' ') AS นามสกุลใหม่
FROM c
WHERE ผลลัพธ์ = 'จะแยก'
ORDER BY name;


-- ════════════════════════════════════════════════════════════════════════
-- ขั้น 2.5 — ตรวจจุดเสี่ยงในกลุ่ม "จะแยก" โดยไม่ต้องไล่อ่านทุกแถว
--
-- คำท้ายที่ "ซ้ำกันหลายคน" หรือ "สั้นมาก" มักไม่ใช่นามสกุล แต่เป็นชื่อเล่น
-- ชื่อสัตว์ หรือคำขยาย ("แอน หมา", "เก่ง ร้าน") — นามสกุลจริงซ้ำได้เฉพาะคนในบ้านเดียวกัน
-- ════════════════════════════════════════════════════════════════════════
WITH p AS (
  SELECT id, name, last_name,
         string_to_array(btrim(regexp_replace(name, '\s+', ' ', 'g')), ' ') AS parts
  FROM customers
),
t AS (
  SELECT *,
    CASE WHEN coalesce(array_length(parts, 1), 0) >= 3
          AND lower(parts[1]) = ANY (ARRAY[
                'นาย','นาง','นางสาว','น.ส.','ด.ช.','ด.ญ.','เด็กชาย','เด็กหญิง',
                'คุณ','พี่','น้อง','หมอ','คุณหมอ',
                'mr','mrs','ms','miss','mr.','mrs.','ms.','khun','k.'])
         THEN 1 ELSE 0 END AS off
  FROM p
),
s AS (
  SELECT id, name, last_name,
         array_to_string(parts[1 : 1 + off], ' ') AS new_name,
         parts[(2 + off) : coalesce(array_length(parts, 1), 0)] AS rest
  FROM t
),
ok AS (
  SELECT * FROM s
  WHERE coalesce(btrim(last_name), '') = ''
    AND array_length(rest, 1) = 1
    AND rest[1] ~ '^[A-Za-zก-๛]+$'
    AND char_length(rest[1]) >= 2
)
SELECT rest[1] AS นามสกุลที่จะได้,
       count(*) AS กี่คน,
       string_agg(name, '  |  ' ORDER BY name) AS ชื่อเดิม
FROM ok
GROUP BY 1
HAVING count(*) > 1 OR char_length(rest[1]) <= 3
ORDER BY count(*) DESC, 1;


-- ════════════════════════════════════════════════════════════════════════
-- ขั้น 3 — แยกจริง (ตรวจขั้น 2 แล้วค่อยรัน)
-- เงื่อนไขใน WHERE ตรงกับกฎข้างบนเป๊ะ — แถวที่ "ข้าม" ไม่ถูกแตะ
-- ════════════════════════════════════════════════════════════════════════
WITH p AS (
  SELECT id, name, last_name,
         string_to_array(btrim(regexp_replace(name, '\s+', ' ', 'g')), ' ') AS parts
  FROM customers
),
t AS (
  SELECT *,
    CASE WHEN coalesce(array_length(parts, 1), 0) >= 3
          AND lower(parts[1]) = ANY (ARRAY[
                'นาย','นาง','นางสาว','น.ส.','ด.ช.','ด.ญ.','เด็กชาย','เด็กหญิง',
                'คุณ','พี่','น้อง','หมอ','คุณหมอ',
                'mr','mrs','ms','miss','mr.','mrs.','ms.','khun','k.'])
         THEN 1 ELSE 0 END AS off
  FROM p
),
s AS (
  SELECT id, name, last_name,
         array_to_string(parts[1 : 1 + off], ' ') AS new_name,
         parts[(2 + off) : coalesce(array_length(parts, 1), 0)] AS rest
  FROM t
)
UPDATE customers AS cu
SET name = s.new_name,
    last_name = s.rest[1]
FROM s
WHERE cu.id = s.id
  AND coalesce(btrim(cu.last_name), '') = ''
  AND array_length(s.rest, 1) = 1
  AND s.rest[1] ~ '^[A-Za-zก-๛]+$'
  AND char_length(s.rest[1]) >= 2;


-- ════════════════════════════════════════════════════════════════════════
-- ย้อนกลับ (ถ้าผลไม่เข้าท่า) — คืนชื่อจากตารางสำรอง
-- ════════════════════════════════════════════════════════════════════════
-- UPDATE customers AS cu
-- SET name = b.name, last_name = b.last_name
-- FROM customers_name_backup b
-- WHERE cu.id = b.id;
