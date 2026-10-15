import type { Op, PtEntry, PtReq, Snapshot } from './types'

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
    case 'ask-edit':
      return { ...s, asks: s.asks.map((a) => (a.id === op.id ? { ...a, title: op.title, ...(op.due !== undefined ? { due: op.due } : {}) } : a)) }
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
    case 'need':
      return (s.needs ?? []).some((n) => n.id === op.id)
        ? s
        : { ...s, needs: [...(s.needs ?? []), { id: op.id, title: op.title, due: op.due, created_at: op.at, done_at: null, removed_at: null }] }
    case 'need-done':
      return { ...s, needs: (s.needs ?? []).map((n) => (n.id === op.id ? { ...n, done_at: op.at } : n)) }
    case 'need-del':
      return { ...s, needs: (s.needs ?? []).map((n) => (n.id === op.id ? { ...n, removed_at: op.at } : n)) }
    case 'pt-req':
      return s.ptReqs.some((q) => q.id === op.id)
        ? s
        : {
            ...s,
            ptReqs: [
              ...s.ptReqs,
              {
                id: op.id,
                kind: op.kind,
                item_id: op.item_id,
                reward_id: op.reward_id,
                title: op.title,
                own: op.own,
                pts: op.pts,
                status: 'pending',
                gave: null,
                when_text: null,
                created_at: op.at,
                decided_at: null,
                delivered_at: null,
              },
            ],
          }
    case 'pt-cancel':
      return { ...s, ptReqs: s.ptReqs.map((q) => (q.id === op.id && q.status === 'pending' ? { ...q, status: 'cancelled', decided_at: op.at } : q)) }
    case 'pt-decide': {
      const q = s.ptReqs.find((x) => x.id === op.id)
      if (!q || q.status !== 'pending') return s
      const status: PtReq['status'] = op.duty ? 'duty' : op.give === null ? 'no' : 'ok'
      const next = { ...q, status, gave: q.kind === 'help' && status === 'ok' ? op.give : null, when_text: q.kind === 'redeem' && status === 'ok' ? op.when.trim() || null : null, decided_at: op.at }
      const entry: PtEntry[] =
        status !== 'ok' || s.ptLedger.some((l) => l.id === q.id)
          ? []
          : [{ id: q.id, kind: q.kind, pts: q.kind === 'help' ? op.give! : -q.pts, why: q.kind === 'help' ? q.title : `換：${q.title}`, week: null, created_at: op.at }]
      const goal = q.kind === 'redeem' && status === 'ok' && s.ptState?.goal === q.reward_id ? { ...s.ptState, goal: null } : s.ptState
      return { ...s, ptReqs: s.ptReqs.map((x) => (x.id === q.id ? next : x)), ptLedger: [...s.ptLedger, ...entry], ptState: goal }
    }
    case 'pt-deliver':
      return { ...s, ptReqs: s.ptReqs.map((q) => (q.id === op.id && !q.delivered_at ? { ...q, delivered_at: op.at } : q)) }
    case 'pt-bonus':
      return s.ptLedger.some((l) => l.id === op.id)
        ? s
        : { ...s, ptLedger: [...s.ptLedger, { id: op.id, kind: 'bonus', pts: op.pts, why: op.why, week: null, created_at: op.at }] }
    case 'pt-streak':
      return s.ptLedger.some((l) => l.id === op.id || (l.kind === 'streak' && l.week === op.week))
        ? s
        : { ...s, ptLedger: [...s.ptLedger, { id: op.id, kind: 'streak', pts: 10, why: '一週 5 天全做完', week: op.week, created_at: op.at }] }
    case 'pt-goal':
      return { ...s, ptState: { seen_at: s.ptState?.seen_at ?? '', goal: op.goal } }
    case 'pt-seen':
      return { ...s, ptState: { goal: s.ptState?.goal ?? null, seen_at: s.ptState && s.ptState.seen_at > op.at ? s.ptState.seen_at : op.at } }
    case 'pt-item': {
      const row = { id: op.id, title: op.title, active: op.active, sort: op.sort }
      return { ...s, ptItems: s.ptItems.some((i) => i.id === op.id) ? s.ptItems.map((i) => (i.id === op.id ? row : i)) : [...s.ptItems, row] }
    }
    case 'pt-reward':
      return { ...s, ptRewards: s.ptRewards.map((r) => (r.id === op.id ? { ...r, pts: op.pts } : r)) }
    case 'visit':
      return s.visits.some((v) => v.id === op.id) ? s : { ...s, visits: [...s.visits, { id: op.id, at: op.at }] }
  }
}

export const applyAll = (s: Snapshot, ops: Op[]) => ops.reduce(apply, s)
