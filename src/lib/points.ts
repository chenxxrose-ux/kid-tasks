import { addDays, dayOf, weekday } from './dates'
import type { Holidays } from './calendar'
import { progress } from './schedule'
import type { PtReq, PtReward, Snapshot } from './types'

// 點數：一週從星期一開始。每天的任務是本分不給點；
// 一週裡 5 天全做完 +10、加分清單 +5（每項一週一次）、自己寫的一週 2 次、媽媽們驚喜加分。

export const WEEK_GOAL = 5
export const WEEK_BONUS = 10
export const HELP_PTS = 5
export const OWN_PER_WEEK = 2

/** 那一週的星期一 */
export const monday = (day: string) => addDays(day, -((weekday(day) + 6) % 7))

export const ptBalance = (s: Snapshot) => s.ptLedger.reduce((a, l) => a + l.pts, 0)

export type Dot = { day: string; state: 'on' | 'miss' | 'todo' }

/** 這一週每天：全做完、漏了（已經過去還沒做完）、還沒到／今天還在做 */
export function weekDots(today: string, s: Snapshot, hol: Holidays) {
  const start = monday(today)
  const days: Dot[] = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(start, i)
    if (day > today) return { day, state: 'todo' }
    const p = progress(day, s, hol)
    const full = p.total > 0 && p.done === p.total
    return { day, state: full ? 'on' : day < today ? 'miss' : 'todo' }
  })
  const done = days.filter((d) => d.state === 'on').length
  const left = days.filter((d) => d.day >= today && d.state === 'todo').length
  const awarded = s.ptLedger.some((l) => l.kind === 'streak' && l.week === start)
  return { start, days, done, need: Math.max(0, WEEK_GOAL - done), possible: done + left >= WEEK_GOAL, awarded }
}

/** 這週和上週，做到 5 天但還沒記點數的週（樂樂的手機記上去） */
export function weeksToAward(today: string, s: Snapshot, hol: Holidays) {
  return [monday(today), addDays(monday(today), -7)].filter((start) => {
    if (s.ptLedger.some((l) => l.kind === 'streak' && l.week === start)) return false
    let n = 0
    for (let i = 0; i < 7; i++) {
      const day = addDays(start, i)
      if (day > today) break
      const p = progress(day, s, hol)
      if (p.total > 0 && p.done === p.total) n++
    }
    return n >= WEEK_GOAL
  })
}

const thisWeek = (q: PtReq, today: string) => monday(dayOf(q.created_at)) === monday(today)

/** 加分清單的這一項這週用過了嗎（取消、還不算的不算） */
export const itemUsed = (itemId: string, today: string, s: Snapshot) =>
  s.ptReqs.some((q) => q.item_id === itemId && thisWeek(q, today) && q.status !== 'cancelled' && q.status !== 'no')

/** 自己寫的這週還能寫幾次 */
export const ownLeft = (today: string, s: Snapshot) =>
  Math.max(0, OWN_PER_WEEK - s.ptReqs.filter((q) => q.kind === 'help' && q.own && thisWeek(q, today) && q.status !== 'cancelled').length)

export const activeRewards = (s: Snapshot) => s.ptRewards.filter((r) => r.active).sort((a, b) => a.pts - b.pts || a.sort - b.sort)

/** 獎勵照點數分組：20 點、50 點、100 點… */
export function rewardGroups(rs: PtReward[]) {
  const out: { pts: number; items: PtReward[] }[] = []
  for (const r of rs) {
    const g = out.find((x) => x.pts === r.pts)
    if (g) g.items.push(r)
    else out.push({ pts: r.pts, items: [r] })
  }
  return out
}

export const pendingReqs = (s: Snapshot) => s.ptReqs.filter((q) => q.status === 'pending')
/** 答應了還沒兌現 */
export const owed = (s: Snapshot) => s.ptReqs.filter((q) => q.kind === 'redeem' && q.status === 'ok' && !q.delivered_at)

export type News = { id: string; text: string; pts: number }

/** 樂樂上次按「好」之後，媽媽們回覆了什麼 */
export function kidNews(s: Snapshot): News[] {
  const since = s.ptState?.seen_at ?? ''
  const out: (News & { at: string })[] = []
  for (const l of s.ptLedger) {
    if (l.created_at <= since) continue
    const q = s.ptReqs.find((x) => x.id === l.id)
    const text =
      l.kind === 'help'
        ? `確認了：${l.why}`
        : l.kind === 'bonus'
          ? `驚喜加分：${l.why}`
          : l.kind === 'streak'
            ? '這週 5 天全做完'
            : `答應了：${q?.title ?? l.why.replace(/^換：/, '')}${q?.when_text ? `（${q.when_text}）` : ''}`
    out.push({ id: l.id, text, pts: l.pts, at: l.created_at })
  }
  for (const q of s.ptReqs) {
    if (!q.decided_at || q.decided_at <= since) continue
    if (q.status === 'duty') out.push({ id: q.id, text: `${q.title}：謝謝你，這是本分喔`, pts: 0, at: q.decided_at })
    else if (q.status === 'no')
      out.push({ id: q.id, text: q.kind === 'help' ? `${q.title}：還不算` : `想換 ${q.title}：再等等`, pts: 0, at: q.decided_at })
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : 1)).map(({ at: _at, ...n }) => n)
}

/** 點數紀錄，新的在前面 */
export function history(s: Snapshot) {
  const rows = s.ptLedger.map((l) => ({
    id: l.id,
    at: l.created_at,
    text: l.kind === 'bonus' ? `驚喜加分：${l.why}` : l.kind === 'streak' ? '一週 5 天全做完' : l.why,
    pts: l.pts,
    note: '',
  }))
  for (const q of s.ptReqs)
    if (q.kind === 'help' && q.status === 'duty' && q.decided_at) rows.push({ id: q.id, at: q.decided_at, text: q.title, pts: 0, note: '媽媽們說：謝謝你，這是本分喔' })
  for (const q of s.ptReqs)
    if (q.delivered_at) rows.push({ id: `${q.id}:done`, at: q.delivered_at, text: `兌現了：${q.title}`, pts: 0, note: '' })
  return rows.sort((a, b) => (a.at < b.at ? 1 : -1))
}
