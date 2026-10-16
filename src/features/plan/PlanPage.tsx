import { useEffect, useState } from 'react'
import { newId, useStore } from '../data/store'
import { HOLIDAY_SOURCE, SCHOOL_SOURCE } from '../../lib/calendar'
import { WK, mdw, stamp, taipeiToday } from '../../lib/dates'
import { doneLog } from '../../lib/schedule'
import type { Exam, Task } from '../../lib/types'
import { Fold, SyncNotes } from '../../ui/kit'

type EditSlot = Task['slot']
const SLOTS: [EditSlot, string][] = [
  ['morning', '早上出門前'],
  ['home', '放學後'],
  ['study', '功課'],
  ['meal', '吃完東西'],
  ['bath', '洗完澡'],
  ['night', '睡前'],
]
const GROUPS: [EditSlot, string][] = [...SLOTS.slice(0, 3), ['extra', '依星期加的'], ...SLOTS.slice(3)]
const ORDER = [1, 2, 3, 4, 5, 6, 0]
const daysText = (d: number[]) => (d.length === 7 ? '每天' : `週${ORDER.filter((x) => d.includes(x)).map((x) => WK[x]).join('、')}`)

/** 安排：只有媽媽們看得到，改考試和每天的任務 */
export function PlanPage({ examId }: { examId: string | null }) {
  const { data } = useStore()
  const today = taipeiToday()
  const [exEdit, setExEdit] = useState<string | null>(examId)
  const [editing, setEditing] = useState<Task | null>(null)
  useEffect(() => {
    if (examId) document.getElementById(`exam-${examId}`)?.scrollIntoView({ block: 'center' })
  }, [examId])

  const upcoming = data.exams.filter((x) => x.day >= today).sort((a, b) => (a.day < b.day ? -1 : 1))
  const tasks = data.tasks.filter((t) => t.active)

  return (
    <>
      <header>
        <h1>安排</h1>
        <div className="note">考試和每天的任務，只有媽媽們能改</div>
      </header>
      <main>
        <SyncNotes />
        <DoneLog />
        <section className="group">
          <h2>考試</h2>
          <div className="card">
            {upcoming.length ? (
              upcoming.map((x) =>
                exEdit === x.id ? (
                  <ExamForm key={x.id} exam={x} onClose={() => setExEdit(null)} />
                ) : (
                  <div className="line" key={x.id} id={`exam-${x.id}`}>
                    <div className="tt">
                      <b>
                        {mdw(x.day)}
                        {x.title}
                      </b>
                      <small>{x.subjects || '科目還沒填'}</small>
                    </div>
                    <button className="linkbtn" onClick={() => setExEdit(x.id)}>
                      修改
                    </button>
                  </div>
                ),
              )
            ) : (
              <div className="empty">之後沒有考試。</div>
            )}
          </div>
        </section>
        {exEdit === 'new' ? (
          <div className="card">
            <ExamForm exam={null} onClose={() => setExEdit(null)} />
          </div>
        ) : (
          <button className="btn ghost" onClick={() => setExEdit('new')}>
            新增考試
          </button>
        )}

        {GROUPS.map(([slot, name]) => {
          const list = tasks.filter((t) => t.slot === slot).sort((a, b) => a.sort - b.sort)
          if (!list.length) return null
          return (
            <section className="group" key={slot}>
              <h2>{name}</h2>
              <div className="card">
                {list.map((t) =>
                  editing?.id === t.id ? (
                    <TaskForm key={t.id} task={editing} isNew={false} onClose={() => setEditing(null)} />
                  ) : (
                    <div className="line" key={t.id}>
                      <div className="tt">
                        <b>{t.title}</b>
                        <small>{daysText(t.days)}</small>
                      </div>
                      <button className="linkbtn" onClick={() => setEditing({ ...t, days: [...t.days] })}>
                        修改
                      </button>
                    </div>
                  ),
                )}
              </div>
            </section>
          )
        })}
        {editing && !data.tasks.some((t) => t.id === editing.id) ? (
          <div className="card">
            <TaskForm task={editing} isNew onClose={() => setEditing(null)} />
          </div>
        ) : (
          <button
            className="btn"
            onClick={() =>
              setEditing({ id: newId(), title: '', slot: 'home', days: [0, 1, 2, 3, 4, 5, 6], active: true, sort: Math.max(0, ...data.tasks.map((t) => t.sort)) + 10 })
            }
          >
            新增任務
          </button>
        )}
        <div className="foot">
          平日遇到國定假日或學校放假（含寒假）會自動照星期日的清單，也不用洗餐盒。段考前 7 天會自動多一項「段考複習 30 分鐘」。
          <br />
          國定假日：{HOLIDAY_SOURCE}。學校日期：{SCHOOL_SOURCE}。
        </div>
      </main>
    </>
  )
}

