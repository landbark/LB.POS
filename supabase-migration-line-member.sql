-- ผูกบัญชี LINE กับสมาชิก (สำหรับหน้าเช็คแต้มเอง /member ผ่าน LIFF)
ALTER TABLE customers ADD COLUMN line_user_id TEXT UNIQUE;
