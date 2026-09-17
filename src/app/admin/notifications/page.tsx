import { createClient } from '@/lib/supabase/server'
import NotificationsClient from './NotificationsClient'

export default async function NotificationsPage() {
  const supabase = await createClient()

  const [{ data: settings }, { data: recipients }, { count: linkedCustomers }] = await Promise.all([
    supabase.from('notify_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('telegram_recipients').select('*').order('created_at'),
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .not('telegram_chat_id', 'is', null),
  ])

  return (
    <NotificationsClient
      initialSettings={settings ?? { id: 1, enabled: true, expiry_days: 30 }}
      initialRecipients={recipients ?? []}
      botUsername={process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? ''}
      linkedCustomers={linkedCustomers ?? 0}
    />
  )
}
