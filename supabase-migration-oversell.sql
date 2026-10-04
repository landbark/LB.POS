-- ขายเกินสต็อคได้ (ของมีจริงบนชั้นแต่ยอดในระบบหมด)
-- เดิม product_lots.quantity มี CHECK (quantity >= 0) ทำให้หน้าขายตัดสต็อคต่อไม่ได้
-- ถอดออกเพื่อให้ยอดติดลบไว้ฟ้องว่าล็อตนั้นต้องไปนับสต็อคใหม่
ALTER TABLE product_lots DROP CONSTRAINT IF EXISTS product_lots_quantity_check;
