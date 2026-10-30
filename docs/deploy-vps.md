# ย้าย LANDBARK POS จาก Vercel ไปรันบน VPS

ทำไมถึงย้าย: Vercel Hobby ห้ามใช้เชิงพาณิชย์ และระบบนี้มีร้านขายของออนไลน์อยู่ด้วย
พอชนลิมิต Hobby จะ **pause โปรเจกต์** ไม่ได้คิดเงินเพิ่ม — ร้านขายของไม่ได้ทันที
และเน็ตสำรอง 4G ช่วยอะไรไม่ได้เลยเพราะต้นเหตุไม่ได้อยู่ที่ร้าน

ทางเลือกที่เทียบแล้วเหลือจริงสองทาง (ราคา ต.ค. 2026):

| | ราคา | คิดต่อ |
|---|---|---|
| **VPS 2 GB สิงคโปร์** | ~$10-12/เดือน | ต่อ**เครื่อง** — ยัดกี่เว็บก็ได้ |
| Vercel Pro | $20/เดือน | ต่อ**ทีม** (รวม 1 seat + เครดิตใช้งาน $20) |

ต่างกันแค่ ~$8-10/เดือน ไม่ใช่ 4 เท่าอย่างที่เคยเขียนไว้ตอนคิดเทียบ "ร้านเดียว" เพราะ
Pro คิดต่อทีม จ่ายทีเดียวแก้เรื่อง commercial-use ให้ทุกโปรเจกต์พร้อมกัน

ที่ยังเลือก VPS เพราะเรามีเว็บอยู่ 7 ตัว (ดูหัวข้อ 12) ยัดเครื่องเดียวได้หมด และ
ของที่ต้องเตรียม — Dockerfile, workflow, compose, Caddyfile — ทำเสร็จไว้แล้วในรีโปนี้
แลกมาด้วยการที่เครื่องนี้ไม่มีสำรอง ถ้ามันล่มคือเราต้องกู้เอง (ดูหัวข้อ 13)

**Railway / Render / Fly.io ตัดทิ้งได้เลย** — คิดราคาต่อแอป พอมี 7 ตัวแพงกว่าทั้งสองทางข้างบน
(Render $7/service, Railway RAM $10/GB/เดือน + CPU $20/vCPU/เดือน) ส่วน Fly ถูกสุดต่อแอป
แต่ machine auto-stop แล้ว cold start — แคชเชียร์กดแล้วรอหน้าโหลดตอนลูกค้ายืนอยู่

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

ถ้า build บน VPS ร้านจะสะดุดทุกครั้งที่ deploy เพราะ build แย่ง CPU กับตัวที่เสิร์ฟลูกค้าอยู่

เลยแยกออกเป็น: **GitHub build ให้ฟรี → ดัน image เข้า GitHub Container Registry → VPS ดึงไปรัน**
เครื่องเลยทำหน้าที่แค่เสิร์ฟ และ deploy ไม่กวนคนที่กำลังซื้อของอยู่

> GitHub ระบุว่า storage และ bandwidth ของ container image **ฟรีอยู่ตอนนี้** และจะแจ้งล่วงหน้า
> อย่างน้อย 1 เดือนถ้าจะเปลี่ยนนโยบาย — ถ้าวันนั้นมาถึงค่อยย้ายไป Docker Hub หรือกลับมา
> build บนเครื่อง (ดูท้ายไฟล์)

---

## 1. เตรียม VPS

เอาโซน **สิงคโปร์** เท่านั้น เพราะ Supabase ของร้านอยู่สิงคโปร์ (`sin1` เดิมบน Vercel ก็ตั้งไว้แบบนั้น)
อยู่ไกลกว่านี้ทุก query จะช้าลงทั้งระบบ

- สเปก: **1 vCPU / 2 GB RAM / 50 GB SSD** (~$10-12/เดือน)
- เจ้าที่มีโซนสิงคโปร์: Vultr, DigitalOcean, Linode (Hetzner ไม่มีแพ็กเกจถูกในสิงคโปร์)

**ทำไม 2 GB ไม่ใช่ 1 GB** ทั้งที่แอปตัวเดียวกินแค่ ~126 MB — เพราะสองเรื่องนี้:

| | ต้องการ |
|---|---|
| เว็บ 7 ตัวของเรา (หัวข้อ 12) | ~880 MB + Caddy ~20 MB + Ubuntu ~250 MB ≈ **1.15 GB** |
| `next build` วันที่ ghcr เลิกฟรี | **~1.7 GB** |

