import type { Op, Snapshot } from './types'

// 把還沒送出的動作疊在伺服器資料上，畫面立刻反映（離線也一樣）
export function apply(s: Snapshot, op: Op): Snapshot {
  switch (op.t) {
    case 'check':
      return s.checks.some((c) => c.day === op.day && c.task_id === op.task_id)
        ? s
        : { ...s, checks: [...s.checks, { day: op.day, task_id: op.task_id, checked_at: op.checked_at }] }
    case 'uncheck':
      return { ...s, checks: s.checks.filter((c) => !(c.day === op.day && c.task_id === op.task_id)) }
    case 'ask':
      return s.asks.some((a) => a.id === op.id)
        ? s
        : { ...s, asks: [...s.asks, { id: op.id, day: op.day, title: op.title, created_at: op.at, removed_at: null, source: op.source ?? 'mom', due: op.due ?? null }] }
    case 'unask':
      return { ...s, asks: s.asks.map((a) => (a.id === op.id ? { ...a, removed_at: op.at } : a)) }
    case 'msg':
      return s.messages.some((m) => m.id === op.id)
        ? s
        : { ...s, messages: [...s.messages, { id: op.id, role: op.role, body: op.body, created_at: op.at }] }
    case 'read': {
      const cur = s.reads.find((r) => r.role === op.role)
      if (cur && cur.read_at >= op.at) return s
      return { ...s, reads: [...s.reads.filter((r) => r.role !== op.role), { role: op.role, read_at: op.at }] }
    }
    case 'bank':
      return s.bank.some((b) => b.id === op.id)
        ? s
        : {
            ...s,
            bank: [
              ...s.bank,
              { id: op.id, kind: op.kind, amount: op.amount, memo: op.memo, status: op.kind === 'in' ? 'ok' : 'pending', created_at: op.at, decided_at: null },
            ],
          }
    case 'decide':
      return {
        ...s,
        bank: s.bank.map((b) => (b.id === op.id && b.status === 'pending' ? { ...b, status: op.approve ? 'ok' : 'denied', decided_at: op.at } : b)),
      }
    case 'cancel':
      return { ...s, bank: s.bank.map((b) => (b.id === op.id && b.status === 'pending' ? { ...b, status: 'cancelled', decided_at: op.at } : b)) }
    case 'exam': {
      const row = { id: op.id, day: op.day, title: op.title, subjects: op.subjects }
      return { ...s, exams: s.exams.some((e) => e.id === op.id) ? s.exams.map((e) => (e.id === op.id ? row : e)) : [...s.exams, row] }
    }
    case 'exam-del':
      return { ...s, exams: s.exams.filter((e) => e.id !== op.id) }
    case 'task':
      return { ...s, tasks: s.tasks.some((t) => t.id === op.task.id) ? s.tasks.map((t) => (t.id === op.task.id ? op.task : t)) : [...s.tasks, op.task] }
    case 'visit':
      return s.visits.some((v) => v.id === op.id) ? s : { ...s, visits: [...s.visits, { id: op.id, at: op.at }] }
  }
}

export const applyAll = (s: Snapshot, ops: Op[]) => ops.reduce(apply, s)
