'use client'

import { useEffect, useState } from 'react'
import { PawPrint, Loader2 } from 'lucide-react'

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })
const dateTh = (iso: string) =>
  new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })

interface CustomerData {
  id: string
  name: string
  points: number
  total_spent: number
}

interface TxRow {
  transaction_number: string
  total: number
  points_earned: number
  points_used: number
  created_at: string
}

type Status = 'loading' | 'need-phone' | 'linking' | 'ready' | 'error'

export default function MemberClient() {
  const [status, setStatus] = useState<Status>('loading')
  const [lineUserId, setLineUserId] = useState<string | null>(null)
  const [customer, setCustomer] = useState<CustomerData | null>(null)
  const [transactions, setTransactions] = useState<TxRow[]>([])
  const [phone, setPhone] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const liff = (await import('@line/liff')).default
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! })

        if (!liff.isLoggedIn()) {
          liff.login()
          return
        }

        const profile = await liff.getProfile()
        if (cancelled) return
        setLineUserId(profile.userId)

        const res = await fetch(`/api/member/me?lineUserId=${encodeURIComponent(profile.userId)}`)
        const data = await res.json()
        if (cancelled) return

        if (data.linked) {
          setCustomer(data.customer)
          setTransactions(data.transactions)
          setStatus('ready')
        } else {
          setStatus('need-phone')
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
          setStatus('error')
        }
      }
    }

    init()
    return () => { cancelled = true }
  }, [])

  async function handleLink(e: React.FormEvent) {
    e.preventDefault()
    if (!lineUserId || !phone.trim()) return
    setStatus('linking')
    setErrorMsg('')
    try {
      const res = await fetch('/api/member/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineUserId, phone: phone.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error ?? 'เกิดข้อผิดพลาด')
        setStatus('need-phone')
        return
      }
      setCustomer(data)
      const txRes = await fetch(`/api/member/me?lineUserId=${encodeURIComponent(lineUserId)}`)
      const txData = await txRes.json()
      setTransactions(txData.transactions ?? [])
      setStatus('ready')
    } catch {
      setErrorMsg('เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง')
      setStatus('need-phone')
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-5 py-8" style={{ background: '#FDF6EE' }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="LANDBARK" className="h-16 w-16 object-contain mb-1" />
          <h1 className="text-xl font-bold" style={{ color: '#7A4E2D' }}>LANDBARK</h1>
          <p className="text-xs text-gray-400">แต้มสะสมสมาชิก</p>
        </div>

        {(status === 'loading') && (
          <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
            <Loader2 size={28} className="animate-spin" />
            <p className="text-sm">กำลังโหลด...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-center">
            <p className="text-sm text-red-500">{errorMsg}</p>
          </div>
        )}

        {(status === 'need-phone' || status === 'linking') && (
          <form onSubmit={handleLink} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <p className="text-sm font-medium text-gray-900 mb-1">ผูกบัญชีสมาชิก</p>
            <p className="text-xs text-gray-400 mb-4">กรอกเบอร์โทรที่สมัครสมาชิกไว้กับร้าน เพื่อดูแต้มสะสม</p>
            <input
              type="tel"
              inputMode="numeric"
              placeholder="เบอร์โทรศัพท์"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm mb-3"
              required
            />
            {errorMsg && <p className="text-xs text-red-500 mb-3">{errorMsg}</p>}
            <button
              type="submit"
              disabled={status === 'linking'}
              className="w-full flex items-center justify-center gap-2 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-60"
              style={{ background: '#C4865A' }}
            >
              {status === 'linking' && <Loader2 size={16} className="animate-spin" />}
              ยืนยัน
            </button>
          </form>
        )}

        {status === 'ready' && customer && (
          <div className="space-y-4">
            <div className="rounded-2xl p-5 text-white text-center" style={{ background: '#C4865A' }}>
              <p className="text-sm opacity-90">สวัสดีคุณ {customer.name}</p>
              <p className="text-4xl font-bold mt-1">{customer.points.toLocaleString('th-TH')}</p>
              <p className="text-xs opacity-80 mt-0.5">แต้มสะสม</p>
              <p className="text-xs opacity-70 mt-3">ยอดซื้อสะสม ฿{money(customer.total_spent)}</p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-sm font-medium text-gray-500 mb-3">ประวัติการซื้อล่าสุด</p>
              {transactions.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-gray-300">
                  <PawPrint size={28} />
                  <p className="text-xs">ยังไม่มีประวัติการซื้อ</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {transactions.map((tx) => (
                    <div key={tx.transaction_number} className="py-2.5">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900">฿{money(tx.total)}</p>
                        <p className="text-xs text-gray-400">{dateTh(tx.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {tx.points_earned > 0 && (
                          <span className="text-xs text-green-600">+{tx.points_earned} แต้ม</span>
                        )}
                        {tx.points_used > 0 && (
                          <span className="text-xs text-orange-500">ใช้ {tx.points_used} แต้ม</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
