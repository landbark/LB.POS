import Link from 'next/link'
import { ArrowRight, CalendarDays, Pin, ShoppingBag } from 'lucide-react'
import { FacebookIcon, InstagramIcon, LineIcon } from '@/components/SocialIcons'
import { createClient } from '@/lib/supabase/server'
import { homePath } from '@/lib/home-path'
import { getAnnouncements, getStorefront } from '@/lib/shop-data'

export const dynamic = 'force-dynamic'

const dateTh = (iso: string) =>
  new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })

export default async function HomePage() {
  const [store, announcements] = await Promise.all([getStorefront(), getAnnouncements(12)])

  // พนักงานที่ล็อกอินอยู่ — ขึ้นทางลัดกลับเข้าระบบร้านให้
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let staffHome: string | null = null
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role, active').eq('id', user.id).single()
    if (profile?.active !== false) staffHome = homePath(profile?.role)
  }

  const channels = [
    { href: store?.line_url, label: 'LINE', hint: 'ทักแชทสอบถาม/สั่งของ', icon: LineIcon },
    { href: store?.facebook_url, label: 'Facebook', hint: 'ข่าวสารและรีวิว', icon: FacebookIcon },
    { href: store?.instagram_url, label: 'Instagram', hint: 'ภาพน้องๆ ที่ร้าน', icon: InstagramIcon },
  ].filter((c): c is { href: string; label: string; hint: string; icon: typeof LineIcon } => Boolean(c.href))

  return (
    <div className="space-y-10">
      {staffHome && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-white border border-brand-muted/40 px-4 py-3 text-sm">
          <span className="text-brand-dark">คุณกำลังล็อกอินเป็นพนักงานอยู่</span>
          <Link href={staffHome} className="font-medium text-brand-brown hover:underline whitespace-nowrap">
            เข้าระบบร้าน →
          </Link>
        </div>
      )}

      <section className="rounded-2xl bg-brand-bg text-brand-cream px-6 py-10 sm:px-10 sm:py-14">
        <h1 className="text-3xl sm:text-4xl font-bold">{store?.name ?? 'LANDBARK'}</h1>
        <p className="mt-3 max-w-2xl text-brand-muted whitespace-pre-line">
          {store?.shop_intro ?? 'ร้านเพทชอปและคลินิกรักษาสัตว์ — อาหาร ของใช้ วัคซีน และบริการดูแลน้องๆ'}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {store?.shop_enabled && (
            <Link
              href="/shop"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-brown text-white font-medium hover:opacity-90"
            >
              <ShoppingBag size={18} /> สั่งซื้อสินค้าออนไลน์
            </Link>
          )}
          {store?.line_url && (
            <a
              href={store.line_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-bg-light font-medium hover:bg-brand-bg-light/70"
            >
              <LineIcon size={18} /> ทักไลน์ร้าน
            </a>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-brand-dark mb-4">ข่าวสาร / ประกาศจากร้าน</h2>

        {announcements.length === 0 ? (
          <p className="rounded-xl bg-white border border-brand-muted/30 p-6 text-sm text-gray-500">
            ยังไม่มีประกาศ
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {announcements.map((item) => (
              <Link
                key={item.id}
                href={`/news/${item.id}`}
                className="group rounded-xl bg-white border border-brand-muted/30 overflow-hidden hover:shadow-md transition-shadow"
              >
                {item.image_url && (
                  // รูปประกาศอัปโหลดเอง สัดส่วนไม่แน่นอน
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image_url} alt="" className="w-full h-44 object-cover" />
                )}
                <div className="p-4">
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    {item.pinned && (
                      <span className="inline-flex items-center gap-1 text-brand-brown font-medium">
                        <Pin size={12} /> ปักหมุด
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays size={12} /> {dateTh(item.published_at)}
                    </span>
                  </div>
                  <h3 className="mt-1.5 font-semibold text-brand-dark group-hover:text-brand-brown">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-sm text-gray-600 line-clamp-3 whitespace-pre-line">{item.body}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm text-brand-brown font-medium">
                    อ่านต่อ <ArrowRight size={14} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {channels.length > 0 && (
        <section>
          <h2 className="text-xl font-bold text-brand-dark mb-4">ติดต่อร้าน</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {channels.map(({ href, label, hint, icon: Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl bg-white border border-brand-muted/30 p-4 hover:border-brand-brown transition-colors"
              >
                <span className="w-10 h-10 rounded-full bg-brand-light flex items-center justify-center text-brand-brown">
                  <Icon size={20} />
                </span>
                <span>
                  <span className="block font-medium text-brand-dark">{label}</span>
                  <span className="block text-xs text-gray-500">{hint}</span>
                </span>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