1 GB รันตัวเดียวได้จริง แต่พอเพิ่มเว็บตัวที่สองก็ตัน แล้วต้องย้ายเครื่องกลางคัน
ส่วนต่าง $5-6/เดือนถูกกว่าการย้ายรอบสองเยอะ

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

เปิด swap 2 GB — เว็บทั้งหมดที่รันอยู่กินไปแล้วเกินครึ่งเครื่อง เหลือไม่พอ `next build`
ถ้าวันหนึ่งต้อง build เอง swap จะรับส่วนที่ล้น (ช้าแต่ไม่ OOM) และ build ก็นาน ๆ ทำที:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

> อย่าให้ของที่เสิร์ฟจริงตกลงไปอยู่ใน swap — ตั้ง `vm.swappiness=10` ให้เคอร์เนลหวงแรมไว้ก่อน
> ```bash
> echo 'vm.swappiness=10' >> /etc/sysctl.conf && sysctl -p
> ```

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

## 12. เพิ่มเว็บตัวอื่นเข้าเครื่องเดียวกัน

เครื่องนี้ซื้อมาเพื่อรันหลายเว็บ ไม่ใช่แค่ POS — ของที่เรามีตอนนี้:

| โปรเจกต์ | ย้ายมาได้ไหม |
|---|---|
| `landbark-pos` · `borjee` · `gaiseedvu` · `impong` · `petshop-tax` · `tstcvm` · `findthevet` | **ได้** — Next + Supabase เหมือนกันหมด |
| `jfk` | ได้ แต่**ไม่ต้อง** — อยู่บน Cloudflare Workers แล้ว (`open-next.config.ts` + `wrangler.jsonc`) ย้ายมาคือทิ้งของที่ตั้งไว้ |
| `vidcut` | **ไม่ควร** — Python + ffmpeg เรนเดอร์วิดีโอกิน CPU เต็มเครื่อง จะไปแย่งกับ POS ให้รันบน Mac ต่อไป |

### ของที่ต้องทำต่อรีโป (ไม่ได้ย้ายมาฟรี ๆ)

แต่ละตัวต้องมี `Dockerfile` + `.github/workflows/deploy.yml` + secrets ของตัวเอง
ก๊อปจากรีโปนี้ได้ แก้ชื่อ image กับรายการ `NEXT_PUBLIC_*` ให้ตรงของมัน
ส่วน `docker login ghcr.io` บนเครื่อง (หัวข้อ 4) ทำครั้งเดียวใช้ได้ทุกรีโป

> `petshop-tax` ใช้ `sharp` — Dockerfile ต้องได้ไบนารีตรงแพลตฟอร์ม ถ้าใช้ base เป็น alpine
> ให้ติดตั้งบน image เดียวกับที่รันจริง อย่าก๊อป `node_modules` ข้าม stage มาเฉย ๆ

### โครงที่ถูกต้อง: Caddy ตัวเดียวของเครื่อง

ตอนนี้ `docker-compose.yml` ของรีโปนี้มี Caddy ของตัวเองอยู่ ซึ่ง**ใช้ได้เฉพาะตอนมีเว็บเดียว**
เพราะพอร์ต 443 มีได้เจ้าเดียวทั้งเครื่อง พอจะเพิ่มเว็บตัวที่สอง ให้ยก Caddy ออกมาไว้ข้างนอก:

```
~/edge/              ← Caddy ตัวเดียว ถือ :80/:443 ของทั้งเครื่อง
~/LB.POS/            ← compose ของแอป ไม่มี caddy แล้ว
~/borjee/  ~/tstcvm/ ...
```

`~/edge/docker-compose.yml`:

```yaml
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    networks: [edge]

volumes:
  caddy_data:
  caddy_config:

networks:
  edge:
    name: edge
```

`~/edge/Caddyfile` — บล็อกละโดเมน ขอใบ HTTPS ให้เองทุกตัว:

```
pos.example.com {
	reverse_proxy lbpos:3000
}

borjee.example.com {
	reverse_proxy borjee:3000
}
```

แล้วใน `docker-compose.yml` ของแต่ละแอป ตัด service `caddy` กับ `volumes` ของมันทิ้ง
เหลือแค่ `app` แล้วต่อเข้าเน็ตเวิร์ก `edge`:

