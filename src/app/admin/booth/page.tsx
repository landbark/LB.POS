import Link from '@/components/ProgressLink'
import { Store, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import type { BoothTrip } from '@/lib/types'
import NewTripButton from './NewTripButton'

export default async function BoothPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: trips }, { data: sales }] = await Promise.all([
    supabase
      .from('booth_trips')
      .select('*, opener:profiles!booth_trips_opened_by_fkey(name)')
      .order('trip_date', { ascending: false })
      .order('opened_at', { ascending: false })
      .limit(60),
    // ยอดขายของทุกรอบในครั้งเดียว — ขายเดือนละรอบ ทั้งตารางยังเล็กกว่าพันแถวอีกนาน
    supabase
      .from('transactions')
      .select('booth_trip_id, total')
      .eq('status', 'completed')
      .not('booth_trip_id', 'is', null),
  ])

  const salesByTrip = new Map<string, { count: number; total: number }>()
  for (const tx of sales ?? []) {
    const at = salesByTrip.get(tx.booth_trip_id!) ?? { count: 0, total: 0 }
    at.count += 1
    at.total += Number(tx.total)
    salesByTrip.set(tx.booth_trip_id!, at)
  }

  const rows = (trips ?? []) as BoothTrip[]
  const open = rows.find((t) => t.status === 'open')
  const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Store size={22} className="text-[#C4865A]" />
            งานออกบูธ
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            เปิดรอบ → ทำใบเบิกของที่ยกไป → ขายที่หน้างานด้วยโหมดบูธ → กลับมาทำใบคืนแล้วปิดรอบ
          </p>
        </div>
        {!open && <NewTripButton userId={user?.id ?? ''} />}
      </div>

      {open && (
        <Link
          href={`/admin/booth/${open.id}`}
          className="block mb-6 rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 hover:bg-amber-100/70 transition-colors"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">รอบที่เปิดอยู่</p>
          <p className="mt-1 text-lg font-bold text-gray-900">
            {open.name || 'งานออกบูธ'} · {new Date(open.trip_date).toLocaleDateString('th-TH', { dateStyle: 'long' })}
          </p>
          <p className="mt-1 text-sm text-amber-800">
            {open.location || 'ไม่ได้ระบุสถานที่'} · เลขที่ {open.trip_number}
            {' · '}ขายไปแล้ว ฿{money(salesByTrip.get(open.id)?.total ?? 0)} ({salesByTrip.get(open.id)?.count ?? 0} บิล)
          </p>
          <p className="mt-2 text-sm font-medium text-amber-900">เปิดใบเบิก / ปิดรอบ →</p>
        </Link>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">วันที่</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">งาน</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">เลขที่</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">ยอดขาย</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">บิล</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-3">สถานะ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((t) => {
              const s = salesByTrip.get(t.id)
              return (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                    <Link href={`/admin/booth/${t.id}`} className="hover:underline">
                      {new Date(t.trip_date).toLocaleDateString('th-TH', { dateStyle: 'medium' })}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    <Link href={`/admin/booth/${t.id}`} className="font-medium hover:underline">
                      {t.name || 'งานออกบูธ'}
                    </Link>
                    {t.location && <span className="block text-xs text-gray-400">{t.location}</span>}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-500">{t.trip_number}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                    ฿{money(s?.total ?? 0)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-500">{s?.count ?? 0}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      t.status === 'open' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {t.status === 'open' ? 'กำลังขาย' : 'ปิดรอบแล้ว'}
                    </span>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                  <Plus size={20} className="mx-auto mb-2 text-gray-300" />
                  ยังไม่เคยเปิดรอบออกบูธ — กด &quot;เปิดรอบใหม่&quot; ตอนจะยกของไปขาย
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
