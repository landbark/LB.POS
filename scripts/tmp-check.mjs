import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
for (const l of readFileSync('.env.local','utf8').split('\n')) { const m=l.match(/^([A-Z0-9_]+)=(.*)$/); if(m) process.env[m[1]]=m[2].trim() }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}})
const { data: open } = await sb.from('shifts').select('id,opened_at,opening_cash,notes').is('closed_at', null)
console.log('กะที่เปิดค้างอยู่:', JSON.stringify(open, null, 1))
const { data: tx } = await sb.from('transactions').select('id,transaction_number').like('transaction_number','ZZ%')
console.log('บิลทดสอบค้าง:', JSON.stringify(tx))
