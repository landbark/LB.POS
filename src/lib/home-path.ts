import { isVet } from './roles'

// หน้าแรกหลังเข้าระบบตาม role
// - admin / หมอ (vet, vet_plus): เข้า dashboard (ภาพรวม) เป็นหน้าแรก
// - แคชเชียร์ (และ role อื่น/ไม่ระบุ): เข้าหน้าขาย (POS)
export function homePath(role?: string | null): string {
  return role === 'admin' || isVet(role) ? '/admin/dashboard' : '/pos'
}