```yaml
services:
  app:
    image: ${APP_IMAGE:-ghcr.io/landbark/lb.pos:latest}
    env_file: .env
    restart: unless-stopped
    expose:
      - "3000"
    networks:
      edge:
        # ทุกแอปตั้งชื่อ service ว่า 'app' เหมือนกันหมด บนเน็ตเวิร์กร่วมจึงชนกัน
        # ต้องมี alias เฉพาะตัวให้ Caddy เรียกถูกเครื่อง
        aliases: [lbpos]

networks:
  edge:
    external: true
```

ลำดับตอนสลับ (ทำตอนจะเพิ่มเว็บตัวที่สอง ไม่ต้องทำคืนแรก):

```bash
cd ~/LB.POS && docker compose down        # ปล่อยพอร์ต 443
mkdir -p ~/edge && cd ~/edge              # วางสองไฟล์ข้างบน
docker compose up -d                      # Caddy ตัวกลางขึ้นก่อน (สร้าง network edge)
cd ~/LB.POS && docker compose up -d       # แอปเข้าไปเกาะ
```

> ใบรับรองเดิมอยู่ใน volume ของ compose ชุดเก่า ตัวใหม่จะขอใบใหม่ — ทำตอนร้านปิด
> และอย่าลองซ้ำหลายรอบติดกัน Let's Encrypt จำกัดจำนวนครั้งต่อโดเมนต่อสัปดาห์

### RAM เหลือเท่าไหร่

```bash
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}'
free -h
```

เว็บละ ~126 MB เพราะฉะนั้น 7 ตัวบนเครื่อง 2 GB ยังเหลือที่ว่างอยู่
ถ้าเห็น `free -h` เหลือต่ำกว่า ~300 MB ค่อยคิดขยับเป็น 4 GB

---

## 13. ซ้อมกู้เครื่อง — ทำก่อนตัดโดเมนจริง

ข้อแลกของ VPS คือเครื่องเดียวไม่มีสำรอง และเครื่องอยู่สิงคโปร์ เดินไปกดเองไม่ได้
แต่เพราะทุกอย่างอยู่ใน image บน ghcr + `docker-compose.yml` + `.env` การกู้คือเปิดเครื่องใหม่แล้ววางสามอย่างนี้กลับไป

**จับเวลาซ้อมจริงหนึ่งรอบ** บน VPS ตัวที่สอง (เปิดชั่วโมงเดียวแล้วลบ ค่าไม่กี่บาท):

1. เปิด VPS ใหม่ → `curl -fsSL https://get.docker.com | sh`
2. `docker login ghcr.io` (หัวข้อ 4)
3. `git clone` + วาง `.env` → `docker compose up -d`
4. ชี้ `/etc/hosts` บนเครื่องตัวเองมาที่ IP ใหม่ แล้วลองล็อกอิน + ขายหนึ่งบิล

ทำได้ใน 15-20 นาที = VPS คือคำตอบที่ถูกต้อง ถ้าติดขัดหลายจุด ให้กลับไปคิดเรื่อง Vercel Pro อีกที

⚠️ **เก็บ `.env` ไว้นอกเครื่องด้วย** (password manager / Keychain) — ในนั้นมี
`SUPABASE_SERVICE_ROLE_KEY` ที่เปิดฐานข้อมูลได้ทั้งร้าน ถ้าเครื่องหายไปพร้อมสำเนาเดียวที่มี ก็กู้ไม่ได้
ส่วนข้อมูลในฐานข้อมูลไม่ได้อยู่บนเครื่องนี้ — อยู่ที่ Supabase และมี `scripts/backup.ts` สำรองไว้ต่างหาก

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
- **ถ้าจำเป็นต้อง build บน VPS เอง** (เช่น ghcr เลิกฟรี) — swap ตั้งไว้แล้วตั้งแต่หัวข้อ 1
  แนะนำให้หยุดเว็บตัวอื่นไว้ก่อนสักครู่ (`docker compose stop`) จะได้ไม่ไปกวนคนที่กำลังซื้อของ:
  ```bash
  docker build -t ghcr.io/landbark/lb.pos:latest \
    --build-arg NEXT_PUBLIC_SUPABASE_URL=... --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
    --build-arg NEXT_PUBLIC_SITE_URL=... --build-arg NEXT_PUBLIC_LIFF_ID=... \
    --build-arg NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=... --build-arg SUPABASE_SERVICE_ROLE_KEY=... .
  ```
