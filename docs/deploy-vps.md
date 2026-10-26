# ย้าย LANDBARK POS จาก Vercel ไปรันบน VPS

ทำไมถึงย้าย: Vercel Hobby ห้ามใช้เชิงพาณิชย์ และระบบนี้มีร้านขายของออนไลน์อยู่ด้วย
ส่วน Vercel Pro คือ $20/เดือน แพงเกินเหตุสำหรับร้านเดียว — VPS ตัวละ ~$5 จบ
และยังรันเว็บตัวอื่นของร้านบนเครื่องเดียวกันได้อีก

ทำไมไม่ใช่ Cloudflare Workers: free tier จำกัด CPU 10 ms ต่อ request ซึ่งเรนเดอร์หน้า
Next ไม่ทัน (ต้องขึ้นแผน $5 อยู่ดี) แถม `src/proxy.ts` ที่คุมสิทธิ์ทั้งระบบยังอยู่ในสถานะ
experimental บน adapter ของ Cloudflare — เสี่ยงเกินไปสำหรับระบบที่ร้านใช้ขายของทุกวัน

บนเครื่อง Node ธรรมดาแบบนี้ Next รองรับครบทุกฟีเจอร์ ไม่ต้องแก้โค้ดสักบรรทัด

---

## ภาพรวม: build ที่ GitHub รันที่ VPS

วัดการใช้ RAM จริงของระบบนี้ไว้แล้ว **สองค่านี้ต่างกัน 13 เท่า**:

| | RAM |
|---|---|
| ตอน `next build` | **~1.7 GB** |
| ตอนรันเสิร์ฟจริง | **~126 MB** |

ถ้า build บน VPS ต้องซื้อเครื่อง 2 GB (~$12/เดือน) และร้านจะสะดุดทุกครั้งที่ deploy
เพราะ build แย่ง CPU กับตัวที่เสิร์ฟลูกค้าอยู่

เลยแยกออกเป็น: **GitHub build ให้ฟรี → ดัน image เข้า GitHub Container Registry → VPS ดึงไปรัน**
VPS เลยเหลือ 1 GB (~$5/เดือน) ก็พอ และ deploy ไม่กวนคนที่กำลังซื้อของอยู่

> GitHub ระบุว่า storage และ bandwidth ของ container image **ฟรีอยู่ตอนนี้** และจะแจ้งล่วงหน้า
> อย่างน้อย 1 เดือนถ้าจะเปลี่ยนนโยบาย — ถ้าวันนั้นมาถึงค่อยย้ายไป Docker Hub หรือกลับมา
> build บนเครื่อง (ดูท้ายไฟล์)

---

## 1. เตรียม VPS

เอาโซน **สิงคโปร์** เท่านั้น เพราะ Supabase ของร้านอยู่สิงคโปร์ (`sin1` เดิมบน Vercel ก็ตั้งไว้แบบนั้น)
อยู่ไกลกว่านี้ทุก query จะช้าลงทั้งระบบ

- สเปก: **1 vCPU / 1 GB RAM / 25 GB SSD** (~$5-6/เดือน) — พอสบายเพราะไม่ได้ build บนเครื่องนี้
- เจ้าที่มีโซนสิงคโปร์: Vultr, DigitalOcean, Linode (Hetzner ไม่มีแพ็กเกจถูกในสิงคโปร์)

เลือก image เป็น **Ubuntu LTS ตัวล่าสุด (26.04)** — รองรับยาวถึงปี 2031 และ Docker มี package
ให้แล้ว เครื่องนี้ทำหน้าที่แค่รัน container เลยไม่ต้องกลัวของใหม่

ติดตั้ง Docker:

```bash
curl -fsSL https://get.docker.com | sh
```

เปิดไฟร์วอลล์เฉพาะที่จำเป็น:

```bash
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
```

เปิดอัปเดตความปลอดภัยอัตโนมัติ:

```bash
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
```

ตั้งเวลาเครื่องเป็น UTC ให้ตรงกับตอนอยู่ Vercel (cron ข้างล่างอิง UTC):

```bash
timedatectl set-timezone UTC
```

## 2. ชี้ DNS

สร้าง A record ของโดเมนชี้มาที่ IP ของ VPS

> ทำ **ก่อน** `docker compose up` เพราะ Caddy ต้องใช้โดเมนที่ชี้มาถูกแล้วในการขอใบ HTTPS

ยังไม่อยากตัดโดเมนจริงก็ใช้ซับโดเมนทดสอบก่อน เช่น `new.pos.example.com`
**ระหว่างนี้ Vercel ยังเสิร์ฟของเดิมอยู่ ร้านขายของได้ตามปกติ**

