-- LANDBARK POS — Migration: ลงเงินเข้า-ออกเก๊ะได้ตอนไม่มีกะเปิด
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่พังของเดิม)

-- shift_id เคยเป็น NOT NULL พนักงานที่หยิบเงินออกจากเก๊ะหลังปิดกะ (ไปซื้อของ/จ่ายค่าส่ง)
-- จึงไม่มีช่องให้ลงเลย เงินก้อนนั้นโผล่เป็น "เงินขาด" ตอนเปิดกะเช้าวันรุ่งขึ้นแทน
-- ตอนนี้ลงไว้แบบยังไม่ผูกกะได้ แล้ว openShift() จะผูกเข้ากะใหม่ให้ตอนเปิดกะเช้าถัดไป
-- พร้อมหักออกจากยอดตั้งต้น (ดู src/lib/shiftOpen.ts)
ALTER TABLE cash_movements ALTER COLUMN shift_id DROP NOT NULL;

-- หาค้างเร็ว ๆ ตอนเปิดกะ — findOrphanSales() ถามด้วย shift_id IS NULL + created_at >= เวลาปิดกะล่าสุด
CREATE INDEX IF NOT EXISTS idx_cash_movements_pending
  ON cash_movements(created_at) WHERE shift_id IS NULL;
