import Link from '@/components/ProgressLink'
import { createClient } from '@/lib/supabase/server'
import { ClipboardList, ChevronRight } from 'lucide-react'
import type { StockCountStatus } from '@/lib/types'
import { summarize } from '@/lib/stockCount'
import NewCountButton from './NewCountButton'

const STATUS: Record<StockCountStatus, { text: string; className: string }> = {
  counting: { text: 'กำลังนับ', className: 'bg-amber-100 text-amber-700' },
  posted: { text: 'ปรับสต็อกแล้ว', className: 'bg-green-100 text-green-700' },
  cancelled: { text: 'ยกเลิก', className: 'bg-gray-100 text-gray-500' },
}

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short' })

export default async function StockCountPage() {
  const supabase = await createClient()

  const [{ data: counts }, { data: categories }] = await Promise.all([
    supabase
      .from('stock_counts')
      .select('*, categories(name), creator:profiles!stock_counts_created_by_fkey(name), stock_count_items(counted_quantity, system_quantity, products(cost))')
      .order('created_at', { ascending: false })
      .limit(30),
    supabase.from('categories').select('id, name').order('name'),
  ])

  type Row = {
    id: string
    count_number: string
    name: string | null
    status: StockCountStatus
    created_at: string
    categories: { name: string } | null
    creator: { name: string | null } | null
    stock_count_items: { counted_quantity: number; system_quantity: number; products: { cost: number | null } | null }[]
  }

  const rows = (counts ?? []) as unknown as Row[]

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-gray-900">นับสต็อก</h1>
        <NewCountButton categories={categories ?? []} />
      </div>
      <p className="text-sm text-gray-500 mb-6">
        เปิดรอบนับแล้วยิงบาร์โค้ดนับของบนชั้น — ค้างไว้ข้ามวันได้ ช่วยกันนับหลายคนได้
        ระบบจะปรับสต็อกให้ครั้งเดียวตอนกดยืนยัน
      </p>

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center">
          <ClipboardList size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">ยังไม่เคยนับสต็อก — กด &ldquo;เปิดรอบนับ&rdquo; เพื่อเริ่ม</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-50">
          {rows.map((c) => {
            const items = (c.stock_count_items ?? []).map((i) => ({
              counted_quantity: i.counted_quantity,
              system_quantity: i.system_quantity,
              cost: i.products?.cost ?? null,
            }))
            const sum = summarize(items)
            const status = STATUS[c.status] ?? STATUS.counting
            return (
              <Link
                key={c.id}
                href={`/admin/stock-count/${c.id}`}
                className="flex items-center gap-3 px-5 py-4 hover:bg-gray-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900">{c.name || c.count_number}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.className}`}>
                      {status.text}
                    </span>
                    <span className="text-xs text-gray-400">
                      {c.categories?.name ? `เฉพาะหมวด ${c.categories.name}` : 'ทั้งร้าน'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {fmtDateTime(c.created_at)}
                    {c.creator?.name ? ` · ${c.creator.name}` : ''} · นับแล้ว {sum.items} รายการ
                    {sum.items > 0 && (
                      <>
                        {' '}· <span className="text-red-500">ขาด {sum.short}</span>
                        {' '}· <span className="text-green-600">เกิน {sum.over}</span>
                      </>
                    )}
                  </div>
                </div>
                <ChevronRight size={18} className="text-gray-300 shrink-0" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
