import { createClient } from '@/lib/supabase/server'
import NotificationsClient from './NotificationsClient'

export default async function NotificationsPage() {
  const supabase = await createClient()

  const [{ data: settings }, { data: recipients }] = await Promise.all([
    supabase.from('line_notify_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('line_notify_recipients').select('*').order('created_at'),
  ])

  return (
    <NotificationsClient
      initialSettings={settings ?? { id: 1, enabled: true, expiry_days: 30 }}
      initialRecipients={recipients ?? []}
    />
  )
}
