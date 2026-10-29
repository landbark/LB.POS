'use client'

import { useCallback, useRef, useState } from 'react'

const FRAME_ID = 'receipt-print-frame'

// สั่งพิมพ์ใบเสร็จจาก iframe ที่ซ่อนไว้ แทนการเปิดแท็บใหม่
//
// ที่ต้องทำแบบนี้เพราะหน้าเคาน์เตอร์ต้องเร็ว แบบเดิมคือ กดพิมพ์ใบเสร็จ → เปิดแท็บใหม่ →
// รอหน้าโหลด (ดึงบิลจาก Supabase) → กดปุ่มพิมพ์ → เลือกเครื่องพิมพ์ → ปิดแท็บ
// แบบนี้โหลดใบเสร็จไว้เงียบ ๆ ตั้งแต่บันทึกบิลเสร็จ คือตอนที่แคชเชียร์กำลังทอนเงิน
// พอกดพิมพ์จึงสั่งได้ทันทีโดยไม่ต้องรอโหลดอะไรอีก
//
// ถ้าเปิด Chrome ด้วย --kiosk-printing ไว้ ทั้งหมดเหลือกดปุ่มเดียวแล้วกระดาษออกเลย
// ไม่มีไดอะล็อกคั่น และ driver ของเครื่องพิมพ์ยังเป็นตัวเดิม เอกสาร A4 ยังพิมพ์ได้ปกติ

// iframe ผูกกับ document ไม่ผูกกับ component เพราะปุ่ม "เสร็จสิ้นพร้อมพิมพ์ใบเสร็จ"
// ปิด modal ทิ้งทันทีหลังสั่งพิมพ์ — ถ้า iframe ถูกถอดไปพร้อม component งานพิมพ์จะหลุด
function getFrame(): HTMLIFrameElement {
  const existing = document.getElementById(FRAME_ID)
  if (existing) return existing as HTMLIFrameElement

  const frame = document.createElement('iframe')
  frame.id = FRAME_ID
  frame.setAttribute('aria-hidden', 'true')
  // ซ่อนด้วยการดันออกนอกจอ ไม่ใช้ display:none — Chrome ไม่พิมพ์ iframe ที่ไม่ได้ layout
  // กว้าง/สูงเผื่อไว้ให้ใบเสร็จ 80mm วางตัวได้ครบก่อนสั่งพิมพ์
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:420px;height:1200px;border:0'
  document.body.appendChild(frame)
  return frame
}

export function useReceiptPrint() {
  // บิลที่โหลดเสร็จแล้ว — เทียบกับบิลที่สั่งโหลดไว้ กันสั่งพิมพ์ใบเสร็จของบิลก่อนหน้า
  const [readyTxId, setReadyTxId] = useState<string | null>(null)
  const wantedTxId = useRef<string | null>(null)

  const preload = useCallback((txId: string) => {
    if (wantedTxId.current === txId) return
    wantedTxId.current = txId
    setReadyTxId(null)

    const frame = getFrame()
    // onload รอรูปในหน้าโหลดเสร็จด้วย (โลโก้ร้าน) — สั่งพิมพ์ก่อนรูปมาจะได้ใบเสร็จหัวว่าง
    frame.onload = () => setReadyTxId(txId)
    frame.src = `/print/receipt/${txId}?embed=1`
  }, [])

  const print = useCallback(() => {
    const txId = wantedTxId.current
    if (!txId) return

    const win = readyTxId === txId ? getFrame().contentWindow : null
    // โหลดไม่ทันหรือโหลดพลาด — เปิดแท็บใบเสร็จแบบเดิมให้กดพิมพ์เอง ดีกว่าไม่ได้ใบเสร็จ
    if (!win) {
      window.open(`/print/receipt/${txId}`, '_blank')
      return
    }

    win.focus()
    win.print()
  }, [readyTxId])

  return { preload, print, ready: readyTxId !== null }
}
