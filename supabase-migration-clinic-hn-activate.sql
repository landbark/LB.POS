-- เปิดใช้ HN อัตโนมัติ — รันหลัง backfill เลขจากระบบเดิมเข้า customers.hn / pets.hn แล้ว
-- (ถ้าเปิด trigger ก่อน backfill ลูกค้าที่สมัครระหว่างนั้นจะได้ 690001 ซึ่งระบบเดิมใช้ไปแล้ว)
-- ต่อจาก supabase-migration-clinic-hn.sql

CREATE OR REPLACE FUNCTION public.set_customer_hn()
RETURNS trigger
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.hn IS NULL THEN NEW.hn := next_customer_hn(); END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_pet_hn()
RETURNS trigger
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.hn IS NULL THEN NEW.hn := next_pet_hn(NEW.customer_id); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_hn ON customers;
CREATE TRIGGER trg_customers_hn BEFORE INSERT ON customers
  FOR EACH ROW EXECUTE FUNCTION set_customer_hn();

DROP TRIGGER IF EXISTS trg_pets_hn ON pets;
CREATE TRIGGER trg_pets_hn BEFORE INSERT ON pets
  FOR EACH ROW EXECUTE FUNCTION set_pet_hn();

-- ออก HN ให้แถวเก่าที่ยังว่าง เรียงตามวันลงทะเบียน
-- ใช้หลัง backfill เลขจากระบบเดิม เพื่อให้ลูกค้า/สัตว์ที่เพิ่งสร้างในระบบใหม่
-- ได้เลขต่อท้ายของจริง ไม่ใช่ไปทับเลขที่ระบบเดิมใช้อยู่
CREATE OR REPLACE FUNCTION public.assign_missing_hn()
RETURNS TABLE (customers_filled int, pets_filled int)
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  r record;
  c_count int := 0;
  p_count int := 0;
BEGIN
  FOR r IN SELECT id FROM customers WHERE hn IS NULL ORDER BY created_at, id LOOP
    UPDATE customers SET hn = next_customer_hn() WHERE id = r.id;
    c_count := c_count + 1;
  END LOOP;

  FOR r IN SELECT id, customer_id FROM pets WHERE hn IS NULL ORDER BY created_at, id LOOP
    UPDATE pets SET hn = next_pet_hn(r.customer_id) WHERE id = r.id;
    p_count := p_count + 1;
  END LOOP;

  RETURN QUERY SELECT c_count, p_count;
END;
$$;
