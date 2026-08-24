import { createClient } from '@/lib/supabase/server'
import type { Announcement } from '@/lib/types'
import AnnouncementsClient from './AnnouncementsClient'

export default async function AnnouncementsPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('announcements')
    .select('*')
    .order('pinned', { ascending: false })
    .order('published_at', { ascending: false })

  return <AnnouncementsClient initialItems={(data ?? []) as Announcement[]} />
}
