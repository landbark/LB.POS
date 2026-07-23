-- โมดูลคลินิก: พันธุ์สัตว์ 2 ภาษา (2026-07-23)
-- แยกเก็บ name_en / name_th แล้ว compose เป็น "English / ไทย" ไว้ใน name (ใช้แสดง + ก็อปลง pets.breed)
-- ต้องรัน supabase-migration-clinic-breeds.sql มาก่อน

ALTER TABLE breeds ADD COLUMN IF NOT EXISTS name_en TEXT;
ALTER TABLE breeds ADD COLUMN IF NOT EXISTS name_th TEXT;

-- ของเดิม name เก็บชื่อไทยไว้
UPDATE breeds SET name_th = name WHERE name_th IS NULL;

-- เติมภาษาอังกฤษให้พันธุ์ที่ seed ไว้ (match ด้วยชื่อไทย)
UPDATE breeds AS b SET name_en = v.en FROM (VALUES
  ('ชิวาวา', 'Chihuahua'),
  ('ปอมเมอเรเนียน', 'Pomeranian'),
  ('ปั๊ก', 'Pug'),
  ('ชิห์สุ', 'Shih Tzu'),
  ('บีเกิล', 'Beagle'),
  ('โกลเด้น รีทรีฟเวอร์', 'Golden Retriever'),
  ('ลาบราดอร์ รีทรีฟเวอร์', 'Labrador Retriever'),
  ('ไซบีเรียน ฮัสกี้', 'Siberian Husky'),
  ('พุดเดิ้ล', 'Poodle'),
  ('ยอร์คเชียร์ เทอร์เรีย', 'Yorkshire Terrier'),
  ('ชเนาเซอร์', 'Schnauzer'),
  ('เฟรนช์ บูลด็อก', 'French Bulldog'),
  ('อิงลิช บูลด็อก', 'English Bulldog'),
  ('ร็อตไวเลอร์', 'Rottweiler'),
  ('เยอรมัน เชพเพิร์ด', 'German Shepherd'),
  ('ดัชชุน', 'Dachshund'),
  ('มอลทีส', 'Maltese'),
  ('บิชอง ฟริเซ่', 'Bichon Frise'),
  ('คอร์กี้', 'Corgi'),
  ('ชเปิร์ซ', 'Spitz'),
  ('ไทยหลังอาน', 'Thai Ridgeback'),
  ('ไทยบางแก้ว', 'Thai Bangkaew'),
  ('ไทยพันธุ์ผสม', 'Thai Mixed Breed'),
  ('ไทยวิเชียรมาศ', 'Siamese'),
  ('ไทยศุภลักษณ์', 'Suphalak'),
  ('ไทยโคราช (สีสวาด)', 'Korat'),
  ('เปอร์เซีย', 'Persian'),
  ('สก็อตติช โฟลด์', 'Scottish Fold'),
  ('บริติช ช็อตแฮร์', 'British Shorthair'),
  ('อเมริกัน ช็อตแฮร์', 'American Shorthair'),
  ('เมนคูน', 'Maine Coon'),
  ('เอ็กโซติก ช็อตแฮร์', 'Exotic Shorthair'),
  ('แร็กดอลล์', 'Ragdoll'),
  ('สฟิงซ์', 'Sphynx'),
  ('เบงกอล', 'Bengal'),
  ('มันช์กิน', 'Munchkin'),
  ('นอร์วีเจียน ฟอเรสต์', 'Norwegian Forest'),
  ('แมวไทยพันธุ์ผสม', 'Thai Mixed Breed'),
  ('นกแก้ว', 'Parrot'),
  ('นกหงส์หยก', 'Budgerigar'),
  ('นกค็อกคาเทล', 'Cockatiel'),
  ('นกเลิฟเบิร์ด', 'Lovebird'),
  ('นกมาคอว์', 'Macaw'),
  ('นกกระตั้ว', 'Cockatoo'),
  ('ฮอลแลนด์ ลอป', 'Holland Lop'),
  ('เนเธอร์แลนด์ ดวอฟ', 'Netherland Dwarf'),
  ('ไลอ้อนเฮด', 'Lionhead'),
  ('เร็กซ์', 'Rex'),
  ('อังโกร่า', 'Angora'),
  ('กระต่ายพันธุ์ผสม', 'Mixed Breed'),
  ('แฮมสเตอร์แคระ', 'Dwarf Hamster'),
  ('แฮมสเตอร์ซีเรีย', 'Syrian Hamster'),
  ('หนูตะเภา (แกสบี้)', 'Guinea Pig'),
  ('ชูการ์ไกลเดอร์', 'Sugar Glider'),
  ('เม่นแคระ', 'Pygmy Hedgehog'),
  ('ชินชิล่า', 'Chinchilla'),
  ('เต่าบก', 'Tortoise'),
  ('เต่าน้ำ', 'Turtle'),
  ('อิกัวน่า', 'Iguana'),
  ('มังกรเครา (Bearded dragon)', 'Bearded Dragon'),
  ('งูข้าวโพด', 'Corn Snake'),
  ('ตุ๊กแกเสือดาว', 'Leopard Gecko')
) AS v(th, en)
WHERE b.name_th = v.th;

-- compose ชื่อแสดงผลใหม่ = "English / ไทย" (มีภาษาเดียวใช้ภาษานั้น)
UPDATE breeds SET name = CASE
  WHEN name_en IS NOT NULL AND name_en <> '' AND name_th IS NOT NULL AND name_th <> '' THEN name_en || ' / ' || name_th
  WHEN name_en IS NOT NULL AND name_en <> '' THEN name_en
  ELSE name_th
END;
