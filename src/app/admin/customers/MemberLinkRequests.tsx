'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Link2, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { confirmDialog } from '@/lib/confirm'

export interface LinkRequest {
  id: string
  phone: string
  created_at: string
  customers: { name: string; phone: string; points: number } | null
}

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })

/**
 * คิวคำขอผูกบัญชี LINE ของลูกค้า
 *
 * เบอร์โทรอย่างเดียวพิสูจน์ตัวตนไม่ได้ ทางร้านจึงต้องยืนยันก่อน —
 * ควรถามลูกค้าที่อยู่ตรงหน้า หรือโทรกลับตามเบอร์ในระบบก่อนกดยืนยัน
 */
export default function MemberLinkRequests({ requests }: { requests: LinkRequest[] }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)

  if (requests.length === 0) return null

  async function decide(req: LinkRequest, action: 'approve' | 'reject') {
    if (action === 'approve') {
      const confirmed = await confirmDialog({
        message: `ยืนยันผูกบัญชี LINE เข้ากับ "${req.customers?.name ?? 'ลูกค้า'}" (${req.phone})?\n\n`
          + 'ยืนยันเฉพาะเมื่อแน่ใจว่าเป็นเจ้าของเบอร์นี้จริง — ผู้ที่ผูกแล้วจะเห็นแต้มและประวัติการซื้อทั้งหมด',
      })
      if (!confirmed.confirmed) return
    }

    setBusyId(req.id)
    try {
      const res = await fetch('/api/member/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: req.id, action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'ดำเนินการไม่สำเร็จ')
      toast.success(action === 'approve' ? 'ผูกบัญชีแล้ว' : 'ปฏิเสธคำขอแล้ว')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ดำเนินการไม่สำเร็จ')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Link2 size={18} className="text-amber-500" />
        <h2 className="font-semibold text-amber-900">คำขอผูกบัญชี LINE ({requests.length})</h2>
      </div>
      <p className="text-xs text-amber-700 mb-4">
        ลูกค้ากรอกเบอร์ในหน้าสมาชิกเพื่อขอผูก LINE — ยืนยันเฉพาะคนที่แน่ใจว่าเป็นเจ้าของเบอร์จริง
        เพราะเมื่อผูกแล้วจะเห็นแต้มและประวัติการซื้อทั้งหมด
      </p>

      <ul className="divide-y divide-amber-100">
        {requests.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <div className="min-w-0">
              <span className="text-sm font-medium text-gray-900">{r.customers?.name ?? 'ไม่ทราบชื่อ'}</span>
              <span className="ml-2 text-sm font-mono text-gray-500">{r.phone}</span>
              {typeof r.customers?.points === 'number' && (
                <span className="ml-2 text-xs text-gray-400">{r.customers.points} แต้ม</span>
              )}
              <span className="flex items-center gap-1 text-xs text-amber-600 mt-0.5">
                <Clock size={12} /> ขอเมื่อ {fmtWhen(r.created_at)}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => decide(r, 'approve')}
                disabled={busyId === r.id}
                className="flex items-center gap-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg"
              >
                <Check size={14} /> ยืนยัน
              </button>
              <button
                onClick={() => decide(r, 'reject')}
                disabled={busyId === r.id}
                className="flex items-center gap-1 border border-gray-300 hover:bg-white disabled:opacity-50 text-gray-600 text-xs font-medium px-2.5 py-1.5 rounded-lg"
              >
                <X size={14} /> ปฏิเสธ
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
