import { Fragment, useEffect, useRef, useState } from 'react'
import { useStore, newId } from '../data/store'
import { dayNote, isOff } from '../../lib/calendar'
import { WK, addDays, hmOf, md, mdw, taipei, taipeiToday, weekOf, weekday } from '../../lib/dates'
import { PARTS, checksOn, currentPart, missed, nextExam, partName, progress, streak, tasksFor, visitsOn, type DayTask } from '../../lib/schedule'
import { Check } from '../../ui/icons'
import { MsgBanner, SyncNotes } from '../../ui/kit'

export function TodayPage({ goMsgs, goPlan }: { goMsgs: () => void; goPlan: (examId: string) => void }) {
  const { role } = useStore()
  return role === 'kid' ? <KidToday goMsgs={goMsgs} /> : <MomToday goMsgs={goMsgs} goPlan={goPlan} />
}

function Header({ day, title, children }: { day: string; title: string; children?: React.ReactNode }) {
  const { data, holidays, role } = useStore()
  const p = progress(day, data, holidays)
  return (
    <header>
      <div className="row">
        <h1>
          {title} {md(day)} 週{WK[weekday(day)]}
        </h1>
        <div className="count" aria-label={`完成 ${p.done} 件，共 ${p.total} 件`}>
          <b>{p.done}</b> / {p.total}
        </div>
      </div>
      <div className="bar">
        <i style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} />
      </div>
      <div className="note">{dayNote(day, holidays, role === 'mom')}</div>
      {children}
    </header>
  )
}

function Row({ t, at, onToggle, disabled, hint }: { t: DayTask; at?: string; onToggle?: () => void; disabled?: boolean; hint?: string }) {
  return (
    <div className={`task ${at ? 'done' : ''}`}>
      <button className="tbtn" onClick={onToggle} disabled={disabled} aria-pressed={Boolean(at)}>
        <span className="box">
          <Check />
        </span>
        <span className="tt">
          <b>{t.title}</b>
          {hint ? <small>{hint}</small> : null}
        </span>
        <span className="time">{at ? hmOf(at) : ''}</span>
      </button>
    </div>
  )
}

