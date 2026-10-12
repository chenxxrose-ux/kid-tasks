import { useEffect, useRef, useState } from 'react'
import { StoreProvider, newId, useStore } from '../features/data/store'
import { Login } from '../features/auth/Login'
import { TodayPage } from '../features/today/TodayPage'
import { MessagesPage } from '../features/messages/MessagesPage'
import { BankPage } from '../features/bank/BankPage'
import { PlanPage } from '../features/plan/PlanPage'
import { shouldLogVisit, unread } from '../lib/schedule'
import { BankIcon, MsgIcon, PlanIcon, TodayIcon } from '../ui/icons'
import { MsgBanner } from '../ui/kit'

type Tab = 'today' | 'msgs' | 'bank' | 'plan'

export function App() {
  return (
    <StoreProvider>
      <Gate />
    </StoreProvider>
  )
}

function Gate() {
  const { phase, signOut } = useStore()
  if (phase === 'loading') return <div className="center">載入中…</div>
  if (phase === 'login') return <Login />
  if (phase === 'not-member')
    return (
      <div className="center">
        <div>這個帳號還沒有開通今日事。</div>
        <button className="btn ghost" onClick={signOut}>
          換一個帳號
        </button>
      </div>
    )
  return <Shell />
}

function Shell() {
  const { role, data, run, signOut } = useStore()
  const [tab, setTab] = useState<Tab>('today')
  const [examId, setExamId] = useState<string | null>(null)
  const go = (t: Tab) => {
    setTab(t)
    setExamId(null)
    window.scrollTo(0, 0)
  }

  // 樂樂每次打開網頁都記時間（5 分鐘內重複打開算同一次），媽媽們看得到
  const latest = useRef({ data, run })
  latest.current = { data, run }
  const lastLog = useRef(0)
  useEffect(() => {
    if (role !== 'kid') return
    const log = () => {
      if (document.visibilityState !== 'visible') return
      const now = new Date()
      if (now.getTime() - lastLog.current < 5 * 60_000 || !shouldLogVisit(latest.current.data, now)) return
      lastLog.current = now.getTime()
      latest.current.run({ t: 'visit', id: newId(), at: now.toISOString() })
    }
    log()
    document.addEventListener('visibilitychange', log)
    return () => document.removeEventListener('visibilitychange', log)
  }, [role])

  if (!role) return null
  const n = unread(role, data.messages, data.reads).length
  const p = role === 'mom' ? data.bank.filter((b) => b.status === 'pending').length : 0
  const tabs: [Tab, string, React.ReactNode, number][] = [
    ['today', '今日事', <TodayIcon key="i" />, 0],
    ['msgs', '留言', <MsgIcon key="i" />, n],
    ['bank', '存錢筒', <BankIcon key="i" />, p],
  ]
  if (role === 'mom') tabs.push(['plan', '安排', <PlanIcon key="i" />, 0])

  return (
    <div className="app">
      {tab === 'today' ? (
        <TodayPage
          goMsgs={() => go('msgs')}
          goPlan={(id) => {
            setTab('plan')
            setExamId(id)
          }}
        />
      ) : (
        <>
          <div className="topban">
            <MsgBanner onReply={() => go('msgs')} />
          </div>
          {tab === 'msgs' ? <MessagesPage /> : tab === 'bank' ? <BankPage /> : <PlanPage examId={examId} />}
        </>
      )}
      {tab !== 'msgs' ? (
        <div className="foot" style={{ padding: '8px 16px 16px', textAlign: 'center' }}>
          <button className="linkbtn" style={{ color: 'var(--muted)', fontWeight: 500 }} onClick={signOut}>
            登出
          </button>
        </div>
      ) : null}
      <nav className="tabs" aria-label="分頁">
        <div className="in">
          {tabs.map(([t, name, icon, c]) => (
            <button key={t} className="tab" aria-current={tab === t ? 'page' : undefined} onClick={() => go(t)}>
              {icon}
              {name}
              {c ? (
                <span className="dot" aria-label={`${c} 則`}>
                  {c}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
