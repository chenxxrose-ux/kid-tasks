import { useState } from 'react'
import { newId, useStore } from '../data/store'
import { addDays, dayOf, hmOf, md, taipeiToday } from '../../lib/dates'
import { dueText, needsFor } from '../../lib/schedule'
import type { Need } from '../../lib/types'
import { Check } from '../../ui/icons'

const doneText = (at: string, today: string) => `媽媽們準備好了 ${dayOf(at) === today ? '' : `${md(dayOf(at))} `}${hmOf(at)}`

/**
 * 我需要：樂樂請媽媽們準備的東西。
 * 樂樂寫、看得到媽媽們準備好了沒；媽媽們第一頁最上面看到「樂樂需要」，按一下就是準備好了。
 */
export function KidNeeds() {
  const { data, run } = useStore()
  const today = taipeiToday()
  const list = needsFor(today, data)
  const [confirm, setConfirm] = useState<string | null>(null)
  return (
    <section className="need" aria-label="我需要">
      {list.length ? (
        <h2>
          我需要<span>{list.filter((n) => !n.done_at).length ? `等媽媽們準備 ${list.filter((n) => !n.done_at).length} 件` : '都準備好了'}</span>
        </h2>
      ) : null}
      <div className="card">
        {list.map((n) => (
          <div className={`task ${n.done_at ? 'done' : ''}`} key={n.id}>
            <div className="tbtn" style={{ cursor: 'default' }}>
              {/* 樂樂這邊不能勾，等媽媽們準備時用圓圈 */}
              <span className={`box ${n.done_at ? '' : 'wait'}`}>
                <Check />
              </span>
              <span className="tt">
                <b>{n.title}</b>
                <NeedHint n={n} today={today} />
              </span>
              {n.done_at ? null : confirm === n.id ? (
                <button className="linkbtn danger" onClick={() => run({ t: 'need-del', id: n.id, at: new Date().toISOString() })}>
                  確定拿掉
                </button>
              ) : (
                <button className="linkbtn edit" onClick={() => setConfirm(n.id)} aria-label={`拿掉「${n.title}」`}>
                  拿掉
                </button>
              )}
            </div>
          </div>
        ))}
        <NeedForm compact={!list.length} />
      </div>
    </section>
  )
}

export function MomNeeds() {
  const { data, run } = useStore()
  const today = taipeiToday()
  const list = needsFor(today, data)
  if (!list.length) return null
  const left = list.filter((n) => !n.done_at).length
  return (
    <section className="need" aria-label="樂樂需要">
      <h2>
        樂樂需要<span>{left ? `還有 ${left} 件要準備` : '都準備好了'}</span>
      </h2>
      <div className="card">
        {list.map((n) => (
          <div className={`task ${n.done_at ? 'done' : ''}`} key={n.id}>
            <button
              className="tbtn"
              aria-pressed={Boolean(n.done_at)}
              onClick={() => run({ t: 'need-done', id: n.id, at: n.done_at ? null : new Date().toISOString() })}
            >
              <span className="box">
                <Check />
              </span>
              <span className="tt">
                <b>{n.title}</b>
                {n.done_at ? <small>點一下取消</small> : <NeedHint n={n} today={today} />}
              </span>
              <span className="time">{n.done_at ? hmOf(n.done_at) : ''}</span>
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

function NeedHint({ n, today }: { n: Need; today: string }) {
  if (n.done_at) return <small className="due ok">{doneText(n.done_at, today)}</small>
  const due = dueText(n.due, today)
  return <small className={due ? `due ${due.tone}` : ''}>{due ? `${due.text.replace('到期', '要')}` : `${md(dayOf(n.created_at))} 寫的・等媽媽們準備`}</small>
}

type When = 'tomorrow' | 'pick' | 'none'

function NeedForm({ compact }: { compact: boolean }) {
  const { run } = useStore()
  const today = taipeiToday()
  const [open, setOpen] = useState(false)
  const [v, setV] = useState('')
  const [when, setWhen] = useState<When>('tomorrow')
  const [picked, setPicked] = useState('')
  const [err, setErr] = useState('')
  if (!open)
    return (
      <div className="task">
        <button className="tbtn" onClick={() => setOpen(true)}>
          <span className="box" style={{ borderStyle: 'dashed' }} />
          <span className="tt">
            <b className="addlink">
              {compact ? (
                <>
                  我需要<i>：請媽媽們幫我準備</i>
                </>
              ) : (
                '還需要別的'
              )}
            </b>
          </span>
        </button>
      </div>
    )
  return (
    <form
      className="pad"
      style={compact ? undefined : { borderTop: '1px solid var(--line)' }}
      onSubmit={(e) => {
        e.preventDefault()
        const title = v.trim()
        if (!title) return setErr('請寫需要什麼')
        if (title.length > 40) return setErr('請寫短一點（40 字以內）')
        if (when === 'pick' && (!picked || picked < today)) return setErr('請選今天以後的日期')
        const due = when === 'tomorrow' ? addDays(today, 1) : when === 'pick' ? picked : null
        run({ t: 'need', id: newId(), title, due, at: new Date().toISOString() })
        setV('')
        setPicked('')
        setWhen('tomorrow')
        setErr('')
        setOpen(false)
      }}
    >
      <div className="field">
        <label htmlFor="needtitle">需要什麼</label>
        <input className="input" id="needtitle" placeholder="例如：美勞課的色紙、班費 200 元" autoComplete="off" autoFocus value={v} onChange={(e) => setV(e.target.value)} />
      </div>
      <div className="field">
        <span className="flabel">什麼時候要</span>
        <div className="pills">
          {(
            [
              ['tomorrow', '明天'],
              ['pick', '選日期'],
              ['none', '不急'],
            ] as [When, string][]
          ).map(([k, n]) => (
            <button type="button" key={k} className="pill" aria-pressed={when === k} onClick={() => setWhen(k)}>
              {n}
            </button>
          ))}
        </div>
        {when === 'pick' ? <input className="input" type="date" aria-label="哪一天要" min={today} value={picked} onChange={(e) => setPicked(e.target.value)} /> : null}
      </div>
      <div className="err" role="alert">
        {err}
      </div>
      <div className="grid2">
        <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
          取消
        </button>
        <button className="btn">請媽媽們準備</button>
      </div>
    </form>
  )
}
