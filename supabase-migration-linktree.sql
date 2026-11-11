-- หน้าแรกลูกค้า: รวมช่องทางติดต่อไว้ที่ Linktree ลิงก์เดียว
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS linktree_url TEXT;
