import { CalendarCheck, PawPrint, Receipt, Syringe } from 'lucide-react'
import { petAge } from '@/lib/pets'
import { APPOINTMENT_TYPE_LABELS, SPECIES_LABELS, type AppointmentType, type PetSpecies } from '@/lib/types'

export interface PetCard {
  id: string
  name: string
  species: PetSpecies
  breed: string | null
  birth_date: string | null
  hn: string | null
  /** วัคซีนที่ถึงกำหนดแล้วหรือใกล้ถึง เรียงวันที่ใกล้สุดก่อน */
  dues: { vaccine: string; due: string }[]
}

export interface ApptCard {
  id: string
  scheduled_at: string
  type: AppointmentType
  petName: string | null
}

export interface BillCard {
  id: string
  number: string
  created_at: string
  total: number
  points_earned: number
}

const money = (n: number) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "12 พ.ย. 70" — ใช้ทั้งวันครบวัคซีนและวันหมดอายุแต้ม */
export const dayTh = (ymd: string) =>
  new Date(`${ymd}T00:00:00+07:00`).toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit',
  })

const dateTimeTh = (iso: string) =>
  new Date(iso).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
  })

/** เหลืออีกกี่วัน — ติดลบ = เลยกำหนดมาแล้ว (นับตามวันที่ไทย ไม่ใช่ UTC ของเซิร์ฟเวอร์) */
export function daysUntil(ymd: string): number {
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
  return Math.round((Date.parse(`${ymd}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)
}

function DueLine({ vaccine, due }: { vaccine: string; due: string }) {
  const left = daysUntil(due)
  const late = left < 0
  const soon = left >= 0 && left <= 30
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="flex items-start gap-2 min-w-0 text-sm text-brand-dark">
        <Syringe size={14} className={`mt-0.5 shrink-0 ${late ? 'text-red-500' : soon ? 'text-orange-500' : 'text-brand-muted'}`} />
        <span className="min-w-0 break-words">{vaccine}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-xs text-gray-500">{dayTh(due)}</span>
        <span className={`block text-[11px] font-medium ${late ? 'text-red-600' : soon ? 'text-orange-600' : 'text-gray-400'}`}>
          {late ? `เลยกำหนด ${Math.abs(left)} วัน` : left === 0 ? 'ครบกำหนดวันนี้' : `อีก ${left} วัน`}
        </span>
      </span>
    </div>
  )
}

/** กี่ตัวที่กางไว้เลย ที่เหลือซ่อนใต้ปุ่ม — บ้านที่มีสิบกว่าตัวไม่งั้นต้องเลื่อนยาวมาก */
const PETS_SHOWN = 5

function PetBlock({ pet }: { pet: PetCard }) {
  const age = petAge(pet.birth_date)
  const detail = [SPECIES_LABELS[pet.species], pet.breed, age].filter(Boolean).join(' · ')
  return (
    <div className="rounded-lg border border-brand-muted/20 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium text-brand-dark">{pet.name}</p>
        {pet.hn && <span className="text-[11px] font-mono text-gray-400">HN {pet.hn}</span>}
      </div>
      {detail && <p className="text-xs text-gray-500 mt-0.5">{detail}</p>}
      {pet.dues.length > 0 ? (
        <div className="mt-2 border-t border-brand-muted/20 pt-1">
          {pet.dues.map((d) => (
            <DueLine key={`${d.vaccine}-${d.due}`} vaccine={d.vaccine} due={d.due} />
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-gray-400">ยังไม่มีวัคซีนที่รอครบกำหนด</p>
      )}
    </div>
  )
}

export default function PetSection({
  pets,
  appointments,
  bills,
}: {
  pets: PetCard[]
  appointments: ApptCard[]
  bills: BillCard[]
}) {
  return (
    <>
      {pets.length > 0 && (
        <div className="rounded-xl bg-white border border-brand-muted/30 p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-brand-dark">
            <PawPrint size={18} className="text-brand-brown" /> น้องของฉัน
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            ข้อมูลจากที่คลินิกบันทึกไว้ · วันครบกำหนดวัคซีนนับจากเข็มล่าสุดที่ฉีดกับร้าน
          </p>
          <div className="mt-4 space-y-3">
            {pets.slice(0, PETS_SHOWN).map((pet) => (
              <PetBlock key={pet.id} pet={pet} />
            ))}
          </div>
          {pets.length > PETS_SHOWN && (
            <details className="group mt-3">
              <summary className="cursor-pointer list-none text-sm font-medium text-brand-brown hover:underline">
                <span className="group-open:hidden">ดูน้องที่เหลืออีก {pets.length - PETS_SHOWN} ตัว</span>
                <span className="hidden group-open:inline">ย่อรายการ</span>
              </summary>
              <div className="mt-3 space-y-3">
                {pets.slice(PETS_SHOWN).map((pet) => (
                  <PetBlock key={pet.id} pet={pet} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {appointments.length > 0 && (
        <div className="rounded-xl bg-white border border-brand-muted/30 p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-brand-dark">
            <CalendarCheck size={18} className="text-brand-brown" /> นัดหมายที่จะถึง
          </h2>
          <div className="mt-3 divide-y divide-brand-muted/20">
            {appointments.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-brand-dark">{APPOINTMENT_TYPE_LABELS[a.type]}</p>
                  {a.petName && <p className="text-xs text-gray-500">{a.petName}</p>}
                </div>
                <p className="shrink-0 text-xs text-gray-500">{dateTimeTh(a.scheduled_at)} น.</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-400">เลื่อนนัดหรือยกเลิก ทักแชทร้านได้เลย</p>
        </div>
      )}

      {bills.length > 0 && (
        <div className="rounded-xl bg-white border border-brand-muted/30 p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-brand-dark">
            <Receipt size={18} className="text-brand-brown" /> ซื้อล่าสุดที่หน้าร้าน
          </h2>
          <div className="mt-3 divide-y divide-brand-muted/20">
            {bills.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-brand-dark">{dateTimeTh(b.created_at)} น.</p>
                  <p className="text-[11px] font-mono text-gray-400">{b.number}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-medium text-brand-dark">฿{money(b.total)}</p>
                  {b.points_earned > 0 && <p className="text-[11px] text-brand-brown">+{b.points_earned} แต้ม</p>}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-400">
            เห็นเฉพาะบิลที่แจ้งเบอร์ไว้ตอนจ่ายเงิน — บิลที่ไม่ได้แจ้งจะไม่ขึ้นที่นี่และไม่ได้แต้ม
          </p>
        </div>
      )}
    </>
  )
}
