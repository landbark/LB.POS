import { createClient } from '@/lib/supabase/server'

export default async function ReportsPage() {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]

  const [{ data: todayTx }, { data: monthTx }, { data: recentTx }, { data: monthItems }, { data: store }] = await Promise.all([
    supabase.from('transactions').select('total, payment_method').gte('created_at', today),
    supabase.from('transactions').select('total').gte('created_at', startOfMonth),
    supabase
      .from('transactions')
      .select('*, profiles(name), customers(name)')
      .order('created_at', { ascending: false })
      .limit(20),
    // แยกยอด VAT ต้องดูรายสินค้า ไม่ใช่ระดับบิล — ตัดบิลที่ถูกยกเลิกออก
    supabase
      .from('transaction_items')
      .select('subtotal, vat_applicable, transactions!inner(created_at, status)')
      .gte('transactions.created_at', startOfMonth)
      .neq('transactions.status', 'cancelled'),
    supabase.from('store_settings').select('vat_registered, vat_rate').limit(1).single(),
  ])

  const vatBase = monthItems?.reduce((s, i) => s + (i.vat_applicable ? i.subtotal : 0), 0) ?? 0
  const nonVatBase = monthItems?.reduce((s, i) => s + (i.vat_applicable ? 0 : i.subtotal), 0) ?? 0
  const vatRate = store?.vat_rate ?? 7
  const vatAmount = vatBase * (vatRate / 100)

  const todayTotal = todayTx?.reduce((s, t) => s + t.total, 0) ?? 0
  const monthTotal = monthTx?.reduce((s, t) => s + t.total, 0) ?? 0

  const paymentBreakdown = todayTx?.reduce<Record<string, number>>((acc, t) => {
    acc[t.payment_method] = (acc[t.payment_method] ?? 0) + t.total
    return acc
  }, {}) ?? {}

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
          <p className="text-sm text-gray-500">ยอดขายวันนี้</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            ฿{todayTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{todayTx?.length ?? 0} รายการ</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">ยอดขายเดือนนี้</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            ฿{monthTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{monthTx?.length ?? 0} รายการ</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500 mb-2">วิธีชำระวันนี้</p>
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
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-semibold text-gray-900">ยอดขายเดือนนี้ แยกตาม VAT</h2>
          <span className="text-xs text-gray-400">ยอดตามราคาสินค้า ก่อนหักส่วนลดท้ายบิล</span>
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
        {!store?.vat_registered && (
          <p className="text-xs text-amber-600 mt-3">
            ร้านยังไม่ได้จดทะเบียน VAT — ตัวเลขนี้เป็นการประมาณไว้ดูเฉยๆ ยังไม่ได้เก็บเงินลูกค้าจริง
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
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
                <td className="px-4 py-3 text-sm text-gray-700">{(tx.profiles as any)?.name ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{(tx.customers as any)?.name ?? '—'}</td>
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
