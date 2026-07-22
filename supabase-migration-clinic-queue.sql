-- โมดูลคลินิก: คิวรอตรวจ (2026-07-23)
-- แคชเชียร์หน้าร้านลงทะเบียนสัตว์ป่วย + ชั่งน้ำหนัก แล้วส่งเข้าคิวให้หมอเรียกตรวจ
-- waiting = ลงทะเบียนแล้วรอหมอ, open = หมอกำลังตรวจอยู่
ALTER TABLE visits DROP CONSTRAINT IF EXISTS visits_status_check;
ALTER TABLE visits ADD CONSTRAINT visits_status_check
  CHECK (status IN ('waiting', 'open', 'pending_payment', 'paid', 'cancelled'));
