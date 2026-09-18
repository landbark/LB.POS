'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from 'next/navigation'
import { Store as StoreIcon, Link2, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import type { MarketplaceChannel } from '@/lib/types'

export default function MarketplaceSection({ channels }: { channels: MarketplaceChannel[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const shopeeStatus = searchParams.get('shopee')

  const shopee = channels.find((c) => c.platform === 'shopee') ?? null
  const [partnerId, setPartnerId] = useState('')
  const [partnerKey, setPartnerKey] = useState('')
  const [showForm, setShowForm] = useState(!shopee)
  const [loading, setLoading] = useState(false)

  async function saveCredentials() {
    if (!partnerId.trim() || !partnerKey.trim()) {
      toast.error('กรุณาใส่ Partner ID และ Partner Key ให้ครบ')
      return
    }
    setLoading(true)
    const res = await fetch('/api/admin/marketplace/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: 'shopee', partner_id: partnerId.trim(), partner_key: partnerKey.trim() }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) {
      toast.error('บันทึกไม่สำเร็จ: ' + (data.error ?? ''))
      return
    }
    toast.success('บันทึก Partner ID/Key แล้ว — กด "เชื่อมต่อร้าน Shopee" ต่อได้เลย')
    setShowForm(false)
    router.refresh()
  }

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center gap-2 mb-1">
        <StoreIcon size={18} className="text-gray-400" />
        <h2 className="text-lg font-semibold text-gray-900">ช่องทางขายออนไลน์</h2>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        เชื่อมต่อร้าน Shopee/TikTok เพื่อตัดสต็อคอัตโนมัติ — ต้องสมัคร Developer App ของแพลตฟอร์มเองก่อน (ดูขั้นตอนจาก Claude ในแชท)
      </p>

      {shopeeStatus === 'connected' && (
        <div className="flex items-center gap-2 bg-green-50 text-green-700 text-sm rounded-lg px-3 py-2 mb-4">
          <CheckCircle2 size={16} /> เชื่อมต่อร้าน Shopee สำเร็จแล้ว
        </div>
      )}
      {shopeeStatus === 'error' && (
        <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">
          เชื่อมต่อไม่สำเร็จ: {searchParams.get('message') ?? 'เกิดข้อผิดพลาด'}
        </div>
      )}
      {shopeeStatus === 'missing_credentials' && (
        <div className="bg-amber-50 text-amber-700 text-sm rounded-lg px-3 py-2 mb-4">
          กรุณาใส่ Partner ID/Key ก่อนกดเชื่อมต่อร้าน
        </div>
      )}

      <div className="border border-gray-100 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="font-medium text-gray-900">Shopee</p>
          {shopee?.connected ? (
            <span className="inline-flex text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
              เชื่อมต่อแล้ว{shopee.shop_id ? ` (ร้าน ${shopee.shop_id})` : ''}
            </span>
          ) : (
            <span className="inline-flex text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">
              ยังไม่เชื่อมต่อ
            </span>
          )}
        </div>

        {!showForm ? (
          <button onClick={() => setShowForm(true)} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            {shopee ? 'แก้ไข Partner ID/Key' : 'ใส่ Partner ID/Key'}
          </button>
        ) : (
          <div className="space-y-2 max-w-sm">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Partner ID</label>
              <input
                type="text" value={partnerId} onChange={(e) => setPartnerId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Partner Key</label>
              <input
                type="password" value={partnerKey} onChange={(e) => setPartnerKey(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={saveCredentials}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              {loading ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        )}

        {shopee && !shopee.connected && !showForm && (
          <a
            href="/api/shopee/authorize"
            className="mt-3 inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            <Link2 size={14} /> เชื่อมต่อร้าน Shopee
          </a>
        )}
      </div>

      <div className="border border-gray-100 rounded-lg p-4 mt-3 opacity-50">
        <div className="flex items-center justify-between">
          <p className="font-medium text-gray-900">TikTok Shop</p>
          <span className="inline-flex text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">
            ยังไม่เปิดใช้งาน
          </span>
        </div>
      </div>
    </section>
  )
}
