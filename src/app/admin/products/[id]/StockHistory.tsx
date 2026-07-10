import { History } from 'lucide-react'
import type { StockMovement, StockMovementType } from '@/lib/types'

const TYPE_LABEL: Record<StockMovementType, { text: string; className: string; sign: '+' | '-' }> = {
  sale: { text: 'ขาย', className: 'bg-gray-100 text-gray-600', sign: '-' },
  receive: { text: 'รับเข้า', className: 'bg-green-100 text-green-700', sign: '+' },
  adjust_in: { text: 'ปรับเพิ่ม', className: 'bg-blue-100 text-blue-700', sign: '+' },
  adjust_out: { text: 'ปรับลด', className: 'bg-orange-100 text-orange-700', sign: '-' },
  cancel: { text: 'คืนจากยกเลิก', className: 'bg-purple-100 text-purple-700', sign: '+' },
}

type Movement = Omit<StockMovement, 'profiles'> & {
  profiles: { name: string } | null
}

export default function StockHistory({ movements, unit }: { movements: Movement[]; unit: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
        <History size={18} className="text-gray-400" />
        <h2 className="font-semibold text-gray-900">ประวัติสต็อค</h2>
      </div>
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-100">
          <tr>
            <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">วันที่/เวลา</th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">ประเภท</th>
            <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">จำนวน</th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">โดย</th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">หมายเหตุ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {movements.map((m) => {
            const cfg = TYPE_LABEL[m.type]
            return (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                  {new Date(m.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${cfg.className}`}>
                    {cfg.text}
                  </span>
                </td>
                <td className={`px-4 py-3 text-sm text-right font-semibold ${cfg.sign === '+' ? 'text-green-600' : 'text-red-500'}`}>
                  {cfg.sign}{m.quantity} {unit}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{m.profiles?.name ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{m.reason ?? '—'}</td>
              </tr>
            )
          })}
          {movements.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">
                ยังไม่มีประวัติการเปลี่ยนแปลงสต็อค
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
