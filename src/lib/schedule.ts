import { addDays, daysBetween, dayOf, taipei } from './dates'
import { ruleDay, type Holidays } from './calendar'
import type { Exam, Message, Read, Role, Snapshot, Slot } from './types'

export type DayTask = { id: string; title: string; slot: Slot }

export const REVIEW: DayTask = { id: 'exam-review', title: '段考複習 30 分鐘', slot: 'study' }

// 一天分成幾段，樂樂的頁面一段一段收合
export const PARTS: { id: 'am' | 'pm' | 'night'; name: string; slots: Slot[] }[] = [
  { id: 'am', name: '早上', slots: ['morning'] },
  { id: 'pm', name: '放學後', slots: ['home', 'extra', 'study'] },
  { id: 'night', name: '晚上', slots: ['meal', 'bath', 'night'] },
]
/** 週末和放假沒有「放學」，叫下午 */
export const partName = (id: string, name: string, day: string, hol: Holidays) => (id === 'pm' && ruleDay(day, hol) % 6 === 0 ? '下午' : name)
/** 現在該打開哪一段 */
export const currentPart = (hour: number) => (hour < 12 ? 'am' : hour < 18 ? 'pm' : 'night')

export const isExam = (e: Exam) => e.title.includes('段考')

/** 段考前 7 天內（不含當天）自動多一項複習 */
export function examSoon(day: string, exams: Exam[]) {
  return exams.some((e) => isExam(e) && daysBetween(day, e.day) >= 1 && daysBetween(day, e.day) <= 7)
}

export function tasksFor(day: string, s: Snapshot, hol: Holidays): DayTask[] {
  const w = ruleDay(day, hol)
  const asks = s.asks
    .filter((a) => a.day === day && !a.removed_at)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
    .map((a) => ({ id: `ask:${a.id}`, title: a.title, slot: 'ask' as const }))
  const fixed = s.tasks
    .filter((t) => t.active && t.days.includes(w))
    .sort((a, b) => a.sort - b.sort)
    .map((t) => ({ id: t.id, title: t.title, slot: t.slot }))
  return [...asks, ...(examSoon(day, s.exams) ? [REVIEW] : []), ...fixed]
}

export function checksOn(day: string, s: Snapshot) {
  const m = new Map<string, string>()
  for (const c of s.checks) if (c.day === day) m.set(c.task_id, c.checked_at)
  return m
}

export function progress(day: string, s: Snapshot, hol: Holidays) {
  const ts = tasksFor(day, s, hol)
  const c = checksOn(day, s)
  return { done: ts.filter((t) => c.has(t.id)).length, total: ts.length }
}

/** 連續幾天全部做完（包含今天，今天沒做完就從昨天往回算） */
export function streak(today: string, s: Snapshot, hol: Holidays) {
  let n = 0
  for (let d = today, i = 0; i < 60; d = addDays(d, -1), i++) {
    const p = progress(d, s, hol)
    if (p.total && p.done === p.total) n++
    else if (d !== today) break
  }
  return n
}

/** 早上的事過了中午還沒做，算漏掉 */
export const missed = (partId: string, day: string, today: string, now = taipei()) => partId === 'am' && day === today && now.hour >= 12

/** 下一場考試，以及同一場的每一天 */
export function nextExam(day: string, exams: Exam[]) {
  const up = exams.filter((e) => e.day >= day).sort((a, b) => (a.day < b.day ? -1 : 1))
  if (!up.length) return null
  const first = up[0]
  return { first, days: up.filter((e) => e.title === first.title), inDays: daysBetween(day, first.day) }
}

export function unread(role: Role, messages: Message[], reads: Read[]) {
  const at = reads.find((r) => r.role === role)?.read_at ?? ''
  return messages.filter((m) => m.role !== role && m.created_at > at).sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
}

export function balance(s: Snapshot) {
  return s.bank.reduce((a, b) => (b.status !== 'ok' ? a : a + (b.kind === 'in' ? b.amount : -b.amount)), 0)
}

export function visitsOn(day: string, s: Snapshot) {
  return s.visits.filter((v) => dayOf(v.at) === day).sort((a, b) => (a.at < b.at ? -1 : 1))
}

/** 5 分鐘內重複打開算同一次 */
export function shouldLogVisit(s: Snapshot, now: Date) {
  const last = s.visits.reduce((a, v) => (v.at > a ? v.at : a), '')
  return !last || now.getTime() - Date.parse(last) >= 5 * 60_000
}
