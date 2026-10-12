-- LANDBARK POS — Migration: วิธีใช้ยาแบบมีโครงสร้าง + คำนวณจำนวนยา
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)

-- เดิมมีแต่ dosage เป็นข้อความอิสระ พิมพ์ฉลากไม่ได้มาตรฐานและคำนวณจำนวนยาให้ไม่ได้
ALTER TABLE visit_items
  -- จำนวนต่อครั้ง รองรับเศษเม็ด 0.5 / 0.333 / 0.25
  ADD COLUMN IF NOT EXISTS dose_amount NUMERIC(8,3) CHECK (dose_amount IS NULL OR dose_amount > 0),
  -- sid=วันละครั้ง bid=วันละ 2 tid=วันละ 3 qid=วันละ 4 q_h=ทุกๆ กี่ชั่วโมง prn=เมื่อมีอาการ
  ADD COLUMN IF NOT EXISTS frequency TEXT
    CHECK (frequency IS NULL OR frequency IN ('sid', 'bid', 'tid', 'qid', 'q_h', 'prn')),
  -- ใช้เมื่อ frequency = 'q_h'
  ADD COLUMN IF NOT EXISTS frequency_hours INT CHECK (frequency_hours IS NULL OR frequency_hours BETWEEN 1 AND 24),
  -- ac = ก่อนอาหาร, pc = หลังอาหาร, wm = พร้อมอาหาร
  ADD COLUMN IF NOT EXISTS food_timing TEXT CHECK (food_timing IS NULL OR food_timing IN ('ac', 'pc', 'wm')),
  ADD COLUMN IF NOT EXISTS duration_days INT CHECK (duration_days IS NULL OR duration_days > 0);
