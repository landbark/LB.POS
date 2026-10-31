import type { Metadata } from 'next'
import { MapPin, Phone } from 'lucide-react'
import { FacebookIcon, InstagramIcon, LineIcon } from '@/components/SocialIcons'
import { getSessionCustomer } from '@/lib/customer-session'
import { getStorefront } from '@/lib/shop-data'
import SiteHeader from './SiteHeader'

// หน้าร้านของลูกค้าใช้ชื่อร้าน ไม่ใช่ชื่อระบบหลังบ้านที่ตั้งไว้ใน layout ชั้นนอก
// (ชื่อนั้นจะไปโผล่ทั้งบนแท็บเบราว์เซอร์และในผลค้นหา)
export async function generateMetadata(): Promise<Metadata> {
  const store = await getStorefront()
  const name = store?.name ?? 'LANDBARK'
  return {
    title: { default: name, template: `%s · ${name}` },
    description: store?.shop_intro ?? 'ร้านเพทชอปและคลินิกรักษาสัตว์',
    openGraph: {
      title: name,
      description: store?.shop_intro ?? 'ร้านเพทชอปและคลินิกรักษาสัตว์',
      type: 'website',
    },
  }
}

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [store, customer] = await Promise.all([getStorefront(), getSessionCustomer()])
  const storeName = store?.name ?? 'LANDBARK'

  const channels = [
    { href: store?.line_url, label: 'LINE', icon: LineIcon },
    { href: store?.facebook_url, label: 'Facebook', icon: FacebookIcon },
    { href: store?.instagram_url, label: 'Instagram', icon: InstagramIcon },
  ].filter((c): c is { href: string; label: string; icon: typeof LineIcon } => Boolean(c.href))

  return (
    <div className="min-h-screen flex flex-col bg-brand-light">
      <SiteHeader
        storeName={storeName}
        logoUrl={store?.logo_url ?? null}
        shopEnabled={store?.shop_enabled ?? false}
        customerName={customer?.name ?? null}
      />

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6">{children}</main>

      <footer className="bg-brand-bg text-brand-cream mt-10">
        <div className="max-w-5xl mx-auto px-4 py-8 grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="font-bold text-lg">{storeName}</h2>
            {store?.address && (
              <p className="mt-2 text-sm text-brand-muted flex items-start gap-2">
                <MapPin size={16} className="mt-0.5 shrink-0" />
                <span>{store.address}</span>
              </p>
            )}
            {store?.phone && (
              <a href={`tel:${store.phone}`} className="mt-2 text-sm text-brand-muted flex items-center gap-2 hover:text-brand-cream">
                <Phone size={16} />
                {store.phone}
              </a>
            )}
          </div>

          <div>
            <h3 className="font-semibold text-sm">ช่องทางติดต่อ</h3>
            {channels.length === 0 ? (
              <p className="mt-2 text-sm text-brand-muted">ยังไม่ได้ตั้งค่าช่องทางติดต่อ</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {channels.map(({ href, label, icon: Icon }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-bg-light text-sm hover:bg-brand-brown transition-colors"
                  >
                    <Icon size={16} />
                    {label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-brand-bg-light">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between text-xs text-brand-muted">
            <span>© {new Date().getFullYear()} {storeName}</span>
            {/* ข้ามโดเมนไป pos.* (proxy.ts เป็นคนเด้ง) — ใช้ <a> ให้เบราว์เซอร์เดินเอง ไม่ใช่ router */}
            <a href="/login" className="hover:text-brand-cream">สำหรับพนักงาน</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
