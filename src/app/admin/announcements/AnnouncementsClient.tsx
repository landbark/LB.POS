'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Pencil, Pin, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import ImageInput from '@/components/ImageInput'
import type { Announcement } from '@/lib/types'

const dateTh = (iso: string) =>
  new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })

const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

interface Draft {
  id?: string
  title: string
  body: string
  image_url: string | null
  published: boolean
  pinned: boolean
}

const emptyDraft: Draft = { title: '', body: '', image_url: null, published: true, pinned: false }

export default function AnnouncementsClient({ initialItems }: { initialItems: Announcement[] }) {
  const router = useRouter()
  const [items, setItems] = useState(initialItems)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [imageBlob, setImageBlob] = useState<Blob | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function openNew() {
    setDraft(emptyDraft)
    setImageBlob(null)
    setImagePreview(null)
  }

  function openEdit(item: Announcement) {
    setDraft({
      id: item.id,
      title: item.title,
      body: item.body,
      image_url: item.image_url,
      published: item.published,
      pinned: item.pinned,
    })
    setImageBlob(null)
    setImagePreview(item.image_url)
  }

  async function save() {
    if (!draft || !draft.title.trim() || !draft.body.trim()) {
      toast.error('กรอกหัวข้อและเนื้อหาก่อน')
      return
    }
    setSaving(true)

    let imageUrl = draft.image_url
    if (imageBlob) {
      const fd = new FormData()
      fd.append('file', new File([imageBlob], 'news', { type: imageBlob.type }))
      const res = await fetch('/api/announcement-image', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        toast.error('อัปโหลดรูปไม่สำเร็จ: ' + (data.error ?? ''))
        setSaving(false)
        return
      }
      imageUrl = data.url
    } else if (!imagePreview) {
      imageUrl = null
    }

    // รูปเดิมที่ถูกแทน/ลบ ไม่ต้องเก็บไว้ใน storage
    if (draft.image_url && imageUrl !== draft.image_url) {
      fetch('/api/announcement-image', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: draft.image_url }),
      }).catch(() => {})
    }

    const supabase = createClient()
    const payload = {
      title: draft.title.trim(),
      body: draft.body.trim(),
      image_url: imageUrl,
      published: draft.published,
      pinned: draft.pinned,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = draft.id
      ? await supabase.from('announcements').update(payload).eq('id', draft.id).select('*').single()
      : await supabase.from('announcements').insert(payload).select('*').single()

    setSaving(false)
    if (error || !data) {
      toast.error('บันทึกไม่สำเร็จ: ' + (error?.message ?? ''))
      return
    }

    setItems(draft.id ? items.map((i) => (i.id === data.id ? data : i)) : [data, ...items])
    setDraft(null)
    toast.success(draft.id ? 'แก้ไขประกาศแล้ว' : 'เพิ่มประกาศแล้ว')
    router.refresh()
  }

  async function toggle(item: Announcement, field: 'published' | 'pinned') {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('announcements')
      .update({ [field]: !item[field], updated_at: new Date().toISOString() })
      .eq('id', item.id)
      .select('*')
      .single()
    if (error || !data) {
      toast.error('อัปเดตไม่สำเร็จ')
      return
    }
    setItems(items.map((i) => (i.id === data.id ? data : i)))
  }

  async function remove(item: Announcement) {
    if (!confirm(`ลบประกาศ "${item.title}"?`)) return
    const supabase = createClient()
    const { error } = await supabase.from('announcements').delete().eq('id', item.id)
    if (error) {
      toast.error('ลบไม่สำเร็จ')
      return
    }
    if (item.image_url) {
      fetch('/api/announcement-image', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: item.image_url }),
      }).catch(() => {})
    }
    setItems(items.filter((i) => i.id !== item.id))
    toast.success('ลบประกาศแล้ว')
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ประกาศข่าว</h1>
          <p className="text-sm text-gray-500 mt-0.5">ขึ้นหน้าแรกของเว็บร้าน — ลูกค้าเห็นเฉพาะที่เผยแพร่แล้ว</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> เพิ่มประกาศ
        </button>
      </div>

      {draft && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6 space-y-4">
          <h2 className="font-semibold text-gray-900">{draft.id ? 'แก้ไขประกาศ' : 'ประกาศใหม่'}</h2>

          <ImageInput
            label="รูปประกอบ (ไม่ใส่ก็ได้)"
            hint="ครอปเป็นแนวนอน 16:9 อัตโนมัติ"
            aspect={16 / 9}
            preview={imagePreview}
            onChange={(blob, previewUrl) => {
              setImageBlob(blob)
              setImagePreview(previewUrl)
            }}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">หัวข้อ *</label>
            <input
              className={inputClass}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="เช่น ร้านหยุดวันสงกรานต์ 13-15 เม.ย."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">เนื้อหา *</label>
            <textarea
              className={inputClass}
              rows={6}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              placeholder="รายละเอียดที่อยากบอกลูกค้า"
            />
          </div>

          <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={draft.published}
                onChange={(e) => setDraft({ ...draft, published: e.target.checked })}
                className="w-4 h-4 accent-blue-600"
              />
              เผยแพร่บนเว็บ
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={draft.pinned}
                onChange={(e) => setDraft({ ...draft, pinned: e.target.checked })}
                className="w-4 h-4 accent-blue-600"
              />
              ปักหมุดขึ้นบนสุด
            </label>
          </div>

          <div className="flex gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm"
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
            <button
              onClick={() => setDraft(null)}
              className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">
        {items.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400">ยังไม่มีประกาศ</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="p-4 flex gap-4">
              {item.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image_url} alt="" className="w-24 h-16 rounded-lg object-cover shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {item.pinned && <Pin size={13} className="text-blue-600" />}
                  <h3 className="font-medium text-gray-900 truncate">{item.title}</h3>
                  {!item.published && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">ร่าง</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{dateTh(item.published_at)}</p>
                <p className="text-sm text-gray-600 mt-1 line-clamp-2">{item.body}</p>
              </div>

              <div className="flex items-start gap-1 shrink-0">
                <button
                  onClick={() => toggle(item, 'pinned')}
                  title={item.pinned ? 'เลิกปักหมุด' : 'ปักหมุด'}
                  className={`p-2 rounded-lg hover:bg-gray-50 ${item.pinned ? 'text-blue-600' : 'text-gray-400'}`}
                >
                  <Pin size={16} />
                </button>
                <button
                  onClick={() => toggle(item, 'published')}
                  title={item.published ? 'ซ่อนจากเว็บ' : 'เผยแพร่'}
                  className="p-2 rounded-lg text-gray-400 hover:bg-gray-50"
                >
                  {item.published ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
                <button onClick={() => openEdit(item)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-50">
                  <Pencil size={16} />
                </button>
                <button onClick={() => remove(item)} className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-gray-50">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
