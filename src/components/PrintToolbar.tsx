'use client'

interface Props {
  sizes: { value: string; label: string }[]
  size: string
  onSizeChange: (value: string) => void
  backHref: string
}

// แถบเครื่องมือด้านบนหน้าพิมพ์เอกสาร (ใบเสร็จ/ใบสั่งซื้อ) — ซ่อนตอนพิมพ์จริงด้วย .no-print
export default function PrintToolbar({ sizes, size, onSizeChange, backHref }: Props) {
  return (
    <div className="no-print sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <a href={backHref} className="text-sm text-gray-500 hover:text-gray-700 mr-2">
          ← กลับ
        </a>
        {sizes.map((s) => (
          <button
            key={s.value}
            onClick={() => onSizeChange(s.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-colors ${
              size === s.value
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <button
        onClick={() => window.print()}
        className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
      >
        พิมพ์ / บันทึกเป็น PDF
      </button>
    </div>
  )
}
