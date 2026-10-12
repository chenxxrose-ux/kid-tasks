export type Role = 'kid' | 'mom'
export type Slot = 'morning' | 'home' | 'extra' | 'study' | 'meal' | 'bath' | 'night' | 'ask'

export type Task = { id: string; title: string; slot: Exclude<Slot, 'ask'>; days: number[]; active: boolean; sort: number }
export type Ask = { id: string; day: string; title: string; created_at: string; removed_at: string | null }
export type Check = { day: string; task_id: string; checked_at: string }
export type Message = { id: string; role: Role; body: string; created_at: string }
export type Read = { role: Role; read_at: string }
export type BankRow = {
  id: string
  kind: 'in' | 'out'
  amount: number
  memo: string
  status: 'pending' | 'ok' | 'denied' | 'cancelled'
  created_at: string
  decided_at: string | null
}
export type Exam = { id: string; day: string; title: string; subjects: string }
export type Visit = { id: string; at: string }

export type Snapshot = {
  tasks: Task[]
  asks: Ask[]
  checks: Check[]
  messages: Message[]
  reads: Read[]
  bank: BankRow[]
  exams: Exam[]
  visits: Visit[]
}

export const emptySnapshot = (): Snapshot => ({ tasks: [], asks: [], checks: [], messages: [], reads: [], bank: [], exams: [], visits: [] })

/** 一個還沒送到資料庫的動作（離線時排隊，連上網路依序送出） */
export type Op =
  | { t: 'check'; day: string; task_id: string; checked_at: string }
  | { t: 'uncheck'; day: string; task_id: string }
  | { t: 'ask'; id: string; day: string; title: string; at: string }
  | { t: 'unask'; id: string; at: string }
  | { t: 'msg'; id: string; role: Role; body: string; at: string }
  | { t: 'read'; role: Role; at: string }
  | { t: 'bank'; id: string; kind: 'in' | 'out'; amount: number; memo: string; at: string }
  | { t: 'decide'; id: string; approve: boolean; at: string }
  | { t: 'cancel'; id: string; at: string }
  | { t: 'exam'; id: string; day: string; title: string; subjects: string; isNew: boolean }
  | { t: 'exam-del'; id: string }
  | { t: 'task'; task: Task; isNew: boolean }
  | { t: 'visit'; id: string; at: string }

export type Queued = Op & { qid: string }
