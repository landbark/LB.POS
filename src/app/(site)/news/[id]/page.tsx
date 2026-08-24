import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CalendarDays } from 'lucide-react'
import { getAnnouncement } from '@/lib/shop-data'

export const dynamic = 'force-dynamic'

const dateTh = (iso: string) =>
  new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })

export default async function NewsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = await getAnnouncement(id)
  if (!item) notFound()

  return (
    <article className="max-w-2xl mx-auto">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-brand-brown hover:underline">
        <ArrowLeft size={14} /> กลับหน้าแรก
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-brand-dark">{item.title}</h1>
      <p className="mt-1.5 text-xs text-gray-400 flex items-center gap-1">
        <CalendarDays size={12} /> {dateTh(item.published_at)}
      </p>

      {item.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image_url} alt="" className="mt-4 w-full rounded-xl object-cover" />
      )}

      <div className="mt-5 text-[15px] leading-7 text-gray-700 whitespace-pre-line">{item.body}</div>
    </article>
  )
}