## 3. ดึงโค้ดและใส่ค่า env

```bash
git clone https://github.com/landbark/LB.POS.git
cd LB.POS
cp .env.example .env
nano .env
```

ค่าทั้งหมดก๊อปจาก Vercel ได้ที่ **Project Settings → Environment Variables**
อย่าลืมตั้ง `DOMAIN` กับ `NEXT_PUBLIC_SITE_URL` เป็นโดเมนใหม่

## 4. ให้ VPS ดึง image จาก GitHub ได้

image เป็นของ private ต้องล็อกอินก่อนหนึ่งครั้ง (อยู่ถาวร ไม่ต้องทำซ้ำ)

1. GitHub → Settings → Developer settings → **Personal access tokens (classic)** → Generate new token
2. ติ๊กสิทธิ์ **`read:packages`** อย่างเดียวพอ
3. บน VPS:

```bash
echo 'วาง-token-ตรงนี้' | docker login ghcr.io -u ชื่อผู้ใช้github --password-stdin
```

## 5. ตั้ง Secrets ใน GitHub

**repo → Settings → Secrets and variables → Actions → New repository secret**

ชุดที่ใช้ตอน build (ก๊อปจาก Vercel):

| ชื่อ |
|---|
| `NEXT_PUBLIC_SUPABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `NEXT_PUBLIC_SITE_URL` |
| `NEXT_PUBLIC_LIFF_ID` |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` |
| `SUPABASE_SERVICE_ROLE_KEY` |

ชุดที่ใช้ตอนส่งขึ้นเครื่อง:

| ชื่อ | ค่า |
|---|---|
| `VPS_HOST` | IP ของ VPS |
| `VPS_USER` | ชื่อผู้ใช้ที่ ssh เข้า (เช่น `root`) |
| `VPS_SSH_KEY` | **private key** ของคู่กุญแจที่สร้างข้างล่าง |

สร้างกุญแจเฉพาะงาน deploy (อย่าเอากุญแจส่วนตัวมาใช้):

```bash
# บนเครื่องตัวเอง
ssh-keygen -t ed25519 -f ~/.ssh/lbpos_deploy -N "" -C "github-actions-deploy"

# เอา public key ไปใส่ใน VPS
ssh-copy-id -i ~/.ssh/lbpos_deploy.pub ผู้ใช้@ไอพีVPS

# เอา private key ไปวางใน secret VPS_SSH_KEY (ทั้งก้อน รวมบรรทัด BEGIN/END)
cat ~/.ssh/lbpos_deploy
```

## 6. Deploy ครั้งแรก

push อะไรก็ได้เข้า `main` หรือเข้าแท็บ **Actions → Deploy → Run workflow**

GitHub จะ: ตรวจ lint → build image → push ขึ้น ghcr.io → ssh เข้า VPS ให้สลับไปใช้ image ใหม่
→ ยิงเช็คว่า `/login` ตอบ 200 ถ้าไม่ตอบจะขึ้นแดงให้เห็น

## 7. ตั้ง cron สองตัว

เดิม Vercel ยิงให้ตาม `vercel.json` ย้ายมาใช้ crontab ของเครื่องแทน
**route เช็ค `Authorization: Bearer $CRON_SECRET` อยู่แล้ว ไม่ต้องแก้โค้ด**

`crontab -e` แล้วใส่ (ใช้ค่า `CRON_SECRET` เดียวกับใน `.env`):

```cron
0 1  * * * curl -fsS -H "Authorization: Bearer ใส่CRON_SECRET" https://โดเมนของคุณ/api/cron/stock-alerts  > /dev/null
0 13 * * * curl -fsS -H "Authorization: Bearer ใส่CRON_SECRET" https://โดเมนของคุณ/api/cron/daily-summary > /dev/null
```

> เวลาเป็น **UTC** เหมือนที่ Vercel ใช้ — `0 1` = 08:00 น. และ `0 13` = 20:00 น. เวลาไทย

## 8. สิ่งที่ต้องไปแก้ที่อื่นตอนสลับโดเมน ⚠️

พลาดบ่อยที่สุด — ของพวกนี้ผูกกับ **โดเมนเดิม** ต้องไล่แก้ให้ครบ:

