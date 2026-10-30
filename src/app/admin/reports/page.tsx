import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { thaiDayRange, thaiMonthStart } from '@/lib/thaiDate'
import { sumByMethod, type PaidTransaction } from '@/lib/payments'
import { isOwnMoney, OWN_MONEY_CHANNELS, CHANNEL_GROUP_COLOR, CHANNEL_LABEL, totalsByChannelGroup } from '@/lib/salesChannel'
import { toOne } from '@/lib/supabase/embed'

export default async function ReportsPage() {
  const supabase = await createClient()
  const { startISO: today, endISO: tomorrow } = thaiDayRange()
  const startOfMonth = thaiDayRange(thaiMonthStart()).startISO

  // ยอดทั้งเดือนอาจเกิน 1000 แถว — ต้องไล่ดึงทีละหน้า ไม่งั้นตัวเลขจะขาดแบบไม่มี error
  const [todayTx, monthTx, { data: recentTx }, monthItems, { data: store }] = await Promise.all([
    fetchAll((from, to) =>
      supabase.from('transactions').select('total, sales_channel, payment_method, transaction_payments(method, amount)')
        .neq('status', 'cancelled')
        .gte('created_at', today).lt('created_at', tomorrow).order('id').range(from, to)
    ),
    fetchAll((from, to) =>
      supabase.from('transactions').select('total, sales_channel')
        .neq('status', 'cancelled')
        .gte('created_at', startOfMonth).order('id').range(from, to)
    ),
    supabase
      .from('transactions')
      .select('*, profiles!transactions_cashier_id_fkey(name), customers(name)')
      .order('created_at', { ascending: false })
      .limit(20),
    // แยกยอด VAT + รายได้บริการคลินิก ต้องดูรายสินค้า ไม่ใช่ระดับบิล — ตัดบิลที่ถูกยกเลิกออก
    fetchAll((from, to) =>
      supabase
        .from('transaction_items')
        .select('subtotal, vat_applicable, products(is_service), transactions!inner(created_at, status, sales_channel)')
        .gte('transactions.created_at', startOfMonth)
        .neq('transactions.status', 'cancelled')
        .in('transactions.sales_channel', OWN_MONEY_CHANNELS)
        .order('id')
        .range(from, to)
    ),
    supabase.from('store_settings').select('vat_registered, vat_rate').limit(1).single(),
  ])

  const vatBase = monthItems?.reduce((s, i) => s + (i.vat_applicable ? i.subtotal : 0), 0) ?? 0
  const nonVatBase = monthItems?.reduce((s, i) => s + (i.vat_applicable ? 0 : i.subtotal), 0) ?? 0

  // รายได้ค่าบริการคลินิก (สินค้าที่ตั้งเป็นบริการ เช่น ค่าตรวจ/ค่าหัตถการ/ค่าผ่าตัด) แยกจากยอดขายสินค้า
  const serviceRevenue = monthItems?.reduce((s, i) => s + ((i.products as { is_service?: boolean } | null)?.is_service ? i.subtotal : 0), 0) ?? 0
  const productRevenue = monthItems?.reduce((s, i) => s + ((i.products as { is_service?: boolean } | null)?.is_service ? 0 : i.subtotal), 0) ?? 0
  const vatRate = store?.vat_rate ?? 7
  const vatAmount = vatBase * (vatRate / 100)

  // ขายผ่านแพลตฟอร์มเงินเข้าทางแพลตฟอร์ม ไม่ใช่เงินที่ร้านรับเอง — ไม่นับทั้งยอดและวิธีชำระ
  const ownTodayTx = (todayTx ?? []).filter((t) => isOwnMoney(t.sales_channel))
  const paymentBreakdown = sumByMethod(ownTodayTx as PaidTransaction[])

  const todayTotal = ownTodayTx.reduce((s, t) => s + t.total, 0)

  // แยกยอด หน้าร้าน / ออกบูธ / ออนไลน์ ทั้งของวันนี้และของเดือนนี้ ไว้เทียบกันในตารางเดียว
  const todayGroups = totalsByChannelGroup(todayTx ?? [])
  const monthGroups = totalsByChannelGroup(monthTx ?? [])
  const monthTotal = monthGroups.reduce((s, g) => s + g.ownAmount, 0)
  const monthOwnCount = monthGroups.reduce((s, g) => s + g.ownCount, 0)

  const PAYMENT_TH: Record<string, string> = {
    cash: 'เงินสด',
    transfer: 'โอน',
    card: 'บัตร',
    qr: 'QR',
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">รายงาน</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">ยอดขายวันนี้ <span className="text-xs text-gray-400">· ไม่รวมแพลตฟอร์ม</span></p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            ฿{todayTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{ownTodayTx.length} รายการ</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">ยอดขายเดือนนี้ <span className="text-xs text-gray-400">· ไม่รวมแพลตฟอร์ม</span></p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            ฿{monthTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{monthOwnCount} รายการ</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500 mb-2">
            วิธีชำระวันนี้ <span className="text-xs text-gray-400">· ไม่รวมแพลตฟอร์ม</span>
          </p>
          <div className="space-y-1">
            {Object.entries(paymentBreakdown).map(([method, amount]) => (
              <div key={method} className="flex justify-between text-sm">
                <span className="text-gray-600">{PAYMENT_TH[method] ?? method}</span>
                <span className="font-medium text-gray-900">฿{amount.toFixed(2)}</span>
              </div>
            ))}
            {Object.keys(paymentBreakdown).length === 0 && (
              <p className="text-sm text-gray-400">ยังไม่มีรายการ</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
        <h2 className="font-semibold text-gray-900 mb-3">ยอดขายแยกช่องทาง</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-100">
                <th className="text-left font-medium pb-2">ช่องทาง</th>
                <th className="text-right font-medium pb-2">วันนี้</th>
                <th className="text-right font-medium pb-2">เดือนนี้</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {monthGroups.map((g, i) => {
                const todayGroup = todayGroups[i]
                return (
                  <tr key={g.group}>
                    <td className="py-2">
                      <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${CHANNEL_GROUP_COLOR[g.group].bg}`}>
                        {g.label}
                      </span>
                      {/* กลุ่มออนไลน์มีหลายช่องทาง กางชื่อไว้ข้างๆ ให้รู้ว่าเดือนนี้ขายทางไหนบ้าง */}
                      {g.byChannel.length > 1 && (
                        <span className="text-xs text-gray-400 ml-2">
                          {g.byChannel.map((c) => CHANNEL_LABEL[c.channel]).join(' · ')}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums text-gray-700">
                      ฿{todayGroup.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      <span className="text-xs text-gray-400"> · {todayGroup.count} บิล</span>
                    </td>
                    <td className="py-2 text-right tabular-nums font-semibold text-gray-900">
                      ฿{g.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      <span className="text-xs text-gray-400 font-normal"> · {g.count} บิล</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          ยอดตามราคาที่ลงบิล รวมทุกช่องทาง · ตัดบิลที่ยกเลิกออก · ยอดขายผ่าน Shopee/TikTok/Lazada
          ไม่ถูกนับในการ์ด &quot;ยอดขายวันนี้/เดือนนี้&quot; ข้างบน เพราะเงินเข้าผ่านแพลตฟอร์ม
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
        <h2 className="font-semibold text-gray-900 mb-3">รายได้เดือนนี้ แยกสินค้า / บริการคลินิก</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">ขายสินค้า</p>
            <p className="text-xl font-bold text-gray-900 mt-0.5">฿{productRevenue.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">ค่าบริการคลินิก (ค่าตรวจ/หัตถการ/ผ่าตัด)</p>
            <p className="text-xl font-bold text-teal-600 mt-0.5">฿{serviceRevenue.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">แยกตามสินค้าที่ตั้งค่า &quot;เป็นค่าบริการ&quot; · ยอดตามราคาก่อนหักส่วนลดท้ายบิล · ไม่รวมขายผ่านแพลตฟอร์ม</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
        <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
          <h2 className="font-semibold text-gray-900">ยอดขายเดือนนี้ แยกตาม VAT</h2>
          <Link href="/admin/reports/vat" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            ดูรายปีเทียบเกณฑ์ 1.8 ล้าน →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-500">กลุ่มมี VAT</p>
            <p className="text-xl font-bold text-gray-900 mt-0.5">฿{vatBase.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">กลุ่มไม่มี VAT</p>
            <p className="text-xl font-bold text-gray-900 mt-0.5">฿{nonVatBase.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">VAT {vatRate}% ของกลุ่มมี VAT</p>
            <p className="text-xl font-bold text-gray-900 mt-0.5">฿{vatAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">ยอดตามราคาสินค้า ก่อนหักส่วนลดท้ายบิล · ไม่รวมขายผ่านแพลตฟอร์ม (Shopee/TikTok/Lazada) ที่มีสรุปการเงินของตัวเอง</p>
        {!store?.vat_registered && (
          <p className="text-xs text-amber-600 mt-1">
            ร้านยังไม่ได้จดทะเบียน VAT — ตัวเลขนี้เป็นการประมาณไว้ดูเฉยๆ ยังไม่ได้เก็บเงินลูกค้าจริง
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">รายการขายล่าสุด</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">เลขที่</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">เวลา</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">แคชเชียร์</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">ลูกค้า</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">วิธีชำระ</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">ยอด</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {recentTx?.map((tx) => (
              <tr key={tx.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-mono text-gray-600">{tx.transaction_number}</td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {new Date(tx.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{toOne<{ name: string }>(tx.profiles)?.name ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{toOne<{ name: string }>(tx.customers)?.name ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{PAYMENT_TH[tx.payment_method] ?? tx.payment_method}</td>
                <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                  ฿{tx.total.toFixed(2)}
                </td>
              </tr>
            ))}
            {(!recentTx || recentTx.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                  ยังไม่มีรายการขาย
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
