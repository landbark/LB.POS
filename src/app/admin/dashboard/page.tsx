import { createClient } from '@/lib/supabase/server'
import { Package, ShoppingBag, AlertTriangle, TrendingUp } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [
    { count: productCount },
    { data: todayTx },
    { data: lowStockLots },
    { data: expiringSoon },
  ] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }).eq('active', true),
    supabase.from('transactions').select('total').gte('created_at', today),
    supabase.from('product_lots')
      .select('quantity, products(name)')
      .eq('products.active', true)
      .lt('quantity', 5)
      .gt('quantity', 0),
    supabase.from('product_lots')
      .select('expiry_date, quantity, products(name, unit)')
      .gte('expiry_date', today)
      .lte('expiry_date', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .gt('quantity', 0),
  ])

  const todaySales = todayTx?.reduce((sum, t) => sum + t.total, 0) ?? 0
  const todayCount = todayTx?.length ?? 0

  const stats = [
    {
      label: 'ยอดขายวันนี้',
      value: `฿${todaySales.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`,
      sub: `${todayCount} รายการ`,
      icon: TrendingUp,
      color: 'text-green-600 bg-green-50',
    },
    {
      label: 'สินค้าทั้งหมด',
      value: productCount?.toString() ?? '0',
      sub: 'SKU',
      icon: Package,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      label: 'สต็อคใกล้หมด',
      value: lowStockLots?.length?.toString() ?? '0',
      sub: 'รายการ',
      icon: AlertTriangle,
      color: 'text-orange-600 bg-orange-50',
    },
    {
      label: 'ใกล้หมดอายุ (30 วัน)',
      value: expiringSoon?.length?.toString() ?? '0',
      sub: 'lot',
      icon: ShoppingBag,
      color: 'text-red-600 bg-red-50',
    },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">ภาพรวม</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className={`inline-flex p-2 rounded-lg ${stat.color} mb-3`}>
              <stat.icon size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{stat.sub}</p>
            <p className="text-sm text-gray-600 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {expiringSoon && expiringSoon.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-500" />
            สินค้าใกล้หมดอายุ (ภายใน 30 วัน)
          </h2>
          <div className="space-y-2">
            {expiringSoon.map((lot, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-700">
                  {(lot.products as any)?.name}
                  <span className="text-gray-400"> · เหลือ {lot.quantity} {(lot.products as any)?.unit}</span>
                </span>
                <span className="text-red-600 font-medium">
                  หมดอายุ {new Date(lot.expiry_date!).toLocaleDateString('th-TH')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
