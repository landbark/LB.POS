'use client'

import { useState, useEffect, useMemo, useRef, useCallback, useDeferredValue } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Search, X, Plus, Minus, ShoppingCart, User, MonitorPlay, Stethoscope, ScanBarcode, Store } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Product, CartItem, Promotion, PointsConfig, Customer, PaymentMethod, ClinicQueueVisit, RoundingMode } from '@/lib/types'
import { POS_DISPLAY_CHANNEL, type PosDisplayMessage } from '@/lib/posDisplay'
import PaymentModal from './PaymentModal'
import { confirmDialog } from '@/lib/confirm'
import BarcodeScanner, { type ScanFeedback } from '@/components/BarcodeScanner'
import { withBoothPrices } from '@/lib/booth'

/** รอบออกบูธที่เปิดอยู่ — ไม่มีรอบเปิด (null) ก็กดโหมดบูธไม่ได้ */
export interface BoothContext {
  id: string
  trip_number: string
  label: string
  /** สินค้าที่อยู่ในใบเบิกของรอบนี้ */
  productIds: string[]
  /** ยกไปงานกี่ชิ้นต่อสินค้าหนึ่งตัว */
  takenByProduct: Record<string, number>
}

interface Props {
  products: Product[]
  booth: BoothContext | null
  promotions: Promotion[]
  pointsConfig: PointsConfig | null
  cashierId: string
  promptpayId: string | null
  roundingMode: RoundingMode
  clinicQueue: ClinicQueueVisit[]
}

// ความยาวต่ำสุดของหางข้อความที่จะยอมมองว่าเป็นบาร์โค้ดที่ยิงทับเข้ามา
// (บาร์โค้ดที่สั้นที่สุดในร้านคือ 5 ตัว เผื่อไว้ที่ 4)
const SCAN_MIN_LEN = 4

const isScannable = (code: string | null | undefined) => /^\d{8,14}$/.test((code ?? '').trim())

const matchesQuery = (p: Product, q: string) =>
  !q ||
  p.name.toLowerCase().includes(q) ||
  (p.sku != null && p.sku.toLowerCase().includes(q)) ||
  (p.barcode != null && p.barcode.toLowerCase().includes(q))

// จำนวนสินค้าที่วาดบนกริด — วาดครบสองพันตัวทำให้ทุกตัวอักษรที่พิมพ์หน่วงเป็นสิบ ms
const GRID_LIMIT = 60

