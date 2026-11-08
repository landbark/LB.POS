// ย่อ + บีบอัดรูปฝั่งเบราว์เซอร์ก่อนอัปโหลด
//
// รูปจากมือถือใบละ 3–8MB เน็ตร้านอัปโหลดช้าและกินพื้นที่ storage
// ย่อให้ด้านยาวสุดไม่เกิน MAX_DIM แล้วบีบเป็น WebP เหลือหลักร้อย KB
// (ImageInput ของรูปสินค้า/ข่าวมี crop ด้วย จึงมีตัวย่อของตัวเองแยกไว้)

/** ด้านยาวสุดหลังย่อ — 1600px พอให้ซูมดูแผล/ผลแล็บได้ชัด */
const MAX_DIM = 1600
const QUALITY = 0.82

export interface CompressedImage {
  blob: Blob
  width: number
  height: number
}

/** โหลดรูปผ่าน <img> — หมุนตาม EXIF ให้เองอยู่แล้วทุกเบราว์เซอร์ที่ใช้งานจริง */
function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('decode failed'))
    }
    img.src = url
  })
}

/** โหลดรูปพร้อมหมุนตาม EXIF (รูปจากกล้องมือถือมักตะแคงถ้าไม่หมุนให้) */
async function loadSource(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Safari เก่าไม่รับ option นี้ — ตกไปใช้ <img> แทน
    }
  }
  return loadImageElement(file)
}

export async function compressImage(file: File): Promise<CompressedImage> {
  const source = await loadSource(file)
  const srcW = 'naturalWidth' in source ? source.naturalWidth : source.width
  const srcH = 'naturalHeight' in source ? source.naturalHeight : source.height

  const scale = Math.min(1, MAX_DIM / Math.max(srcW, srcH))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(srcW * scale))
  canvas.height = Math.max(1, Math.round(srcH * scale))
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  if (source instanceof ImageBitmap) source.close()

  const toBlob = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY))

  let blob = await toBlob('image/webp')
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg')
  if (!blob) throw new Error('encode failed')

  return { blob, width: canvas.width, height: canvas.height }
}