function ExamForm({ exam, onClose }: { exam: Exam | null; onClose: () => void }) {
  const { run } = useStore()
  const today = taipeiToday()
  const [day, setDay] = useState(exam?.day ?? '')
  const [title, setTitle] = useState(exam?.title ?? '')
  const [subjects, setSubjects] = useState(exam?.subjects ?? '')
  const [err, setErr] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  return (
    <form
      className="pad"
      id={exam ? `exam-${exam.id}` : undefined}
      onSubmit={(e) => {
        e.preventDefault()
        const t = title.trim()
        const sj = subjects.trim()
        if (!day || day < today) return setErr('請選今天以後的日期')
        if (!t) return setErr('請填名稱')
        if (t.length > 30) return setErr('名稱請短一點（30 字以內）')
        if (sj.length > 80) return setErr('科目請短一點（80 字以內）')
        run({ t: 'exam', id: exam?.id ?? newId(), day, title: t, subjects: sj, isNew: !exam })
        onClose()
      }}
    >
      <b>{exam ? `${mdw(exam.day)}${exam.title}` : '新增考試'}</b>
      {exam ? null : (
        <>
          <div className="field">
            <label htmlFor="exd">日期</label>
            <input className="input" id="exd" type="date" min={today} value={day} onChange={(e) => setDay(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="ext">名稱</label>
            <input className="input" id="ext" placeholder="例如：英文小考" autoComplete="off" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </>
      )}
      <div className="field">
        <label htmlFor="exs">考哪幾科</label>
        <input
          className="input"
          id="exs"
          placeholder="例如：國文、數學"
          autoComplete="off"
          autoFocus={Boolean(exam)}
          value={subjects}
          onChange={(e) => setSubjects(e.target.value)}
        />
      </div>
      <div className="err" role="alert">
        {err}
      </div>
      <div className="grid2">
        <button type="button" className="btn ghost" onClick={onClose}>
          取消
        </button>
        <button className="btn">{exam ? '儲存' : '加入'}</button>
      </div>
      {exam ? (
        confirmDel ? (
          <button
            type="button"
            className="linkbtn danger"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => {
              run({ t: 'exam-del', id: exam.id })
              onClose()
            }}
          >
            確定刪除這場
          </button>
        ) : (
          <button type="button" className="linkbtn danger" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirmDel(true)}>
            刪除這場
          </button>
        )
      ) : null}
    </form>
  )
}

function TaskForm({ task, isNew, onClose }: { task: Task; isNew: boolean; onClose: () => void }) {
  const { run } = useStore()
  const [title, setTitle] = useState(task.title)
  const [slot, setSlot] = useState<EditSlot>(task.slot)
  const [days, setDays] = useState(task.days)
  const [err, setErr] = useState('')
  return (
    <form
      className="pad"
      onSubmit={(e) => {
        e.preventDefault()
        const t = title.trim()
        if (!t) return setErr('請填名稱')
        if (t.length > 40) return setErr('名稱請短一點（40 字以內）')
        if (!days.length) return setErr('至少選一天')
        run({ t: 'task', task: { ...task, title: t, slot, days: [...days].sort() }, isNew })
        onClose()
      }}
    >
      <b>{isNew ? '新增任務' : '修改任務'}</b>
      <div className="field">
        <label htmlFor="tt">名稱</label>
        <input className="input" id="tt" autoComplete="off" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <span className="flabel">時段</span>
        <div className="pills">
          {SLOTS.map(([s, n]) => (
            <button type="button" key={s} className="pill" aria-pressed={slot === s || (slot === 'extra' && s === 'home')} onClick={() => setSlot(s)}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="flabel">哪幾天</span>
        <div className="pills">
          {ORDER.map((d) => (
            <button
              type="button"
              key={d}
              className="pill"
              aria-pressed={days.includes(d)}
              aria-label={`星期${WK[d]}`}
              onClick={() => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))}
            >
              {WK[d]}
            </button>
          ))}
        </div>
      </div>
      <div className="err" role="alert">
        {err}
      </div>
      <div className="grid2">
        <button type="button" className="btn ghost" onClick={onClose}>
          取消
        </button>
        <button className="btn">{isNew ? '加入' : '儲存'}</button>
      </div>
      {isNew ? null : (
        <button
          type="button"
          className="linkbtn danger"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => {
            run({ t: 'task', task: { ...task, active: false }, isNew: false })
            onClose()
          }}
        >
          停用這項
        </button>
      )}
    </form>
  )
}


/** 完成紀錄：準備好的「樂樂需要」、做完的「老師說」不放第一頁，收在這裡 */
function DoneLog() {
  const { data, run } = useStore()
  const today = taipeiToday()
  const rows = doneLog(today, data)
  return (
    <Fold title="完成紀錄" hint={rows.length ? `近兩個月 ${rows.length} 件` : undefined}>
      {rows.length ? (
        rows.map((r) => (
          <div className="line" key={`${r.kind}:${r.id}`}>
            <div className="tt">
              <b>{r.title}</b>
              <small>
                {r.kind === 'need' ? '樂樂需要・準備好了' : '老師說・做完了'} {stamp(r.at, today)}
              </small>
            </div>
            {r.kind === 'need' ? (
              <button className="linkbtn" onClick={() => run({ t: 'need-done', id: r.id, at: null })}>
                還沒準備
              </button>
            ) : null}
          </div>
        ))
      ) : (
        <div className="empty">樂樂需要的東西準備好、老師說的事做完，會收到這裡。</div>
      )}
    </Fold>
  )
}
