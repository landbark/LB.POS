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

  return (
    <header className="sticky top-0 z-30 bg-brand-bg text-brand-cream shadow-sm">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          {logoUrl ? (
            // โลโก้ร้านอัปโหลดเอง — ขนาดไม่แน่นอน ใช้ img ธรรมดา
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={storeName} className="h-9 w-9 rounded-full object-cover bg-brand-light" />
          ) : null}
          <span className="font-bold text-lg tracking-wide">{storeName}</span>
        </Link>

        <nav className="flex-1 flex items-center gap-1 overflow-x-auto">
          {links.map((link) => {
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
          })}
        </nav>

        {shopEnabled && (
          <Link href="/cart" className="relative p-2 rounded-lg hover:bg-brand-bg-light" aria-label="ตะกร้า">
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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-brown text-white text-sm font-medium hover:opacity-90 whitespace-nowrap"
        >
          <UserRound size={16} />
          <span className="hidden sm:inline">{customerName ?? 'เข้าสู่ระบบ'}</span>
        </Link>
      </div>
    </header>
  )
}
