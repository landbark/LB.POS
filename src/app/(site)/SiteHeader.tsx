'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ShoppingBag, UserRound } from 'lucide-react'
import { useCart } from '@/lib/use-cart'

interface Props {
  storeName: string
  logoUrl: string | null
  shopEnabled: boolean
  customerName: string | null
}

export default function SiteHeader({ storeName, logoUrl, shopEnabled, customerName }: Props) {
  const pathname = usePathname()
  const { count } = useCart()

  const links = [
    { href: '/', label: 'หน้าแรก' },
    ...(shopEnabled ? [{ href: '/shop', label: 'สั่งซื้อสินค้า' }] : []),
    { href: '/orders', label: 'ออเดอร์ของฉัน' },
  ]

  // เมนูชุดเดียวกัน ใช้ทั้งแถวเดียวบนจอใหญ่ และแถวล่างบนมือถือ
  const navLinks = links.map((link) => {
    const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href)
    return (
      <Link
        key={link.href}
        href={link.href}
        className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
          active ? 'bg-brand-bg-light text-white' : 'text-brand-muted hover:text-brand-cream'
        }`}
      >
        {link.label}
      </Link>
    )
  })

  return (
    <header className="sticky top-0 z-30 bg-brand-bg text-brand-cream shadow-sm">
      <div className="max-w-5xl mx-auto px-4">
        <div className="h-14 sm:h-16 flex items-center gap-2 sm:gap-4">
          {/* min-w-0 + truncate: ชื่อร้านยาวแค่ไหนก็ห้ามดันเมนู/ปุ่มตกขอบจอ */}
          <Link href="/" className="flex items-center gap-2 min-w-0 flex-1 sm:flex-none">
            {logoUrl ? (
              // โลโก้ร้านอัปโหลดเอง — ขนาดไม่แน่นอน ใช้ img ธรรมดา
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={storeName} className="h-9 w-9 shrink-0 rounded-full object-cover bg-brand-light" />
            ) : null}
            <span className="font-bold text-base sm:text-lg tracking-wide truncate">{storeName}</span>
          </Link>

          <nav className="hidden sm:flex flex-1 items-center gap-1 overflow-x-auto">{navLinks}</nav>

          {shopEnabled && (
            <Link href="/cart" className="relative shrink-0 p-2 rounded-lg hover:bg-brand-bg-light" aria-label="ตะกร้า">
              <ShoppingBag size={20} />
              {count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-brand-brown text-white text-[11px] font-bold flex items-center justify-center">
                  {count}
                </span>
              )}
            </Link>
          )}

          <Link
            href="/account"
            aria-label={customerName ?? 'เข้าสู่ระบบ'}
            className="flex shrink-0 items-center gap-1.5 px-2.5 sm:px-3 py-2 sm:py-1.5 rounded-lg bg-brand-brown text-white text-sm font-medium hover:opacity-90"
          >
            <UserRound size={16} />
            <span className="hidden sm:inline max-w-32 truncate">{customerName ?? 'เข้าสู่ระบบ'}</span>
          </Link>
        </div>

        {/* มือถือ: เมนูย้ายลงแถวล่าง เลื่อนแนวนอนได้ */}
        <nav className="sm:hidden flex items-center gap-1 pb-2 -mx-1 px-1 overflow-x-auto">{navLinks}</nav>
      </div>
    </header>
  )
}