export default function POSClient({ products: allProducts, booth, promotions, pointsConfig, cashierId, promptpayId, roundingMode, clinicQueue }: Props) {
  const router = useRouter()
  // เวชระเบียนที่กำลังเก็บเงินอยู่ — จ่ายเสร็จแล้วจะถูก mark เป็น paid พร้อมผูกเลขที่บิล
  // เจ้าของคนเดียวพาสัตว์มาหลายตัว (หรือตัวเดิมหลายใบ) รวมเก็บเงินทีเดียวได้ เลยเก็บเป็นรายการ
  const [activeVisits, setActiveVisits] = useState<ClinicQueueVisit[]>([])
  const [showQueue, setShowQueue] = useState(false)
  // แผงตะกร้าบนมือถือ — จอใหญ่โชว์ตลอดอยู่แล้ว ไม่สนค่านี้
  const [cartOpen, setCartOpen] = useState(false)
  // เวชระเบียนที่เพิ่งเก็บเงินไป — ซ่อนออกจากคิวทันที ไม่ต้องรอ router.refresh() ตามมาทัน
  // (เก็บเป็นรายการ id แทนการ copy คิวมาเป็น state เพราะถ้า refresh คืนข้อมูลเก่ามา ตัวที่จ่ายแล้วจะโผล่ซ้ำ)
  const [paidVisitIds, setPaidVisitIds] = useState<string[]>([])
  // แถวในตะกร้าที่กำลังเปิดช่องลดราคา + โหมดลด (บาท/%) ของแถวนั้น
  const [discountRow, setDiscountRow] = useState<string | null>(null)
  const [discountMode, setDiscountMode] = useState<'amount' | 'percent'>('amount')
  const [discountInput, setDiscountInput] = useState('')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [customerPhone, setCustomerPhone] = useState('')
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [showPayment, setShowPayment] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('')
  // โหมดบูธ — จำไว้ที่เครื่อง ไม่ใช่ที่บัญชี: เครื่องที่ไปงานเปิดไว้ ส่วนเครื่องที่ร้านยังขายราคาปกติ
  const [boothMode, setBoothMode] = useState(false)
  // ในโหมดบูธปกติโชว์เฉพาะของในใบเบิก — ติ๊กอันนี้ถ้าต้องขายตัวที่ลืมลงใบ
  const [boothShowAll, setBoothShowAll] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const [showScanner, setShowScanner] = useState(false)
  // ปุ่มกล้องโชว์เฉพาะมือถือ/แท็บเล็ตที่เปิดกล้องได้ — เครื่องที่ใช้เมาส์ยิงด้วยเครื่องยิงอยู่แล้ว
  // เช็คหลัง mount ไม่ให้ html ฝั่ง server ไม่ตรงกับฝั่ง client
  const [canScan, setCanScan] = useState(false)
  useEffect(() => {
    setCanScan(
      Boolean(navigator.mediaDevices?.getUserMedia) &&
        window.matchMedia('(pointer: coarse)').matches,
    )
  }, [])

  // อ่านค่าที่เครื่องนี้ตั้งไว้หลัง mount (ฝั่ง server ไม่มี localStorage จะทำให้ html ไม่ตรงกัน)
  // รอบปิดไปแล้วก็ปิดโหมดให้เอง ไม่งั้นวันรุ่งขึ้นที่ร้านจะขายราคาบูธโดยไม่รู้ตัว
  useEffect(() => {
    if (!booth) {
      setBoothMode(false)
      return
    }
    try {
      setBoothMode(localStorage.getItem('lb_booth_trip') === booth.id)
    } catch {
      // โหมดส่วนตัว/ปิดคุกกี้ — ไม่เป็นไร เริ่มที่โหมดปกติ
    }
  }, [booth])

  function toggleBoothMode(on: boolean) {
    if (cart.length > 0) {
      toast.error('เคลียร์ตะกร้าก่อนสลับโหมด — ราคาในตะกร้าจะไม่เปลี่ยนตาม')
      return
    }
    setBoothMode(on)
    setCategoryFilter('')
    try {
      if (on && booth) localStorage.setItem('lb_booth_trip', booth.id)
      else localStorage.removeItem('lb_booth_trip')
    } catch {
      // เก็บไม่ได้ก็ใช้ได้ปกติ แค่ต้องกดใหม่ถ้ารีเฟรชหน้า
    }
  }

  // เครื่องยิงบาร์โค้ดทำงานเหมือนคีย์บอร์ด ต้องมี focus อยู่ที่ช่องค้นหาตลอดถึงจะยิงได้เลยโดยไม่ต้องคลิกก่อน
  // เฉพาะเครื่องที่ใช้เมาส์ — มือถือ/แท็บเล็ตจะเด้งคีย์บอร์ดขึ้นมาบังจอ
  const focusSearch = useCallback(() => {
    if (typeof window === 'undefined') return
    if (!window.matchMedia('(pointer: fine)').matches) return
    searchRef.current?.focus()
  }, [])

  // โฟกัสตั้งแต่เปิดหน้า และดึงกลับทุกครั้งที่ modal ปิด (ตอน modal เปิดอย่าไปแย่ง)
  useEffect(() => {
    if (showPayment || showQueue || showScanner) return
    focusSearch()
  }, [showPayment, showQueue, showScanner, focusSearch])

  // สำรองไว้เผื่อ focus หลุดไปอยู่ที่ปุ่มอื่น — ตัวอักษรแรกที่ยิงมาจะไม่หาย
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (showPayment || showScanner) return // อย่าแย่ง focus ตอน modal ชำระเงิน/กล้องเปิดอยู่
      const t = e.target as HTMLElement
      if (
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' ||
        t.isContentEditable
      ) return
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        searchRef.current?.focus()
        setSearch((prev) => prev + e.key)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showPayment, showScanner])

  // โหมดบูธ: สลับ price เป็นราคาบูธทั้งก้อนตั้งแต่ต้นทาง แทนที่จะไปแก้ทุกจุดที่อ่านราคา
  // (กริด, ตะกร้า, โปรโมชั่น, จอลูกค้า) — พลาดจุดเดียวลูกค้าจ่ายผิดราคา
  const products = useMemo(() => {
    if (!boothMode || !booth) return allProducts
    const inSheet = new Set(booth.productIds)
    const pool = boothShowAll ? allProducts : allProducts.filter((p) => inSheet.has(p.id))
    return withBoothPrices(pool)
  }, [allProducts, booth, boothMode, boothShowAll])

  // Get unique categories from products
  const categories = Array.from(
    new Map(
      products
        .filter((p) => p.categories)
        .map((p) => [(p.categories as any).name, (p.categories as any).name])
    ).values()
  )

  // กริดตามหลังช่องพิมพ์ได้ — เครื่องยิงบาร์โค้ดพ่นตัวอักษรรัวเป็นสิบตัวในเสี้ยววินาที
  // ถ้ากรองสินค้าสองพันตัวแล้ววาดการ์ดใหม่ทุกตัวอักษร ตัวที่พิมพ์มาทีหลังจะตกหล่น
  // (React คืนค่าใน input กลับเป็น state เก่าระหว่างที่ยัง render ไม่ทัน) — ยิงแล้วไม่ติดเพราะแบบนี้
  const deferredSearch = useDeferredValue(search)
  const q = deferredSearch.trim().toLowerCase()
  const filtered = products.filter((p) => {
    const matchCategory = !categoryFilter || (p.categories as any)?.name === categoryFilter
    // สินค้าสต็อค 0 ยังโชว์ — ของบนชั้นมักมีจริงแม้ยอดในระบบหมด ขายได้แล้วให้สต็อคติดลบไว้ฟ้องว่าต้องนับใหม่
    return matchesQuery(p, q) && matchCategory
  })

  // สแกนบาร์โค้ดเป็นหลัก — ของที่ยิงไม่ได้คือของที่ต้องกดเลือกเอง เลยดันขึ้นมาก่อน
  //
  // ดู "ยิงได้จริงไหม" ไม่ใช่ "ช่องบาร์โค้ดว่างไหม" เพราะตอนย้ายระบบมีการเติม SKU ตัวเอง
  // (EXT002) และรหัสภายใน (DUCKMUZZLE-L) ลงช่องบาร์โค้ดไว้ด้วย ซึ่งไม่มีอยู่บนกล่องสินค้าจริง
  // ของจริงเป็น EAN/UPC = ตัวเลขล้วน 8-14 หลักเสมอ
  const ordered = [...filtered].sort(
    (a, b) => Number(isScannable(a.barcode)) - Number(isScannable(b.barcode)),
  )

  function getProductStock(product: Product): number {
    // บริการ (ค่าตรวจ/ค่าหัตถการ) ไม่มีล็อตให้ตัด — ไม่จำกัดจำนวนที่ขายได้
    if (product.is_service) return Infinity
    return (product.product_lots ?? []).reduce((s: number, l: any) => s + l.quantity, 0)
  }

  // Pick the lot with the earliest expiry (FEFO) with stock
  function getBestLot(product: Product): string | null {
    const lots = (product.product_lots ?? [])
      .filter((l: any) => l.quantity > 0)
      .sort((a: any, b: any) => {
        if (!a.expiry_date) return 1
        if (!b.expiry_date) return -1
        return a.expiry_date.localeCompare(b.expiry_date)
      })
    return lots[0]?.id ?? null
  }

  function applyPromotion(product: Product, quantity: number): number {
    let discount = 0

    for (const promo of promotions) {
      const applies =
        promo.apply_to === 'all' ||
        (promo.apply_to === 'product' && promo.product_id === product.id) ||
        (promo.apply_to === 'category' && promo.category_id === (product as any).category_id)

      if (!applies) continue

      if (promo.type === 'percent_discount' && promo.discount_percent) {
        discount = (product.price * quantity * promo.discount_percent) / 100
      } else if (
        promo.type === 'buy_x_get_y' &&
        promo.buy_quantity &&
        promo.get_quantity
      ) {
        const sets = Math.floor(quantity / promo.buy_quantity)
        const freeQty = Math.min(sets * promo.get_quantity, quantity - sets * promo.buy_quantity)
        discount = freeQty * product.price
      }
    }

    return discount
  }

  // ยอดของบรรทัดหนึ่งในตะกร้า — คิดส่วนลดที่ลดเองใหม่จาก mode/value ทุกครั้ง
  // (ถ้าเก็บแต่ยอดบาทไว้ พอแก้จำนวนแล้ว % จะค้างอยู่ที่จำนวนเดิม)
  function lineTotals(
    product: Product,
    unitPrice: number,
    qty: number,
    mode: 'amount' | 'percent',
    value: number
  ) {
    const gross = unitPrice * qty
    const manual = !value || value <= 0
      ? 0
      : mode === 'percent'
        ? (gross * Math.min(value, 100)) / 100
        : Math.min(gross, value)
    const discount = Math.min(gross, applyPromotion(product, qty) + manual)
    return { manual_discount: manual, discount, subtotal: gross - discount }
  }

  function addToCart(product: Product) {
    const maxStock = getProductStock(product)
    const existing = cart.findIndex((c) => c.product.id === product.id)
    if (existing >= 0) {
      const newCart = [...cart]
      const item = newCart[existing]
      const newQty = item.quantity + 1
      if (newQty > maxStock) toast(`ขายเกินสต็อค — คงเหลือในระบบ ${maxStock} ${product.unit}`, { icon: '⚠️' })
      newCart[existing] = {
        ...item,
        quantity: newQty,
        ...lineTotals(product, item.unit_price, newQty, item.discount_mode, item.discount_value),
      }
      setCart(newCart)
    } else {
      const lot_id = getBestLot(product)
      setCart([
        ...cart,
        {
          product,
          quantity: 1,
          unit_price: product.price,
          discount_mode: 'amount',
          discount_value: 0,
          ...lineTotals(product, product.price, 1, 'amount', 0),
          lot_id,
        },
      ])
    }
    // กดการ์ดสินค้าแล้ว focus จะไปติดอยู่ที่ปุ่ม — ดึงกลับช่องค้นหาให้ยิงตัวต่อไปได้เลย
    focusSearch()
  }

  // ดึงรายการที่หมอสั่งจ่ายเข้าตะกร้า — ราคาใช้ตามที่บันทึกไว้ในเวชระเบียน ไม่ใช่ราคาสินค้าปัจจุบัน
  async function loadVisit(visit: ClinicQueueVisit) {
    // ใบที่สองขึ้นไปต้องเป็นเจ้าของคนเดียวกัน ไม่งั้นเงินของคนหนึ่งจะไปอยู่ในบิลของอีกคน
    const merging = activeVisits.length > 0
    if (merging) {
      const owner = activeVisits[0].customer?.id ?? null
      if ((visit.customer?.id ?? null) !== owner) {
        toast.error('คนละเจ้าของกัน — ต้องเก็บเงินแยกบิล')
        return
      }
    } else if (cart.length > 0) {
      const { confirmed } = await confirmDialog({
        title: 'แทนที่ตะกร้าเดิม?',
        message: 'ตะกร้ามีของอยู่แล้ว — จะแทนที่ด้วยรายการจากคลินิก',
        confirmLabel: 'แทนที่',
        tone: 'primary',
      })
      if (!confirmed) return
    }

    const short = visit.items.filter((i) => !i.product.is_service && getProductStock(i.product) < i.quantity)
    if (short.length > 0) {
      toast(`ขายเกินสต็อค: ${short.map((i) => i.product.name).join(', ')}`, { icon: '⚠️' })
    }

    const incoming = visit.items.map((i) => ({
      product: i.product,
      quantity: i.quantity,
      unit_price: i.unit_price,
      discount: 0,
      manual_discount: 0,
      discount_mode: 'amount' as const,
      discount_value: 0,
      subtotal: i.unit_price * i.quantity,
      lot_id: getBestLot(i.product),
    }))

    if (merging) {
      // ของซ้ำกันที่ราคาเท่ากันรวมเป็นบรรทัดเดียว — ราคาต่างกันต้องแยก (หมอตั้งราคารายใบได้)
      const next = [...cart]
      for (const add of incoming) {
        const at = next.findIndex(
          (c) => c.product.id === add.product.id && c.unit_price === add.unit_price && c.discount_value === 0,
        )
        if (at >= 0) {
          const qty = next[at].quantity + add.quantity
          next[at] = { ...next[at], quantity: qty, subtotal: next[at].unit_price * qty }
        } else {
          next.push(add)
        }
      }
      setCart(next)
      setActiveVisits([...activeVisits, visit])
      toast.success(`รวมใบ ${visit.visit_number} (${visit.pet_name || 'ไม่ระบุสัตว์'}) เข้าบิลแล้ว`)
    } else {
      setCart(incoming)
      setCustomer(visit.customer)
      setCustomerPhone(visit.customer?.phone ?? '')
      setShowAddCustomer(false)
      setActiveVisits([visit])
    }
    setShowQueue(false)
  }

  function changeQty(index: number, delta: number) {
    const newCart = [...cart]
    const item = newCart[index]
    const newQty = item.quantity + delta
    if (newQty <= 0) {
      newCart.splice(index, 1)
    } else {
      // เตือนตอนเพิ่มเกินสต็อค แต่ไม่บล็อก — ร้านเลือกให้ขายได้แล้วค่อยไปนับสต็อคใหม่
      if (delta > 0) {
        const maxStock = getProductStock(item.product)
        if (newQty > maxStock) toast(`ขายเกินสต็อค — คงเหลือในระบบ ${maxStock} ${item.product.unit}`, { icon: '⚠️' })
      }
      newCart[index] = {
        ...item,
        quantity: newQty,
        ...lineTotals(item.product, item.unit_price, newQty, item.discount_mode, item.discount_value),
      }
    }
    setCart(newCart)
  }

  // พิมพ์จำนวนตรงๆ ในตะกร้า — เกินสต็อคได้ แค่เตือน ห้ามต่ำกว่า 1
  // ค่าบริการบางอย่างราคาไม่คงที่ (ค่าส่งพัสดุคิดตามน้ำหนัก/ปลายทาง) — ให้พิมพ์ราคาได้ตอนขาย
  // เฉพาะ is_service เท่านั้น สินค้าจริงยังใช้ราคาที่ตั้งไว้ จะได้ไม่มีใครเผลอขายผิดราคา
  function setUnitPrice(index: number, raw: string) {
    const item = cart[index]
    const parsed = parseFloat(raw)
    const price = isNaN(parsed) || parsed < 0 ? 0 : parsed
    const newCart = [...cart]
    newCart[index] = {
      ...item,
      unit_price: price,
      ...lineTotals(item.product, price, item.quantity, item.discount_mode, item.discount_value),
    }
    setCart(newCart)
  }

  function setQty(index: number, raw: string) {
    if (raw === '') return
    let n = parseInt(raw)
    if (isNaN(n)) return
    const item = cart[index]
    const maxStock = getProductStock(item.product)
    if (n > maxStock) toast(`ขายเกินสต็อค — คงเหลือในระบบ ${maxStock} ${item.product.unit}`, { icon: '⚠️' })
    if (n < 1) n = 1
    const newCart = [...cart]
    newCart[index] = {
      ...item,
      quantity: n,
      ...lineTotals(item.product, item.unit_price, n, item.discount_mode, item.discount_value),
    }
    setCart(newCart)
  }

  async function searchCustomer() {
    if (!customerPhone) return
    const supabase = createClient()
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('phone', customerPhone)
      .single()

    if (data) {
      setCustomer(data)
      setShowAddCustomer(false)
      toast.success(pointsConfig ? `พบลูกค้า: ${data.name} (${data.points} แต้ม)` : `พบลูกค้า: ${data.name}`)
    } else {
      toast.error('ไม่พบลูกค้า — เพิ่มใหม่ได้เลย')
      setShowAddCustomer(true)
      setNewCustomerName('')
    }
  }

  async function addCustomer() {
    if (!newCustomerName.trim()) {
      toast.error('กรุณาใส่ชื่อลูกค้า')
      return
    }
    const supabase = createClient()
    const { data, error } = await supabase
      .from('customers')
      .insert({ name: newCustomerName.trim(), phone: customerPhone })
      .select('*')
      .single()

    if (error || !data) {
      toast.error(error?.code === '23505' ? 'เบอร์นี้มีลูกค้าอยู่แล้ว' : 'เพิ่มลูกค้าไม่สำเร็จ')
      return
    }
    setCustomer(data)
    setShowAddCustomer(false)
    setNewCustomerName('')
    toast.success('เพิ่มลูกค้าใหม่แล้ว')
  }

  function findExact(code: string) {
    const c = code.trim()
    if (!c) return null
    return (
      products.find((p) => p.barcode === c) ??
      products.find((p) => p.sku?.toLowerCase() === c.toLowerCase()) ??
      null
    )
  }

  // เครื่องยิงบาร์โค้ดพิมพ์ต่อท้ายข้อความที่ค้างอยู่ในช่อง ("catty" + "8858788700054")
  // จับด้วยการเทียบตัวอักษร ไม่ใช่จับจังหวะการพิมพ์ — เวลาระหว่างปุ่มเชื่อถือไม่ได้ เพราะตอนกรอง
  // สินค้าหน้าจะหนืดจนช่องว่างระหว่างตัวอักษรยืดออกจนดูเหมือนคนพิมพ์ (เคยจับได้แค่ 4 ตัวท้าย)
  // ไล่จากหางยาวสุดก่อน เพื่อให้ "ทั้งก้อนตรง" ชนะ "หางตรง" เสมอ
  //
  // หางที่มีเว้นวรรคนำหน้าไม่นับ เพราะชื่อสินค้าบางตัวลงท้ายด้วยรหัสของตัวเอง
  // ("ชามอาหารน้องหมีชมพู BL095") ส่วนเครื่องยิงต่อท้ายติดกันเลยไม่มีเว้นวรรค
  // ยกเว้นบาร์โค้ดตัวเลขล้วนยาวๆ ซึ่งยังไงก็ไม่ใช่คำที่คนพิมพ์ จะมีเว้นวรรคนำหน้าก็ยอมรับ
  function findScannedCode(text: string) {
    for (let start = 0; start <= text.length - SCAN_MIN_LEN; start++) {
      const code = text.slice(start)
      // ขึ้นต้นด้วยเว้นวรรค = ตำแหน่งนี้ข้ามไป เดี๋ยววนไปเจอที่ตัวอักษรถัดไปเอง
      // (ถ้าไม่ข้าม findExact จะ trim ให้แล้วตรงทันที กฎเว้นวรรคข้างล่างก็ไม่มีผล)
      if (/^\s/.test(code)) continue
      const spaced = start > 0 && /\s/.test(text[start - 1])
      if (spaced && !/^\d{8,}$/.test(code)) continue
      const product = findExact(code)
      if (product) return { product, before: text.slice(0, start) }
    }
    return null
  }

  // ยิงจากกล้อง: รหัสที่ได้คือบาร์โค้ดเต็มๆ ตัวเดียว ไม่ต้องเดาหางข้อความเหมือนเครื่องยิงที่พิมพ์ทับช่องค้นหา
  function handleScannedCode(code: string): ScanFeedback {
    const product = findExact(code)
    if (!product) return { ok: false, message: `ไม่พบสินค้าที่ใช้บาร์โค้ด ${code}` }
    addToCart(product)
    return { ok: true, message: `+ ${product.name}` }
  }

  // Enter ในช่องค้นหา: บาร์โค้ด/รหัสสินค้าตรง หรือผลค้นหาเหลือตัวเดียว → เข้าตะกร้าทันที
  function handleSearchEnter() {
    // อ่านจากช่องค้นหาโดยตรง ไม่ใช่จาก state — ตอนยิงรัวๆ state ยังตามมาไม่ครบ
    // แต่ค่าใน input ครบแล้วเสมอ (เคยยิงแล้วขึ้น "ไม่พบสินค้า" ทั้งที่ยิงถูก เพราะอ่าน state เก่า)
    const text = (searchRef.current?.value ?? search).trim()
    if (!text) return

    const scan = findScannedCode(text)
    if (scan) {
      addToCart(scan.product)
      // คืนคำค้นที่พิมพ์ค้างไว้ก่อนโดนยิงทับ — พิมพ์ต่อได้เลยไม่ต้องลบเอง
      setSearch(scan.before)
      searchRef.current?.focus()
      return
    }

    // หาคู่จากข้อความสดในช่อง ไม่ใช้ผลกรองของกริดที่ตั้งใจให้ตามหลัง
    const live = text.toLowerCase()
    const matches = products.filter(
      (p) => matchesQuery(p, live) && (!categoryFilter || (p.categories as any)?.name === categoryFilter),
    )
    if (matches.length === 1) {
      addToCart(matches[0])
      setSearch('')
    } else if (matches.length === 0) {
      // ยิงบาร์โค้ดที่ไม่มีในระบบ: ต้องล้างช่องทิ้ง ไม่งั้นรหัสที่ยิงค้างอยู่ แล้วครั้งต่อไป
      // จะไปต่อท้ายของเดิมกลายเป็นข้อความมั่วที่ไม่มีวันตรงกับอะไรเลย — ยิงกี่ทีก็ไม่ติด
      const scanned = text.match(/\d{8,14}$/)?.[0]
      if (scanned) {
        toast.error(`ไม่พบสินค้าที่ใช้บาร์โค้ด ${scanned}`)
        setSearch('')
        searchRef.current?.focus()
      } else {
        toast.error('ไม่พบสินค้า')
      }
    }
  }

  // ลดเองรายบรรทัด — โปรโมชั่นของบรรทัดนั้นยังอยู่ ลดเพิ่มทับลงไป
  // เก็บ mode/value ไว้ด้วย เพื่อให้ % คิดใหม่เองเมื่อจำนวนเปลี่ยน
  function setLineDiscount(index: number, raw: string, mode: 'amount' | 'percent') {
    const item = cart[index]
    const parsed = parseFloat(raw || '0')
    const value = isNaN(parsed) || parsed <= 0 ? 0 : parsed
    const newCart = [...cart]
    newCart[index] = {
      ...item,
      discount_mode: mode,
      discount_value: value,
      ...lineTotals(item.product, item.unit_price, item.quantity, mode, value),
    }
    setCart(newCart)
  }

  // ใช้ unit_price ไม่ใช่ราคาสินค้าปัจจุบัน — บิลจากคลินิกใช้ราคาที่หมอบันทึกไว้
  const subtotal = cart.reduce((s, item) => s + item.unit_price * item.quantity, 0)
  const totalDiscount = cart.reduce((s, item) => s + item.discount, 0)
  const total = subtotal - totalDiscount

  // จอสอง (customer display) — เปิด BroadcastChannel ไว้ตลอด ส่งสถานะตะกร้าปัจจุบันให้จอลูกค้าเห็นแบบเรียลไทม์
  const displayChannelRef = useRef<BroadcastChannel | null>(null)
  useEffect(() => {
    displayChannelRef.current = new BroadcastChannel(POS_DISPLAY_CHANNEL)
    return () => displayChannelRef.current?.close()
  }, [])

  useEffect(() => {
    if (showPayment) return // ตอนจ่ายเงิน ให้ PaymentModal เป็นคนส่งสถานะแทน
    const earnedPoints = pointsConfig && total > 0
      ? Math.floor(total / pointsConfig.spend_amount) * pointsConfig.earn_points
      : 0
    const msg: PosDisplayMessage = {
      stage: 'cart',
      items: cart.map((item) => ({
        name: item.product.name,
        unit: item.product.unit,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        subtotal: item.subtotal,
      })),
      subtotal,
      discount: totalDiscount,
      total,
      customer: customer && pointsConfig
        ? { name: customer.name, pointsBefore: customer.points, pointsEarned: earnedPoints, pointsAfter: customer.points + earnedPoints }
        : null,
    }
    displayChannelRef.current?.postMessage(msg)
  }, [cart, customer, subtotal, totalDiscount, total, pointsConfig, showPayment])

  const cartCount = cart.reduce((n, i) => n + i.quantity, 0)
  const activeVisitIds = activeVisits.map((v) => v.id)
  const queue = clinicQueue.filter(
    (v) => !paidVisitIds.includes(v.id) && !activeVisitIds.includes(v.id),
  )
  // ใบของเจ้าของคนเดียวกับที่กำลังเก็บเงินอยู่ — รวมเข้าบิลเดียวกันได้
  const sameOwnerQueue = activeVisits.length > 0
    ? queue.filter((v) => (v.customer?.id ?? null) === (activeVisits[0].customer?.id ?? null))
    : []

  return (
    // มือถือ: สินค้าเต็มจอ ตะกร้าซ่อนอยู่หลังแถบล่าง — จอใหญ่: สองคอลัมน์เหมือนเดิม
    <div className="flex h-[calc(100dvh-56px)]">
      {/* Left: Product Grid */}
      <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
        {/* โหมดบูธ — โชว์เฉพาะตอนมีรอบออกบูธเปิดอยู่ */}
        {booth && (
          <div className={`px-4 py-2 border-b ${boothMode ? 'bg-amber-100 border-amber-300' : 'bg-white border-gray-200'}`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <button
                onClick={() => toggleBoothMode(!boothMode)}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  boothMode
                    ? 'bg-amber-600 text-white hover:bg-amber-700'
                    : 'border-2 border-amber-300 text-amber-800 hover:bg-amber-50'
                }`}
              >
                <Store size={15} />
                {boothMode ? 'กำลังขายที่บูธ — กดเพื่อกลับหน้าร้าน' : 'เปิดโหมดบูธ'}
              </button>
              <span className={`text-xs ${boothMode ? 'text-amber-900' : 'text-gray-500'}`}>
                {boothMode ? `${booth.label} · ราคาบูธ` : `มีรอบออกบูธเปิดอยู่: ${booth.label}`}
              </span>
              {boothMode && (
                <label className="ml-auto flex items-center gap-1.5 text-xs text-amber-900">
                  <input
                    type="checkbox"
                    checked={boothShowAll}
                    onChange={(e) => setBoothShowAll(e.target.checked)}
                    className="w-3.5 h-3.5 accent-amber-600"
                  />
                  โชว์สินค้าทั้งร้าน (ไม่เฉพาะของในใบเบิก)
                </label>
              )}
            </div>
          </div>
        )}

        {/* Search + Filter */}
        <div className="p-4 bg-white border-b border-gray-200 space-y-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearchEnter() } }}
              placeholder="ค้นหาชื่อ / รหัสสินค้า / บาร์โค้ด หรือสแกน..."
              className={`w-full pl-9 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${canScan ? 'pr-12' : 'pr-4'}`}
            />
            {canScan && (
              <button
                onClick={() => setShowScanner(true)}
                aria-label="สแกนบาร์โค้ดด้วยกล้อง"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-lg text-blue-600 hover:bg-blue-50 active:bg-blue-100"
              >
                <ScanBarcode size={20} />
              </button>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            <button
              onClick={() => setCategoryFilter('')}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                !categoryFilter ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              ทั้งหมด
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat === categoryFilter ? '' : cat)}
                className={`shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                  cat === categoryFilter ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {ordered.slice(0, GRID_LIMIT).map((product) => {
              const stock = getProductStock(product)
              const inCart = cart.find((c) => c.product.id === product.id)
              return (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className={`bg-white rounded-xl p-3 text-left border-2 transition-all hover:shadow-md active:scale-95 ${
                    inCart ? 'border-blue-500' : 'border-transparent'
                  }`}
                >
                  <div className="w-full aspect-square bg-gray-100 rounded-lg mb-2 flex items-center justify-center text-3xl overflow-hidden">
                    {product.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.image_url}
                        alt={product.name}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      '🐾'
                    )}
                  </div>
                  <p className="text-xs font-medium text-gray-900 line-clamp-2 leading-tight">
                    {product.name}
                  </p>
                  {product.sku && (
                    <p className="text-[11px] font-mono text-gray-400 mb-1 truncate">{product.sku}</p>
                  )}
                  {/* ของที่ยกไปออกบูธยังนับอยู่ในสต็อกนี้ — เตือนคนที่ร้านว่าของอาจไม่ได้อยู่บนชั้น */}
                  {!boothMode && booth && booth.takenByProduct[product.id] > 0 && (
                    <p className="text-[11px] font-medium text-amber-700 mb-0.5">
                      เบิกไปบูธ {booth.takenByProduct[product.id]} {product.unit}
                    </p>
                  )}
                  <p className="text-sm font-bold text-blue-600">
                    ฿{product.price.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </p>
                  <p className={`text-xs mt-0.5 ${!product.is_service && stock <= 0 ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                    {product.is_service ? 'บริการ' : stock <= 0 ? `สต็อคหมด (${stock})` : `คงเหลือ ${stock}`}
                  </p>
                </button>
              )
            })}
            {filtered.length === 0 && (
              <div className="col-span-full text-center py-12 text-gray-400 text-sm">
                ไม่พบสินค้า
              </div>
            )}
          </div>
        </div>

        {/* แถบสรุป + เปิดตะกร้า (เฉพาะมือถือ) */}
        <div className="lg:hidden shrink-0 border-t border-gray-200 bg-white px-3 py-2 flex items-center gap-3">
          <div className="min-w-0">
            <p className="text-xs text-gray-500">{cartCount} ชิ้น</p>
            <p className="font-bold text-gray-900 leading-tight">฿{total.toFixed(2)}</p>
          </div>
          <button
            onClick={() => setCartOpen(true)}
            className="ml-auto flex items-center gap-1.5 bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl"
          >
            <ShoppingCart size={16} />
            ดูตะกร้า
          </button>
        </div>
      </div>

      {/* Right: Cart — มือถือเปิดทับเต็มจอ */}
      <div
        className={`${cartOpen ? 'flex' : 'hidden'} lg:flex fixed lg:static inset-x-0 bottom-0 top-14 z-40 w-full lg:w-96 xl:w-[26rem] lg:z-auto bg-white border-l border-gray-200 flex-col`}
      >
        {/* หัวแผงตะกร้า (เฉพาะมือถือ) */}
        <div className="lg:hidden flex items-center justify-between px-3 py-2 border-b border-gray-100">
          <span className="font-semibold text-gray-900">ตะกร้า ({cartCount} ชิ้น)</span>
          <button onClick={() => setCartOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        {/* คิวเก็บเงินจากคลินิก */}
        {queue.length > 0 && activeVisits.length === 0 && !boothMode && (
          <div className="px-3 pt-3">
            <button
              onClick={() => setShowQueue(true)}
              className="w-full flex items-center justify-center gap-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-sm font-medium py-2 rounded-lg transition-colors"
            >
              <Stethoscope size={15} />
              รอเก็บเงินจากคลินิก ({queue.length})
            </button>
          </div>
        )}
        {activeVisits.length > 0 && (
          <div className="px-3 pt-3 space-y-2">
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-0.5">
                  {activeVisits.map((v) => (
                    <div key={v.id} className="min-w-0">
                      <p className="text-xs font-medium text-amber-800 truncate">
                        คลินิก: {v.pet_name || 'ไม่ระบุสัตว์'}
                      </p>
                      <p className="text-[11px] text-amber-600 font-mono">{v.visit_number}</p>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => { setActiveVisits([]); setCart([]); setDiscountRow(null) }}
                  title="ยกเลิกการเก็บเงินรายการนี้"
                  className="text-amber-500 hover:text-amber-700 shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            {/* เจ้าของคนเดียวกันมีใบอื่นค้างอยู่ — รวมเข้าบิลนี้ได้เลย ไม่ต้องเก็บเงินสองรอบ */}
            {sameOwnerQueue.length > 0 && (
              <button
                onClick={() => setShowQueue(true)}
                className="w-full flex items-center justify-center gap-2 bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-900 text-sm font-medium py-2 rounded-lg transition-colors"
              >
                <Stethoscope size={15} />
                เจ้าของคนนี้มีอีก {sameOwnerQueue.length} ใบ — รวมบิล
              </button>
            )}
          </div>
        )}
        {/* จอสอง */}
        <div className="px-3 pt-3">
          <button
            onClick={() => window.open('/pos-display', 'landbark-customer-display', 'width=1000,height=750')}
            className="w-full flex items-center justify-center gap-2 border border-gray-200 hover:bg-gray-50 text-gray-600 text-xs font-medium py-1.5 rounded-lg transition-colors"
          >
            <MonitorPlay size={14} />
            โชว์จอสอง (ให้ลูกค้าดู)
          </button>
        </div>
        {/* Customer */}
        <div className="p-3 border-b border-gray-100">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchCustomer()}
                placeholder="เบอร์โทรลูกค้า"
                className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={searchCustomer}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium text-gray-700 transition-colors"
            >
              ค้นหา
            </button>
          </div>
          {customer && (
            <div className="mt-2 flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {customer.name}
                  {customer.hn && <span className="ml-2 text-xs font-mono text-gray-500">HN {customer.hn}</span>}
                </p>
                {pointsConfig && <p className="text-xs text-blue-600">{customer.points} แต้ม</p>}
              </div>
              <button
                onClick={() => { setCustomer(null); setCustomerPhone(''); setShowAddCustomer(false) }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            </div>
          )}
          {!customer && showAddCustomer && (
            <div className="mt-2 bg-orange-50 rounded-lg p-2.5 space-y-2">
              <p className="text-xs text-orange-700">ไม่พบลูกค้าเบอร์ {customerPhone} — เพิ่มลูกค้าใหม่?</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCustomer()}
                  placeholder="ชื่อลูกค้า"
                  className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <button
                  onClick={addCustomer}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium"
                >
                  บันทึก
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-300">
              <ShoppingCart size={40} />
              <p className="text-sm mt-2">ยังไม่มีสินค้า</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {cart.map((item, i) => (
                <div key={item.product.id} className="px-3 py-2.5">
                  <div className="flex justify-between items-start gap-2">
                    <p className="text-base font-medium text-gray-900 flex-1 leading-snug">
                      {item.product.name}
                    </p>
                    <button
                      onClick={() => changeQty(i, -item.quantity)}
                      className="text-gray-300 hover:text-red-500 shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => changeQty(i, -1)}
                        className="w-6 h-6 flex items-center justify-center border border-gray-200 rounded text-gray-600 hover:bg-gray-100"
                      >
                        <Minus size={12} />
                      </button>
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => setQty(i, e.target.value)}
                        className="w-14 text-center text-base font-semibold border border-gray-200 rounded py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button
                        onClick={() => changeQty(i, 1)}
                        className="w-6 h-6 flex items-center justify-center border border-gray-200 rounded text-gray-600 hover:bg-gray-100"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    <div className="text-right">
                      {item.discount > 0 && (
                        <p className="text-xs text-green-600">-฿{item.discount.toFixed(2)}</p>
                      )}
                      <p className="text-lg font-bold text-gray-900 tabular-nums">
                        ฿{item.subtotal.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {item.product.is_service && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="text-xs text-gray-500 shrink-0">ราคา</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.unit_price}
                        onChange={(e) => setUnitPrice(i, e.target.value)}
                        onFocus={(e) => e.target.select()}
                        className="w-24 text-sm font-medium border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      <span className="text-xs text-gray-400">บาท/{item.product.unit}</span>
                    </div>
                  )}

                  {discountRow === item.product.id ? (
                    <div className="mt-2 flex items-center gap-1.5">
                      <div className="flex bg-gray-100 rounded-lg p-0.5 shrink-0">
                        {(['amount', 'percent'] as const).map((m) => (
                          <button
                            key={m}
                            onClick={() => { setDiscountMode(m); setLineDiscount(i, discountInput, m) }}
                            className={`px-2 py-1 rounded-md text-xs font-medium ${
                              discountMode === m ? 'bg-orange-500 text-white' : 'text-gray-500'
                            }`}
                          >
                            {m === 'amount' ? '฿' : '%'}
                          </button>
                        ))}
                      </div>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        autoFocus
                        value={discountInput}
                        onChange={(e) => { setDiscountInput(e.target.value); setLineDiscount(i, e.target.value, discountMode) }}
                        placeholder="ลดเท่าไหร่"
                        className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                      />
                      <button
                        onClick={() => setDiscountRow(null)}
                        className="shrink-0 text-xs font-medium text-gray-500 hover:text-gray-700 px-2 py-1"
                      >
                        เสร็จ
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setDiscountRow(item.product.id)
                        setDiscountMode(item.discount_mode)
                        setDiscountInput(item.discount_value > 0 ? String(item.discount_value) : '')
                      }}
                      className="mt-1 text-xs text-gray-400 hover:text-orange-600"
                    >
                      {item.manual_discount > 0
                        ? item.discount_mode === 'percent'
                          ? `ลดเอง ${item.discount_value}% (฿${item.manual_discount.toFixed(2)}) — แก้`
                          : `ลดเอง ฿${item.manual_discount.toFixed(2)} — แก้`
                        : '+ ลดราคารายการนี้'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Summary + Checkout */}
        <div className="border-t border-gray-100 p-3 space-y-2">
          {/* จำนวนสินค้า — เดิมมีให้ดูแค่บนมือถือ จอใหญ่ที่หน้าร้านใช้จริงไม่มีให้นับทานกับของตรงหน้า */}
          <div className="flex justify-between text-sm text-gray-500">
            <span>จำนวนสินค้า</span>
            <span className="font-medium text-gray-700">
              {cart.length} รายการ · {cartCount} ชิ้น
            </span>
          </div>
          <div className="flex justify-between text-sm text-gray-500">
            <span>ราคาก่อนลด</span>
            <span>฿{subtotal.toFixed(2)}</span>
          </div>
          {totalDiscount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>ส่วนลดรวม</span>
              <span>-฿{totalDiscount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-lg text-gray-900">
            <span>รวม</span>
            <span>฿{total.toFixed(2)}</span>
          </div>

          <button
            disabled={cart.length === 0}
            onClick={() => { setCartOpen(false); setShowPayment(true) }}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-base transition-colors"
          >
            ชำระเงิน
          </button>

          {cart.length > 0 && (
            <button
              onClick={() => { setCart([]); setDiscountRow(null) }}
              className="w-full text-sm text-gray-400 hover:text-red-500 py-1 transition-colors"
            >
              ล้างตะกร้า
            </button>
          )}
        </div>
      </div>

      {/* Payment Modal */}
      {showPayment && (
        <PaymentModal
          cart={cart}
          subtotal={subtotal}
          totalDiscount={totalDiscount}
          total={total}
          customer={customer}
          pointsConfig={pointsConfig}
          cashierId={cashierId}
          promptpayId={promptpayId}
          roundingMode={roundingMode}
          visitIds={activeVisitIds}
          boothTripId={boothMode && booth ? booth.id : null}
          onClose={() => setShowPayment(false)}
          onSuccess={(info) => {
            // ตัดสต็อกออกก็ปิดใบเหมือนกัน — ของออกจากสต็อกไปแล้ว ไม่ต้องค้างในคิวให้เก็บเงินอีก
            if (activeVisitIds.length > 0) setPaidVisitIds((ids) => [...ids, ...activeVisitIds])
            setCart([])
            setDiscountRow(null)
            setCustomer(null)
            setCustomerPhone('')
            setShowAddCustomer(false)
            setShowPayment(false)
            setActiveVisits([])
            toast.success(info?.writeoff ? 'ตัดสต็อกออกแล้ว' : 'บันทึกการขายแล้ว')
            // คิวคลินิกอยู่ฝั่ง server — ต้อง refresh ไม่งั้นรายการที่เพิ่งเก็บเงินยังค้างอยู่
            router.refresh()
          }}
        />
      )}

      {/* คิวเก็บเงินจากคลินิก */}
      {showQueue && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowQueue(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Stethoscope size={18} className="text-gray-400" /> รอเก็บเงินจากคลินิก
              </h2>
              <button onClick={() => setShowQueue(false)} className="p-1.5 text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
              {queue.map((v) => {
                const visitTotal = v.items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0)
                const otherOwner = activeVisits.length > 0
                  && (v.customer?.id ?? null) !== (activeVisits[0].customer?.id ?? null)
                return (
                  <button
                    key={v.id}
                    onClick={() => loadVisit(v)}
                    disabled={otherOwner}
                    title={otherOwner ? 'คนละเจ้าของกับบิลที่กำลังเก็บเงินอยู่' : undefined}
                    className="w-full text-left px-2 py-3 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {v.pet_name || 'ไม่ระบุสัตว์'}
                          <span className="ml-2 text-xs text-gray-400">{v.customer?.name ?? 'ไม่มีเจ้าของในระบบ'}</span>
                        </p>
                        <p className="text-xs text-gray-400 font-mono">{v.visit_number} · {v.items.length} รายการ</p>
                      </div>
                      <p className="text-sm font-semibold text-gray-900 shrink-0">
                        ฿{visitTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </button>
                )
              })}
              {queue.length === 0 && (
                <p className="py-8 text-center text-sm text-gray-400">ไม่มีรายการรอเก็บเงิน</p>
              )}
            </div>
          </div>
        </div>
      )}

      {showScanner && (
        <BarcodeScanner onDetect={handleScannedCode} onClose={() => setShowScanner(false)} />
      )}
    </div>
  )
}
