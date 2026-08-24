import { redirect } from 'next/navigation'
import { LINE_PENDING_COOKIE, getCustomerId, readSignedValue } from '@/lib/customer-session'
import { cookies } from 'next/headers'
import LinkClient from './LinkClient'

export const dynamic = 'force-dynamic'

// หลังล็อกอิน LINE สำเร็จแต่ยังไม่มีสมาชิกผูกอยู่ — ให้กรอกเบอร์เพื่อผูกกับสมาชิกเดิมหรือสมัครใหม่
export default async function LinkAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams

  if (await getCustomerId()) redirect(next?.startsWith('/') ? next : '/account')

  const pending = await readSignedValue((await cookies()).get(LINE_PENDING_COOKIE)?.value)
  if (!pending) redirect('/account?error=line-state')

  const [, displayName] = pending.split('|')

  return <LinkClient displayName={displayName ?? ''} next={next?.startsWith('/') ? next : '/account'} />
}
