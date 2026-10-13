import { supabase } from './supabase'
import { addDays, taipeiToday } from '../../lib/dates'
import type { BankRow, Op, Role, Snapshot } from '../../lib/types'

const iso = (s: string | null) => (s ? new Date(s).toISOString() : s)

/** 從資料庫抓三支手機共用的資料（量很小，每次整份重抓） */
export async function fetchSnapshot(): Promise<Snapshot> {
  const since = addDays(taipeiToday(), -42)
  const r = await Promise.all([
    supabase.from('kt_tasks').select('id,title,slot,days,active,sort'),
    supabase.from('kt_asks').select('id,day,title,created_at,removed_at,source,due').gte('day', since),
    supabase.from('kt_checks').select('day,task_id,checked_at').gte('day', since),
    supabase.from('kt_messages').select('id,role,body,created_at').order('created_at', { ascending: false }).limit(300),
    supabase.from('kt_reads').select('role,read_at'),
    supabase.from('kt_bank').select('id,kind,amount,memo,status,created_at,decided_at').order('created_at'),
    supabase.from('kt_exams').select('id,day,title,subjects').gte('day', addDays(since, -365)),
    supabase.from('kt_visits').select('id,at').gte('at', `${since}T00:00:00+08:00`),
    supabase.from('kt_needs').select('id,title,due,created_at,done_at,removed_at').gte('created_at', `${since}T00:00:00+08:00`),
  ])
  for (const x of r) if (x.error) throw x.error
  const [tasks, asks, checks, messages, reads, bank, exams, visits, needs] = r.map((x) => x.data ?? []) as never[][]
  return {
    tasks,
    asks: (asks as Snapshot['asks']).map((a) => ({ ...a, created_at: iso(a.created_at)!, removed_at: iso(a.removed_at) })),
    checks: (checks as Snapshot['checks']).map((c) => ({ ...c, checked_at: iso(c.checked_at)! })),
    messages: (messages as Snapshot['messages']).map((m) => ({ ...m, created_at: iso(m.created_at)! })).reverse(),
    reads: (reads as Snapshot['reads']).map((x) => ({ ...x, read_at: iso(x.read_at)! })),
    bank: (bank as BankRow[]).map((b) => ({ ...b, amount: Number(b.amount), created_at: iso(b.created_at)!, decided_at: iso(b.decided_at) })),
    exams,
    visits: (visits as Snapshot['visits']).map((v) => ({ ...v, at: iso(v.at)! })),
    needs: (needs as Snapshot['needs']).map((n) => ({ ...n, created_at: iso(n.created_at)!, done_at: iso(n.done_at), removed_at: iso(n.removed_at) })),
  }
}

export async function fetchRole(userId: string): Promise<Role | null> {
  const { data, error } = await supabase.from('kt_members').select('role').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return (data?.role as Role | undefined) ?? null
}

type Err = { message: string; code?: string } | null

/** 送一個動作到資料庫。重送也安全（新增都帶固定 id，重複就略過）。 */
export async function send(op: Op): Promise<Err> {
  const q = (() => {
    switch (op.t) {
      case 'check':
        return supabase
          .from('kt_checks')
          .upsert({ day: op.day, task_id: op.task_id, checked_at: op.checked_at }, { onConflict: 'day,task_id', ignoreDuplicates: true })
      case 'uncheck':
        return supabase.from('kt_checks').delete().eq('day', op.day).eq('task_id', op.task_id)
      case 'ask':
        return supabase.from('kt_asks').upsert({ id: op.id, day: op.day, title: op.title, source: op.source ?? 'mom', due: op.due ?? null }, { onConflict: 'id', ignoreDuplicates: true })
      case 'unask':
        return supabase.from('kt_asks').update({ removed_at: op.at }).eq('id', op.id)
      case 'ask-edit':
        return supabase
          .from('kt_asks')
          .update(op.due !== undefined ? { title: op.title, due: op.due } : { title: op.title })
          .eq('id', op.id)
      case 'msg':
        return supabase.from('kt_messages').upsert({ id: op.id, body: op.body }, { onConflict: 'id', ignoreDuplicates: true })
      case 'read':
        return supabase.rpc('kt_mark_read', { p_at: op.at })
      case 'bank':
        return supabase
          .from('kt_bank')
          .upsert({ id: op.id, kind: op.kind, amount: op.amount, memo: op.memo }, { onConflict: 'id', ignoreDuplicates: true })
      case 'decide':
        return supabase.rpc('kt_decide', { p_id: op.id, p_approve: op.approve })
      case 'cancel':
        return supabase.rpc('kt_cancel', { p_id: op.id })
      case 'exam':
        return op.isNew
          ? supabase.from('kt_exams').upsert({ id: op.id, day: op.day, title: op.title, subjects: op.subjects }, { onConflict: 'id', ignoreDuplicates: true })
          : supabase.from('kt_exams').update({ day: op.day, title: op.title, subjects: op.subjects }).eq('id', op.id)
      case 'exam-del':
        return supabase.from('kt_exams').delete().eq('id', op.id)
      case 'task': {
        const { id, title, slot, days, active, sort } = op.task
        return op.isNew
          ? supabase.from('kt_tasks').upsert({ id, title, slot, days, active, sort }, { onConflict: 'id', ignoreDuplicates: true })
          : supabase.from('kt_tasks').update({ title, slot, days, active, sort, updated_at: new Date().toISOString() }).eq('id', id)
      }
      case 'need':
        return supabase.from('kt_needs').upsert({ id: op.id, title: op.title, due: op.due }, { onConflict: 'id', ignoreDuplicates: true })
      case 'need-done':
        return supabase.from('kt_needs').update({ done_at: op.at }).eq('id', op.id)
      case 'need-del':
        return supabase.from('kt_needs').update({ removed_at: op.at }).eq('id', op.id)
      case 'visit':
        return supabase.from('kt_visits').upsert({ id: op.id, at: op.at }, { onConflict: 'id', ignoreDuplicates: true })
    }
  })()
  const { error } = await q
  return error ? { message: error.message, code: error.code } : null
}

/** 網路問題（之後再送）還是資料庫拒絕（不會成功，要告訴使用者） */
export function isNetworkError(e: { message: string; code?: string }) {
  return !e.code || /fetch|network|load failed|timeout/i.test(e.message)
}

export function reason(e: { message: string; code?: string }) {
  if (e.code === 'P0001' || (e.code === '42501' && /[\u4e00-\u9fff]/.test(e.message))) return e.message
  if (e.code === '42501') return '沒有權限'
  if (e.code === '23514' || e.code === '22001') return '內容不符合規則'
  if (e.code === 'PGRST301' || e.code === 'PGRST303') return '登入過期，請重新登入'
  return e.message
}
