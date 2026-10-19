// Service worker ขั้นต่ำสุด — มีไว้ให้ Chrome ยอมให้ "ติดตั้ง" เป็นแอปบนมือถือ
// (เกณฑ์ติดตั้งของ Chrome ต้องมี service worker ที่มี fetch handler)
//
// ตั้งใจไม่แคชอะไรเลย: POS ต้องเห็นสต็อค/ราคาล่าสุดเสมอ ถ้าแคชไว้แล้วหน้าค้างรุ่นเก่า
// จะขายผิดราคาโดยไม่รู้ตัว — fetch handler นี้ปล่อยผ่านทุก request ตามปกติ
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
