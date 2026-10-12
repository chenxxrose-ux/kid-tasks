import { useState } from 'react'
import { newId, useStore } from '../data/store'
import { addDays, hmOf, md, taipeiToday } from '../../lib/dates'
import { dueText, type TeacherItem } from '../../lib/schedule'
import { Check } from '../../ui/icons'

/**
 * 老師說：老師交代的事放在第一頁，做完前一直留著。
 * 樂樂可以自己記（老師通常直接跟她說），也可以打勾；媽媽們看得到幾點做完，可以拿掉。
 */
export function TeacherBox({ items, onTick }: { items: TeacherItem[]; onTick?: (t: TeacherItem) => void }) {
  const { role } = useStore()
  const today = taipeiToday()
  const left = items.filter((t) => !t.doneAt)
  const kid = role === 'kid'
  const shown = kid ? left : items
  return (
    <section className="teach" aria-label="老師說">
      {/* 沒有事的時候只留一行，不佔第一頁 */}
      {shown.length ? (
        <h2>
          老師說
          <span>{kid ? `${left.length} 件` : `${items.length - left.length} / ${items.length} 完成`}</span>
        </h2>
      ) : null}
      <div className="card">
        {shown.map((t) => {
          const due = dueText(t.due, today)
          const hint = due ? <small className={`due ${due.tone}`}>{due.text}</small> : null
          return kid ? (
            <div className="task" key={t.id}>
              <button className="tbtn" onClick={() => onTick?.(t)} aria-pressed={false}>
                <span className="box">
                  <Check />
                </span>
                <span className="tt">
                  <b>{t.title}</b>
                  {hint}
                </span>
              </button>
            </div>
          ) : (
            <MomRow key={t.id} t={t} hint={hint} />
          )
        })}
        <TeacherForm compact={!shown.length} />
      </div>
    </section>
  )
}

function MomRow({ t, hint }: { t: TeacherItem; hint: React.ReactNode }) {
  const { run } = useStore()
  const [confirm, setConfirm] = useState(false)
  const today = taipeiToday()
  return (
    <div className={`task ${t.doneAt ? 'done' : ''}`}>
      <div className="tbtn" style={{ cursor: 'default' }}>
        <span className="box">
          <Check />
        </span>
        <span className="tt">
          <b>{t.title}</b>
          {t.doneAt ? null : hint}
        </span>
        {t.doneAt ? <span className="time">{t.doneDay === today ? hmOf(t.doneAt) : `${md(t.doneDay!)} ${hmOf(t.doneAt)}`}</span> : null}
        {t.doneAt ? null : confirm ? (
          <button className="linkbtn danger" onClick={() => run({ t: 'unask', id: t.askId, at: new Date().toISOString() })}>
            確定拿掉
          </button>
        ) : (
          <button className="linkbtn" style={{ color: 'var(--muted)', fontWeight: 500 }} onClick={() => setConfirm(true)} aria-label={`拿掉「${t.title}」`}>
            拿掉
          </button>
        )}
      </div>
    </div>
  )
}

type DueChoice = 'none' | 'tomorrow' | 'pick'

function TeacherForm({ compact }: { compact: boolean }) {
  const { run } = useStore()
  const today = taipeiToday()
  const [open, setOpen] = useState(false)
  const [v, setV] = useState('')
  const [when, setWhen] = useState<DueChoice>('tomorrow')
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
                  老師說<i>：記下老師交代的事</i>
                </>
              ) : (
                '記下老師說的事'
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
        if (!title) return setErr('請寫老師交代什麼')
        if (title.length > 40) return setErr('請寫短一點（40 字以內）')
        if (when === 'pick' && (!picked || picked < today)) return setErr('請選今天以後的日期')
        const due = when === 'tomorrow' ? addDays(today, 1) : when === 'pick' ? picked : null
        run({
          t: 'ask',
          id: newId(),
          day: today,
          title,
          at: new Date().toISOString(),
          source: 'teacher',
          due,
        })
        setV('')
        setPicked('')
        setWhen('tomorrow')
        setErr('')
        setOpen(false)
      }}
    >
      <div className="field">
        <label htmlFor="teachtitle">老師交代什麼</label>
        <input
          className="input"
          id="teachtitle"
          placeholder="例如：帶直笛、數學習作第 3 頁"
          autoComplete="off"
          autoFocus
          value={v}
          onChange={(e) => setV(e.target.value)}
        />
      </div>
      <div className="field">
        <span className="flabel">什麼時候要好</span>
        <div className="pills">
          {(
            [
              ['tomorrow', '明天'],
              ['pick', '選日期'],
              ['none', '老師沒說'],
            ] as [DueChoice, string][]
          ).map(([k, n]) => (
            <button type="button" key={k} className="pill" aria-pressed={when === k} onClick={() => setWhen(k)}>
              {n}
            </button>
          ))}
        </div>
        {when === 'pick' ? (
          <input className="input" type="date" aria-label="到期日" min={today} value={picked} onChange={(e) => setPicked(e.target.value)} />
        ) : null}
      </div>
      <div className="err" role="alert">
        {err}
      </div>
      <div className="grid2">
        <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
          取消
        </button>
        <button className="btn">記下來</button>
      </div>
    </form>
  )
}
