'use client'

import { useSyncExternalStore } from 'react'

// ตะกร้าเก็บใน localStorage ของเบราว์เซอร์ (ยังไม่ล็อกอินก็หยิบของได้)
// ราคา/น้ำหนักในนี้ใช้แค่แสดงผล — ตอนสั่งจริง server คิดใหม่จากฐานข้อมูลเสมอ

export interface CartLine {
  productId: string
  name: string
  price: number
  unit: string
  imageUrl: string | null
  weightGrams: number
  quantity: number
}

const KEY = 'lb_shop_cart'
const EMPTY: CartLine[] = []

let cachedRaw = ''
let cached: CartLine[] = EMPTY

function readCart(): CartLine[] {
  if (typeof window === 'undefined') return EMPTY
  const raw = window.localStorage.getItem(KEY) ?? '[]'
  // อ่านทุกครั้งที่ re-render — cache ไว้เพื่อให้ useSyncExternalStore ได้ reference เดิมถ้าไม่มีอะไรเปลี่ยน
  if (raw !== cachedRaw) {
    cachedRaw = raw
    try {
      const parsed = JSON.parse(raw)
      cached = Array.isArray(parsed) ? parsed : EMPTY
    } catch {
      cached = EMPTY
    }
  }
  return cached
}

const listeners = new Set<() => void>()

function subscribe(callback: () => void) {
  listeners.add(callback)
  window.addEventListener('storage', callback)
  return () => {
    listeners.delete(callback)
    window.removeEventListener('storage', callback)
  }
}

function write(items: CartLine[]) {
  window.localStorage.setItem(KEY, JSON.stringify(items))
  listeners.forEach((l) => l())
}

export function useCart() {
  const items = useSyncExternalStore(subscribe, readCart, () => EMPTY)

  return {
    items,
    count: items.reduce((sum, i) => sum + i.quantity, 0),
    subtotal: items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    weightGrams: items.reduce((sum, i) => sum + i.weightGrams * i.quantity, 0),
    add(line: Omit<CartLine, 'quantity'>, quantity = 1) {
      const current = readCart()
      const existing = current.find((i) => i.productId === line.productId)
      write(
        existing
          ? current.map((i) =>
              i.productId === line.productId ? { ...i, ...line, quantity: i.quantity + quantity } : i
            )
          : [...current, { ...line, quantity }]
      )
    },
    setQuantity(productId: string, quantity: number) {
      const current = readCart()
      write(
        quantity <= 0
          ? current.filter((i) => i.productId !== productId)
          : current.map((i) => (i.productId === productId ? { ...i, quantity } : i))
      )
    },
    remove(productId: string) {
      write(readCart().filter((i) => i.productId !== productId))
    },
    clear() {
      write([])
    },
  }
}
