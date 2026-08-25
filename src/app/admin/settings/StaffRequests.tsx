'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, Check, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { confirmDialog } from '@/lib/confirm'
import { ROLE_LABELS, type Role } from '@/lib/types'

export interface StaffRequest {
  id: string
  name: string
  email: string | null
  created_at: string
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })

// คนที่ล็อกอิน Google เข้ามาเองแต่ยังไม่ได้รับอนุมัติ — เจ้าของร้านกดอนุมัติพร้อมเลือกสิทธิ์ที่นี่
export default function StaffRequests({ requests }: { requests: StaffRequest[] }) {
  const router = useRouter()
  const [roles, setRoles] = useState<Record<string, Role>>({})
  const [busy, setBusy] = useState(false)

  if (requests.length === 0) return null

  async function act(req: StaffRequest, action: 'approve' | 'reject') {
    if (action === 'reject') {
      const { confirmed } = await confirmDialog({
        title: 'ปฏิเสธคำขอนี้?',
        message: `${req.name} (${req.email ?? '—'}) จะยังเข้าระบบไม่ได้ และจะไม่ขึ้นในรายการนี้อีก`,
        confirmLabel: 'ปฏิเสธ',
      })
      if (!confirmed) return
    }

    setBusy(true)
    const res = await fetch('/api/admin/staff/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: req.id, action, role: roles[req.id] ?? 'cashier', name: req.name }),
    })
    const data = await res.json()
    setBusy(false)

    if (!res.ok) {
      toast.error(data.error ?? 'ทำรายการไม่สำเร็จ')
      return
    }
    toast.success(
      action === 'approve'
        ? `อนุมัติ "${req.name}" เป็น${ROLE_LABELS[roles[req.id] ?? 'cashier']}แล้ว`
        : `ปฏิเสธคำขอของ "${req.name}" แล้ว`
    )
    router.refresh()
  }

  return (
    <section className="bg-white rounded-xl shadow-sm border border-amber-200 p-6">
      <div className="flex items-center gap-2 mb-1">
        <UserPlus size={18} className="text-amber-500" />
        <h2 className="text-lg font-semibold text-gray-900">คำขอเข้าใช้งาน</h2>
        <span className="ml-1 min-w-5 h-5 px-1.5 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center">
          {requests.length}
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        คนที่ล็อกอินด้วย Google เข้ามาแล้วแต่ยังใช้งานไม่ได้ — เลือกสิทธิ์แล้วกดอนุมัติ
      </p>

      <div className="space-y-2">
        {requests.map((req) => (
          <div key={req.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 p-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{req.name}</p>
              <p className="text-xs text-gray-500 truncate">{req.email ?? '—'}</p>
              <p className="text-xs text-gray-400">ขอเมื่อ {fmtDate(req.created_at)}</p>
            </div>

            <select
              value={roles[req.id] ?? 'cashier'}
              onChange={(e) => setRoles((prev) => ({ ...prev, [req.id]: e.target.value as Role }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="cashier">{ROLE_LABELS.cashier}</option>
              <option value="vet">{ROLE_LABELS.vet}</option>
              <option value="admin">{ROLE_LABELS.admin}</option>
            </select>

            <button
              onClick={() => act(req, 'approve')}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium"
            >
              <Check size={15} /> อนุมัติ
            </button>
            <button
              onClick={() => act(req, 'reject')}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 disabled:opacity-50 text-sm text-gray-600 hover:bg-gray-50"
            >
              <X size={15} /> ปฏิเสธ
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
