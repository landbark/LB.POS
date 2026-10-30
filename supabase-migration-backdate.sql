-- LANDBARK POS — Migration: คีย์บิลย้อนหลัง (ขายตอนเน็ตล่มแล้วมาคีย์ตามทีหลัง)
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม ไม่ต้อง backfill)
--
-- ความหมายของเวลาสองตัวในบิล — อย่าสลับกัน:
--   created_at  = เวลาที่ "ขายจริง" (รายงาน/สรุปกะ/VAT/ใบเสร็จ อ่านตัวนี้อยู่แล้วทุกจุด)
--   recorded_at = เวลาที่กดบันทึกเข้าระบบ · NULL = คีย์ตอนขาย (บิลปกติ)
--
-- เลยไม่ต้องแก้รายงานสักหน้า: บิลย้อนหลังไปโผล่ในวันที่ขายจริงเอง ซึ่งเป็นสิ่งที่ถูก
-- ส่วน recorded_at มีไว้ให้ตรวจย้อนได้ว่าบิลนี้คีย์ตามหลัง ไม่ได้คีย์สดตอนลูกค้ายืนอยู่

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS backdate_reason TEXT;

COMMENT ON COLUMN transactions.created_at IS 'เวลาที่ขายจริง — บิลย้อนหลังจะเป็นเวลาที่เน็ตล่ม ไม่ใช่เวลาที่คีย์';
COMMENT ON COLUMN transactions.recorded_at IS 'เวลาที่กดบันทึกเข้าระบบ · NULL = คีย์ตอนขาย (trigger เขียนให้เอง แก้จากฝั่งแอปไม่ได้)';
COMMENT ON COLUMN transactions.backdate_reason IS 'ทำไมถึงคีย์ย้อนหลัง เช่น เน็ตล่ม / ไฟดับ';

-- ค้นบิลย้อนหลังในทะเบียนใบเสร็จ — บิลปกติเป็น NULL ทั้งหมด อินเด็กซ์เลยเล็กมาก
CREATE INDEX IF NOT EXISTS idx_transactions_recorded_at ON transactions(recorded_at) WHERE recorded_at IS NOT NULL;

-- ติดธงบิลย้อนหลังให้เองตอน INSERT + กันลงวันเพี้ยน
--
-- ตั้งใจให้ trigger เป็นคนเขียน recorded_at ไม่ใช่ฝั่งแอป เพราะ RLS ของตารางนี้เปิดให้
-- พนักงานเขียนได้ทุกคอลัมน์ (`auth manage transactions`) — ถ้าแอปเป็นคนส่งมา คนที่ยิง
-- API ตรงก็ย้อนวันขายได้เงียบ ๆ โดยไม่ติดธง
--
-- เกณฑ์ 2 นาที: เผื่อนาฬิกาเครื่องแคชเชียร์เพี้ยนกับความหน่วงของเน็ต ไม่ใช่เจตนาย้อนหลัง
CREATE OR REPLACE FUNCTION public.stamp_backdated_transaction()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.created_at IS NULL THEN
    NEW.created_at := now();
  END IF;

  IF NEW.created_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'ลงวันขายล่วงหน้าไม่ได้';
  END IF;

  -- เกิน 7 วันคือกรอกวันผิด (หรือกำลังยัดข้อมูลเก่า) — ปิดกะไปหลายกะแล้ว เงินสดไม่มีทางตรง
  IF NEW.created_at < now() - interval '7 days' THEN
    RAISE EXCEPTION 'คีย์ย้อนหลังได้ไม่เกิน 7 วัน';
  END IF;

  IF NEW.created_at < now() - interval '2 minutes' THEN
    NEW.recorded_at := now();
  ELSE
    -- บิลปกติ: ล้างค่าที่ส่งมา (ถ้ามี) ให้เป็น NULL เสมอ — ธงนี้ปลอมไม่ได้
    NEW.recorded_at := NULL;
    NEW.backdate_reason := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_backdated_transaction ON transactions;
CREATE TRIGGER stamp_backdated_transaction
  BEFORE INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION public.stamp_backdated_transaction();

-- เลขที่บิลต้องเป็นของ "วันที่ขาย" ไม่ใช่วันที่คีย์
--
-- ของเดิมฝัง to_char(now()) ไว้ตรง ๆ — บิลที่ขายเมื่อวานแล้วคีย์วันนี้จะได้เลข RC<วันนี้>
-- ซึ่งขัดกับวันที่บนใบเสร็จ (ใบเสร็จพิมพ์ created_at) และทำให้ไล่เลขในทะเบียนไม่ตรงวัน
--
-- ต้อง DROP ตัวไม่มีพารามิเตอร์ก่อน ไม่งั้นเรียกแบบไม่ใส่อาร์กิวเมนต์จะกำกวมระหว่างสองตัว
-- (`function next_transaction_number() is not unique`) — ตัวใหม่มีค่าตั้งต้นเป็น now()
-- เลยยังเรียก rpc('next_transaction_number') เปล่า ๆ ได้เหมือนเดิมทุกที่
DROP FUNCTION IF EXISTS public.next_transaction_number();
CREATE OR REPLACE FUNCTION public.next_transaction_number(p_at timestamptz DEFAULT now())
RETURNS text
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  prefix text := 'RC' || to_char(p_at AT TIME ZONE 'Asia/Bangkok', 'DDMMYYYY');
  seq int;
BEGIN
  SELECT COALESCE(MAX(SUBSTRING(transaction_number FROM 11)::int), 0) + 1
  INTO seq
  FROM transactions
  WHERE transaction_number LIKE prefix || '%';
  RETURN prefix || LPAD(seq::text, 4, '0');
END;
$$;