| ที่ไหน | แก้อะไร |
|---|---|
| Supabase → Authentication → URL Configuration | เพิ่ม Site URL และ **Redirect URLs** ของโดเมนใหม่ — ไม่เพิ่มแล้วล็อกอินเสร็จจะเด้งกลับโดเมนเก่า |
| LINE Developers → LINE Login | Callback URL ใหม่ (`/api/shop/callback`) |
| LINE Developers → LIFF | Endpoint URL ใหม่ (`/member`) |
| Telegram | เรียก `setWebhook` ชี้มา `/api/telegram/webhook` ของโดเมนใหม่ |
| Shopee Open Platform | Redirect URL ใหม่ (`/api/shopee/callback`) ถ้าเปิดใช้อยู่ |
| GitHub secret `NEXT_PUBLIC_SITE_URL` | เปลี่ยนเป็นโดเมนใหม่ แล้ว **deploy ใหม่** (ค่านี้ฝังตอน build) |

## 9. อัปเดตเวอร์ชันใหม่

`git push` เข้า `main` — จบ เหมือนตอนใช้ Vercel

ตัวเก่ายังรันอยู่ตลอดจนกว่าตัวใหม่จะพร้อม ดาวน์ไม่ถึงวินาที

## 10. ถ้า deploy แล้วพัง — ย้อนกลับ

ทุก commit มี image ของตัวเองเก็บไว้ ชี้กลับไปตัวเก่าได้เลย:

```bash
cd ~/LB.POS
APP_IMAGE=ghcr.io/landbark/lb.pos:คอมมิตเก่า docker compose up -d
```

(หา SHA ได้จาก `git log` หรือหน้า Packages ของ repo)

## 11. เช็กลิสต์ก่อนตัดโดเมนจริง

ทดสอบบนซับโดเมนทดสอบให้ครบก่อน:

- [ ] ล็อกอินพนักงานได้ (admin / แคชเชียร์ / หมอ เข้าได้คนละหน้า)
- [ ] ขายของจบบิลได้ ปริ้นใบเสร็จออก
- [ ] เปิด/ปิดรอบกะ ยอดเงินตรง
- [ ] ยิงบาร์โค้ดจากกล้องได้ (ต้องมี HTTPS ถึงจะเปิดกล้องได้)
- [ ] อัปโหลดรูปสินค้าได้
- [ ] ร้านออนไลน์: ลูกค้าล็อกอิน LINE สั่งของได้
- [ ] แจ้งเตือน Telegram เข้า
- [ ] ยิง cron ด้วยมือดูว่าได้ 200
- [ ] ปุ่มสำรองข้อมูลในหน้าตั้งค่าโหลด zip ได้

ครบแล้วค่อยย้าย A record ของโดเมนจริง แล้วลบโปรเจกต์ออกจาก Vercel

---

## หมายเหตุทางเทคนิค

- `next.config.ts` เปิด `output: 'standalone'` **เฉพาะตอนมี `DOCKER_BUILD=1`** เพื่อไม่ให้
  กระทบ build ฝั่ง Vercel ระหว่างที่ยังใช้งานคู่กันอยู่
- ค่า `NEXT_PUBLIC_*` ถูกฝังลงบันเดิลตอน build ไม่ใช่อ่านตอนรัน — แก้ค่าพวกนี้ต้อง deploy ใหม่เสมอ
  (ใส่ใน `.env` บน VPS อย่างเดียวไม่มีผล)
- `SUPABASE_SERVICE_ROLE_KEY` ต้องมีตอน build ด้วย เพราะ `/api/favicon` ตั้ง `revalidate` ไว้
  Next เลย prerender ตั้งแต่ตอน build — key อยู่แค่ชั้น builder ไม่ติดไปกับ image ที่รันจริง
- เวลาในคอนเทนเนอร์เป็น UTC เหมือนตอนอยู่ Vercel โค้ดคิดวันไทยเองผ่าน `src/lib/thaiDate.ts`
  ซึ่งระบุ `timeZone: 'Asia/Bangkok'` ไว้ทุกฟังก์ชัน **อย่าตั้ง `TZ` ในคอนเทนเนอร์**
- **ถ้าจำเป็นต้อง build บน VPS เอง** (เช่น ghcr เลิกฟรี) ต้องมี RAM 2 GB หรือเพิ่ม swap ก่อน:
  ```bash
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  docker build -t ghcr.io/landbark/lb.pos:latest \
    --build-arg NEXT_PUBLIC_SUPABASE_URL=... --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
    --build-arg NEXT_PUBLIC_SITE_URL=... --build-arg NEXT_PUBLIC_LIFF_ID=... \
    --build-arg NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=... --build-arg SUPABASE_SERVICE_ROLE_KEY=... .
  ```