/** 考試倒數：第一頁的大卡片，列出這場考試的每一天 */
function ExamCard({ day, onFill }: { day: string; onFill?: (id: string) => void }) {
  const { data, role } = useStore()
  const n = nextExam(day, data.exams)
  if (!n) return null
  const today = n.inDays === 0
  return (
    <div className="card hero" aria-label={today ? `今天${n.first.title}` : `距離${n.first.title}還有 ${n.inDays} 天`}>
      <div className="n">
        <b className={today ? 'today' : ''}>{today ? '今天' : n.inDays}</b>
        {today ? null : <small>天</small>}
      </div>
      <div className="t">
        <strong>
          {n.first.title}
          {today ? '，加油' : ''}
        </strong>
        {n.days.map((e) => (
          <div key={e.id}>
            {mdw(e.day)}：
            {e.subjects ? (
              e.subjects
            ) : role === 'mom' && onFill ? (
              <button className="linkbtn" onClick={() => onFill(e.id)}>
                填科目
              </button>
            ) : (
              <span className="dim">科目還沒公布</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function KidToday({ goMsgs }: { goMsgs: () => void }) {
  const { data, holidays, run } = useStore()
  const day = taipeiToday()
  const ts = tasksFor(day, data, holidays)
  const c = checksOn(day, data)
  const [open, setOpen] = useState<Record<string, boolean>>(() => ({ [currentPart(taipei().hour)]: true }))
  const [showDone, setShowDone] = useState(false)
  const [toast, setToast] = useState<DayTask | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const tick = (t: DayTask) => {
    run({ t: 'check', day, task_id: t.id, checked_at: new Date().toISOString() })
    setToast(t)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), 4000)
  }
  const untick = (t: DayTask) => {
    run({ t: 'uncheck', day, task_id: t.id })
    setToast(null)
  }

  const todo = ts.filter((t) => !c.has(t.id))
  const done = ts.filter((t) => c.has(t.id))
  const asks = todo.filter((t) => t.slot === 'ask')
  const fin = ts.length > 0 && todo.length === 0

  return (
    <>
      <Header day={day} title="今天" />
      <main>
        <SyncNotes />
        <MsgBanner onReply={goMsgs} />
        {fin ? <FinCard day={day} count={ts.length} last={done.map((t) => c.get(t.id)!).sort().pop()!} /> : null}
        {asks.length ? (
          <section className="askbox">
            <h2>
              媽媽們交代的<span>{asks.length} 件</span>
            </h2>
            <div className="card">
              {asks.map((t) => (
                <Row key={t.id} t={t} onToggle={() => tick(t)} />
              ))}
            </div>
          </section>
        ) : null}
        <ExamCard day={day} />
        {!fin ? (
          <div className="card">
            {PARTS.map((p) => {
              const all = ts.filter((t) => p.slots.includes(t.slot))
              if (!all.length) return null
              const left = all.filter((t) => !c.has(t.id))
              const isOpen = Boolean(open[p.id]) && left.length > 0
              const miss = left.length > 0 && missed(p.id, day, day)
              return (
                <Fragment key={p.id}>
                  <button
                    className={`parthd ${isOpen ? 'open' : ''}`}
                    aria-expanded={isOpen}
                    disabled={!left.length}
                    onClick={() => setOpen((o) => ({ ...o, [p.id]: !o[p.id] }))}
                  >
                    <span>{partName(p.id, p.name, day, holidays)}</span>
                    <span className={`pc ${left.length ? '' : 'full'} ${miss ? 'miss' : ''}`}>
                      {miss ? `漏了 ${left.length} 件` : left.length ? `還有 ${left.length} 件` : '✓ 都做完了'}
                    </span>
                    {left.length ? (
                      <span className="chev" aria-hidden="true">
                        ›
                      </span>
                    ) : null}
                  </button>
                  {isOpen ? left.map((t) => <Row key={t.id} t={t} onToggle={() => tick(t)} />) : null}
                </Fragment>
              )
            })}
          </div>
        ) : null}
        {!ts.length ? <div className="empty">今天沒有要做的事。</div> : null}
        {done.length ? (
          <div className="card">
            <button className={`parthd ${showDone ? 'open' : ''}`} aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
              <span style={{ color: 'var(--muted)' }}>今天做完的</span>
              <span className="pc">{done.length} 件</span>
              <span className="chev" aria-hidden="true">
                ›
              </span>
            </button>
            {showDone ? done.map((t) => <Row key={t.id} t={t} at={c.get(t.id)} hint="點一下取消打勾" onToggle={() => untick(t)} />) : null}
          </div>
        ) : null}
      </main>
      {toast ? (
        <div className="toast" role="status">
          <span>✓ {toast.title}</span>
          <button onClick={() => untick(toast)}>復原</button>
        </div>
      ) : null}
    </>
  )
}

/** 全部做完：講事實，不幼稚 */
function FinCard({ day, count, last }: { day: string; count: number; last: string }) {
  const { data, holidays } = useStore()
  const n = streak(day, data, holidays)
  return (
    <div className="fin">
      <div className="ring">
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      <h2>今天的事都做完了</h2>
      <p>
        {count} 件全部完成，最後一件 {hmOf(last)}
        <br />
        剩下的時間是你自己的。
      </p>
      {n > 1 ? <div className="streak">連續 {n} 天全部完成</div> : null}
    </div>
  )
}

function MomToday({ goMsgs, goPlan }: { goMsgs: () => void; goPlan: (examId: string) => void }) {
  const { data, holidays, run } = useStore()
  const today = taipeiToday()
  const [day, setDay] = useState(today)
  const ts = tasksFor(day, data, holidays)
  const c = checksOn(day, data)
  const week = weekOf(day)
  const visits = visitsOn(day, data)
  const asks = ts.filter((t) => t.slot === 'ask')

  return (
    <>
      <Header day={day} title="樂樂">
        {day <= today ? (
          <div className="visit">
            {visits.length ? (
              <>
                樂樂{day === today ? '今天' : md(day)}打開過 <b>{visits.length}</b> 次：{visits.map((v) => hmOf(v.at)).join('、')}
              </>
            ) : (
              `樂樂${day === today ? '今天' : md(day)}還沒打開過`
            )}
          </div>
        ) : null}
        <div className="wkrow">
          <button className="wkbtn" aria-label="上一週" onClick={() => setDay(addDays(week[0], -6))}>
            ‹
          </button>
          <span>
            {md(week[0])}–{md(week[6])}
          </span>
          <button className="wkbtn" aria-label="下一週" onClick={() => setDay(addDays(week[6], 1))}>
            ›
          </button>
        </div>
        <div className="days">
          {week.map((d) => {
            const p = progress(d, data, holidays)
            const exam = data.exams.some((e) => e.day === d && e.title.includes('段考'))
            const tag = isOff(d, holidays) ? 'off' : exam ? 'exam' : ''
            return (
              <button
                key={d}
                className={`day ${tag}`}
                aria-pressed={d === day}
                aria-label={`${md(d)}${tag === 'off' ? ' 放假' : tag === 'exam' ? ' 段考' : ''}，完成 ${p.done}/${p.total}`}
                onClick={() => setDay(d)}
              >
                {d === today ? '今' : WK[weekday(d)]}
                <span className="mini">
                  <i style={{ width: `${d > today || !p.total ? 0 : (p.done / p.total) * 100}%` }} />
                </span>
              </button>
            )
          })}
        </div>
      </Header>
      <main>
        <SyncNotes />
        <MsgBanner onReply={goMsgs} />
        {asks.length || day >= today ? (
          <section className="askbox">
            <h2>
              媽媽們交代的<span>{asks.length ? `${asks.filter((t) => c.has(t.id)).length} / ${asks.length} 完成` : ''}</span>
            </h2>
            <div className="card">
              {asks.map((t) => (
                <AskRow key={t.id} t={t} at={c.get(t.id)} canRemove={day >= today && !c.has(t.id)} />
              ))}
              {day >= today ? <AskForm day={day} onAdd={(title) => run({ t: 'ask', id: newId(), day, title, at: new Date().toISOString() })} /> : null}
            </div>
          </section>
        ) : null}
        <ExamCard day={day} onFill={goPlan} />
        {PARTS.map((p) => {
          const list = ts.filter((t) => p.slots.includes(t.slot))
          if (!list.length) return null
          return (
            <section className="group" key={p.id}>
              <h2>{partName(p.id, p.name, day, holidays)}</h2>
              <div className="card">
                {list.map((t) => (
                  <Row key={t.id} t={t} at={c.get(t.id)} disabled />
                ))}
              </div>
            </section>
          )
        })}
        {day > today ? <div className="empty">還沒到這天，上面是那天要做的事。</div> : null}
      </main>
    </>
  )
}

function AskRow({ t, at, canRemove }: { t: DayTask; at?: string; canRemove: boolean }) {
  const { run } = useStore()
  const [confirm, setConfirm] = useState(false)
  const id = t.id.slice(4)
  return (
    <div className={`task ${at ? 'done' : ''}`}>
      <div className="tbtn" style={{ cursor: 'default' }}>
        <span className="box">
          <Check />
        </span>
        <span className="tt">
          <b>{t.title}</b>
        </span>
        {at ? <span className="time">{hmOf(at)}</span> : null}
        {canRemove ? (
          confirm ? (
            <button className="linkbtn danger" onClick={() => run({ t: 'unask', id, at: new Date().toISOString() })}>
              確定拿掉
            </button>
          ) : (
            <button className="linkbtn" style={{ color: 'var(--muted)', fontWeight: 500 }} onClick={() => setConfirm(true)} aria-label={`拿掉「${t.title}」`}>
              拿掉
            </button>
          )
        ) : null}
      </div>
    </div>
  )
}

function AskForm({ day, onAdd }: { day: string; onAdd: (title: string) => void }) {
  const [open, setOpen] = useState(false)
  const [v, setV] = useState('')
  const [err, setErr] = useState('')
  if (!open)
    return (
      <div className="task">
        <button className="tbtn" onClick={() => setOpen(true)}>
          <span className="box" style={{ borderStyle: 'dashed' }} />
          <span className="tt">
            <b style={{ color: 'var(--accent)', fontWeight: 700 }}>交代一件事{day !== taipeiToday() ? `（${md(day)}）` : ''}</b>
          </span>
        </button>
      </div>
    )
  return (
    <form
      className="pad"
      style={{ borderTop: '1px solid var(--line)' }}
      onSubmit={(e) => {
        e.preventDefault()
        const title = v.trim()
        if (!title) return setErr('請寫要交代的事')
        if (title.length > 40) return setErr('請寫短一點（40 字以內）')
        onAdd(title)
        setV('')
        setErr('')
        setOpen(false)
      }}
    >
      <label className="sr" htmlFor="asktitle">
        要交代的事
      </label>
      <input className="input" id="asktitle" placeholder="例如：洗碗、倒垃圾" autoComplete="off" autoFocus value={v} onChange={(e) => setV(e.target.value)} />
      <div className="err" role="alert">
        {err}
      </div>
      <div className="grid2">
        <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
          取消
        </button>
        <button className="btn">交代</button>
      </div>
    </form>
  )
}
