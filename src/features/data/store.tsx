import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { fetchRole, fetchSnapshot, isNetworkError, reason, send } from './remote'
import { applyAll } from '../../lib/apply'
import { BUNDLED_HOLIDAYS, parseHolidayJson, type Holidays } from '../../lib/calendar'
import { taipeiToday } from '../../lib/dates'
import { emptySnapshot, type Op, type Queued, type Role, type Snapshot } from '../../lib/types'

// 手機裡存三樣東西：上次抓到的資料、還沒送出的動作、下載的國定假日。
// 離線時畫面照樣能看、能打勾，動作排隊；一連上網路就依序送出，再重抓一次。
const CACHE = 'kid-tasks-cache-v1'
const QUEUE = 'kid-tasks-queue-v1'
const HOLS = 'kid-tasks-holidays-v1'

type Cache = { userId: string; role: Role; snap: Snapshot; syncedAt: string }

function load<T>(k: string): T | null {
  try {
    const v = localStorage.getItem(k)
    return v ? (JSON.parse(v) as T) : null
  } catch {
    return null
  }
}
function save(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* 私密瀏覽或空間滿：只是少了離線備份，不影響使用 */
  }
}

export type Problem = { id: string; text: string }

type Store = {
  phase: 'loading' | 'login' | 'not-member' | 'ready'
  role: Role | null
  data: Snapshot
  holidays: Holidays
  online: boolean
  pending: number
  syncedAt: string | null
  loadError: string | null
  problems: Problem[]
  dismissProblem: (id: string) => void
  run: (op: Op) => void
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<Store | null>(null)
export const useStore = () => {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside provider')
  return s
}

export const newId = () => crypto.randomUUID()

const describe = (op: Op) =>
  ({
    check: '打勾',
    uncheck: '取消打勾',
    ask: '交代的事',
    unask: '拿掉交代的事',
    'ask-edit': '修改交代的事',
    msg: '留言',
    read: '已讀',
    bank: '存錢筒紀錄',
    decide: '確認領錢',
    cancel: '取消申請',
    exam: '考試',
    'exam-del': '刪除考試',
    task: '任務',
    visit: '打開紀錄',
    need: '我需要',
    'need-done': '準備好了',
    'need-del': '拿掉我需要的',
  })[op.t]

export function StoreProvider({ children }: { children: ReactNode }) {
  const cached = useRef(load<Cache>(CACHE))
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [role, setRole] = useState<Role | null>(cached.current?.role ?? null)
  const [server, setServer] = useState<Snapshot>(cached.current?.snap ?? emptySnapshot())
  const [syncedAt, setSyncedAt] = useState<string | null>(cached.current?.syncedAt ?? null)
  const [queue, setQueue] = useState<Queued[]>(() => load<Queued[]>(QUEUE) ?? [])
  const [online, setOnline] = useState(() => navigator.onLine)
  const [notMember, setNotMember] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [problems, setProblems] = useState<Problem[]>([])
  const [holidays, setHolidays] = useState<Holidays>(() => ({ ...BUNDLED_HOLIDAYS, ...(load<Holidays>(HOLS) ?? {}) }))
  const queueRef = useRef(queue)
  queueRef.current = queue
  // 已送出、但還沒重抓到的動作：繼續疊在畫面上，避免一閃而過
  const [sent, setSent] = useState<Queued[]>([])
  const sentRef = useRef(sent)
  sentRef.current = sent
  const userRef = useRef<string | null>(null)
  const flushing = useRef(false)

  const setQ = useCallback((q: Queued[]) => {
    queueRef.current = q
    setQueue(q)
    save(QUEUE, q)
  }, [])

  const refresh = useCallback(async () => {
    const uid = userRef.current
    if (!uid) return
    const settled = new Set(sentRef.current.map((x) => x.qid))
    try {
      const [r, snap] = await Promise.all([fetchRole(uid), fetchSnapshot()])
      if (!r) {
        setNotMember(true)
        return
      }
      const at = new Date().toISOString()
      setRole(r)
      setServer(snap)
      setSent((x) => x.filter((y) => !settled.has(y.qid)))
      setSyncedAt(at)
      setLoadError(null)
      save(CACHE, { userId: uid, role: r, snap, syncedAt: at } satisfies Cache)
    } catch (e) {
      const err = e as { message: string; code?: string }
      if (!isNetworkError(err)) setLoadError(reason(err))
    }
  }, [])

  const flush = useCallback(async () => {
    if (flushing.current || !userRef.current) return
    flushing.current = true
    let sent = false
    try {
      while (queueRef.current.length && navigator.onLine) {
        const [op] = queueRef.current
        const err = await send(op)
        if (err && isNetworkError(err)) break
        if (err) setProblems((p) => [...p, { id: op.qid, text: `${describe(op)}沒有送出：${reason(err)}` }])
        else setSent((x) => (sentRef.current = [...x, op]))
        setQ(queueRef.current.filter((x) => x.qid !== op.qid))
        sent = true
      }
    } finally {
      flushing.current = false
    }
    if (sent) await refresh()
  }, [refresh, setQ])

  const run = useCallback(
    (op: Op) => {
      setQ([...queueRef.current, { ...op, qid: newId() } as Queued])
      void flush()
    },
    [flush, setQ],
  )

  // 登入狀態
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const uid = session?.user.id ?? (session === null && !navigator.onLine ? cached.current?.userId : undefined) ?? null
  useEffect(() => {
    userRef.current = uid
    if (!uid) return
    if (cached.current && cached.current.userId !== uid) {
      // 換人登入：不能看到上一個人留在手機裡的資料
      setServer(emptySnapshot())
      setRole(null)
      setQ([])
    }
    void refresh().then(flush)
  }, [uid, refresh, flush, setQ])

  // 即時同步：任何一支手機改了資料，另外兩支馬上重抓
  useEffect(() => {
    if (!session) return
    let t: ReturnType<typeof setTimeout> | undefined
    const later = () => {
      clearTimeout(t)
      t = setTimeout(() => void refresh(), 250)
    }
    const ch = supabase.channel('kid-tasks')
    for (const table of ['kt_tasks', 'kt_asks', 'kt_checks', 'kt_messages', 'kt_reads', 'kt_bank', 'kt_exams', 'kt_visits', 'kt_needs'])
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, later)
    ch.subscribe()
    return () => {
      clearTimeout(t)
      void supabase.removeChannel(ch)
    }
  }, [session, refresh])

  // 網路恢復、回到畫面、每 30 秒：送出排隊的動作並重抓
  useEffect(() => {
    const up = () => {
      setOnline(navigator.onLine)
      if (navigator.onLine) void flush().then(refresh)
    }
    const vis = () => document.visibilityState === 'visible' && up()
    window.addEventListener('online', up)
    window.addEventListener('offline', up)
    document.addEventListener('visibilitychange', vis)
    const iv = setInterval(() => queueRef.current.length && void flush(), 30_000)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', up)
      document.removeEventListener('visibilitychange', vis)
      clearInterval(iv)
    }
  }, [flush, refresh])

  // 明年的國定假日：手機裡沒有就去下載一次
  useEffect(() => {
    const y = Number(taipeiToday().slice(0, 4))
    for (const year of [y, y + 1]) {
      if (Object.keys(holidays).some((k) => k.startsWith(`${year}-`))) continue
      fetch(`https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/${year}.json`)
        .then((r) => (r.ok ? r.json() : null))
        .then((rows) => {
          const add = parseHolidayJson(rows)
          if (!Object.keys(add).length) return
          setHolidays((h) => {
            const next = { ...h, ...add }
            save(HOLS, Object.fromEntries(Object.entries(next).filter(([k]) => !(k in BUNDLED_HOLIDAYS))))
            return next
          })
        })
        .catch(() => {})
    }
  }, [holidays])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    localStorage.removeItem(CACHE)
    setQ([])
    cached.current = null
    setServer(emptySnapshot())
    setRole(null)
    setNotMember(false)
  }, [setQ])

  const data = useMemo(() => applyAll(server, [...sent, ...queue]), [server, sent, queue])

  const phase: Store['phase'] =
    session === undefined ? 'loading' : !uid ? 'login' : notMember ? 'not-member' : role ? 'ready' : 'loading'

  const value: Store = {
    phase,
    role,
    data,
    holidays,
    online,
    pending: queue.filter((q) => q.t !== 'visit' && q.t !== 'read').length,
    syncedAt,
    loadError,
    problems,
    dismissProblem: (id) => setProblems((p) => p.filter((x) => x.id !== id)),
    run,
    refresh,
    signOut,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
