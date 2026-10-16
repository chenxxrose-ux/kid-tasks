import { useState } from 'react'
import { newId, useStore } from '../data/store'
import { addDays, md, stamp, taipeiToday } from '../../lib/dates'
import {
  HELP_PTS,
  OWN_PER_WEEK,
  WEEK_BONUS,
  WEEK_GOAL,
  activeRewards,
  history,
  itemUsed,
  kidNews,
  owed,
  ownLeft,
  pendingReqs,
  ptBalance,
  rewardGroups,
  weekDots,
} from '../../lib/points'
import { Fold, SyncNotes } from '../../ui/kit'
import type { PtReq, PtReward, Snapshot } from '../../lib/types'

const now = () => new Date().toISOString()
/** 本分：今日事每天的任務，加上掃地拖地、煮飯 */
const DUTY_WORDS = ['掃地', '拖地', '煮飯']

export function PointsPage() {
  const { role } = useStore()
  return role === 'kid' ? <KidPoints /> : <MomPoints />
}

function GoalCard({ kid, onPick }: { kid: boolean; onPick?: () => void }) {
  const { data, run } = useStore()
  const bal = ptBalance(data)
  const goal = activeRewards(data).find((r) => r.id === data.ptState?.goal)
  const waiting = goal && pendingReqs(data).some((q) => q.reward_id === goal.id)
  const justWon = data.ptReqs.some((q) => q.kind === 'redeem' && q.status === 'ok' && q.decided_at && q.decided_at > addDays(taipeiToday(), -7))
  if (!goal)
    return (
      <div className="ptgoal">
        <div className="ptgtop">
          <div className="ptgname">
            <small>{kid ? '我的點數' : '樂樂的點數'}</small>
            <b>{justWon ? (kid ? '換到了！選下一個目標' : '樂樂換到了，等她選下一個目標') : kid ? '還沒選目標' : '樂樂還沒選目標'}</b>
          </div>
          <div className="ptnum">
            {bal}
            <small> 點</small>
          </div>
        </div>
        {kid ? (
          <button className="btn pt" onClick={onPick}>
            選一個想換的獎勵當目標
          </button>
        ) : null}
      </div>
    )
  const left = goal.pts - bal
  return (
    <div className="ptgoal">
      <div className="ptgtop">
        <div className="ptgname">
          <small>{kid ? '我的目標' : '樂樂的目標'}</small>
          <b>{goal.title}</b>
        </div>
        <div className="ptnum" aria-label={`${bal} 點，目標 ${goal.pts} 點`}>
          {bal}
          <small> / {goal.pts}</small>
        </div>
      </div>
      <div className="bar ptbar">
        <i style={{ width: `${Math.min(100, Math.max(0, (bal / goal.pts) * 100))}%` }} />
      </div>
      <div className="ptgfoot">
        <span>{waiting ? '已經送出，等媽媽們同意' : left > 0 ? `還差 ${left} 點` : '點數夠了，可以換了'}</span>
        {kid ? (
          <button className="linkbtn" onClick={onPick}>
            換目標
          </button>
        ) : null}
      </div>
      {kid && left <= 0 && !waiting ? (
        <button className="btn pt" onClick={() => run({ t: 'pt-req', id: newId(), kind: 'redeem', item_id: null, reward_id: goal.id, title: goal.title, own: false, pts: goal.pts, at: now() })}>
          換「{goal.title}」
        </button>
      ) : null}
    </div>
  )
}

function WeekRow() {
  const { data, holidays } = useStore()
  const today = taipeiToday()
  const w = weekDots(today, data, holidays)
  const sub = w.awarded ? `這週已經拿到 +${WEEK_BONUS}` : !w.possible ? '這週來不及了，下週一重新開始' : `再 ${w.need} 天就 +${WEEK_BONUS}`
  return (
    <div className="ptweek">
      <div className="tt">
        <b>
          這週全做完 <span className="ptn">{w.done}</span> 天
        </b>
        <small>
          {md(w.start)} 週一開始・{sub}
        </small>
      </div>
      <div className="ptdots" aria-hidden="true">
        {w.days.map((d) => (
          <i key={d.day} className={d.state}>
            {d.state === 'miss' ? '✕' : ''}
          </i>
        ))}
      </div>
    </div>
  )
}

function KidPoints() {
  const { data, run } = useStore()
  const [pick, setPick] = useState(false)
  const [help, setHelp] = useState(false)
  const today = taipeiToday()
  const news = kidNews(data)
  const mine = pendingReqs(data)
  const going = [
    ...mine.map((q) => ({ q, label: q.kind === 'help' ? q.title : `想換：${q.title}`, sub: `${stamp(q.created_at, today)} 送出`, tag: q.kind === 'help' ? '等確認' : '等同意' })),
    ...owed(data).map((q) => ({ q, label: q.title, sub: `媽媽們答應了${q.when_text ? `・${q.when_text}` : ''}`, tag: '等兌現' })),
  ]

  if (pick) return <GoalPicker onDone={() => setPick(false)} />

  return (
    <>
      <header>
        <h1>點數</h1>
      </header>
      <main>
        <SyncNotes />
        {news.length ? (
          <div className="ptnews" role="status">
            <div className="ptnh">媽媽們回覆了</div>
            {news.map((n) => (
              <div className="ptnr" key={n.id}>
                <span>{n.text}</span>
                {n.pts ? <b className={n.pts > 0 ? 'plus' : 'minus'}>{n.pts > 0 ? `+${n.pts}` : `−${-n.pts}`}</b> : null}
              </div>
            ))}
            <button className="btn ptok" onClick={() => run({ t: 'pt-seen', at: now() })}>
              好
            </button>
          </div>
        ) : null}
        <GoalCard kid onPick={() => setPick(true)} />
        <WeekRow />
        {help ? (
          <HelpForm onClose={() => setHelp(false)} />
        ) : (
          <button className="btn pt big" onClick={() => setHelp(true)}>
            ＋ 我主動多做了
          </button>
        )}
        {going.length ? (
          <section className="card">
            <div className="pthd">
              進行中<span>{going.length} 件</span>
            </div>
            {going.map(({ q, label, sub, tag }) => (
              <div className="line" key={q.id}>
                <div className="tt">
                  <b>{label}</b>
                  <small>{sub}</small>
                </div>
                <span className={`tag ${tag === '等兌現' ? 'soon' : ''}`}>{tag}</span>
                {q.status === 'pending' ? (
                  <button className="linkbtn" onClick={() => run({ t: 'pt-cancel', id: q.id, at: now() })}>
                    取消
                  </button>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}
        <Fold title="全部獎勵" hint={`${activeRewards(data).length} 個`}>
          <RewardList kid />
        </Fold>
        <Fold title="點數紀錄" hint="不會被扣">
          <History />
        </Fold>
      </main>
    </>
  )
}

function GoalPicker({ onDone }: { onDone: () => void }) {
  return (
    <>
      <header>
        <h1>選一個目標</h1>
        <div className="note">點星星，把想換的獎勵釘在最上面。</div>
      </header>
      <main>
        <div className="card">
          <RewardList kid picking />
        </div>
        <button className="btn" onClick={onDone}>
          好了
        </button>
      </main>
    </>
  )
}

function RewardList({ kid, picking }: { kid: boolean; picking?: boolean }) {
  const { data, run } = useStore()
  const bal = ptBalance(data)
  const goal = data.ptState?.goal ?? null
  const waiting = new Set(pendingReqs(data).map((q) => q.reward_id))
  return (
    <>
      {rewardGroups(activeRewards(data)).map((g) => (
        <div key={g.pts}>
          <div className="pttier">{g.pts} 點</div>
          {g.items.map((r) => (
            <div className="line" key={r.id}>
              <div className="tt">
                <b>{r.title}</b>
                {r.sub ? <small>{r.sub}</small> : null}
              </div>
              {kid ? (
                <>
                  {!picking && waiting.has(r.id) ? <span className="tag">等同意</span> : null}
                  {!picking && !waiting.has(r.id) && bal >= r.pts ? (
                    <button className="linkbtn" onClick={() => run({ t: 'pt-req', id: newId(), kind: 'redeem', item_id: null, reward_id: r.id, title: r.title, own: false, pts: r.pts, at: now() })}>
                      換
                    </button>
                  ) : null}
                  <button
                    className="ptstar"
                    aria-pressed={goal === r.id}
                    aria-label={goal === r.id ? `取消目標：${r.title}` : `設為目標：${r.title}`}
                    onClick={() => run({ t: 'pt-goal', goal: goal === r.id ? null : r.id })}
                  >
                    ★
                  </button>
                </>
              ) : (
                <RewardPts r={r} />
              )}
            </div>
          ))}
        </div>
      ))}
      {!data.ptRewards.length ? <div className="empty">獎勵還沒載入。</div> : null}
    </>
  )
}

function RewardPts({ r }: { r: PtReward }) {
  const { run } = useStore()
  const [v, setV] = useState(String(r.pts))
  const [err, setErr] = useState(false)
  const commit = () => {
    const n = Number(v)
    if (!/^\d+$/.test(v) || n < 1 || n > 1000) return setErr(true)
    setErr(false)
    if (n !== r.pts) run({ t: 'pt-reward', id: r.id, pts: n })
  }
  return (
    <label className="ptpts">
      <input
        className={`input ${err ? 'bad' : ''}`}
        id={`rp-${r.id}`}
        inputMode="numeric"
        value={v}
        aria-label={`${r.title} 要幾點`}
        aria-invalid={err}
        onChange={(e) => setV(e.target.value.replace(/\D/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      點
    </label>
  )
}

function HelpForm({ onClose }: { onClose: () => void }) {
  const { data, run } = useStore()
  const today = taipeiToday()
  const [item, setItem] = useState<string | null>(null)
  const [own, setOwn] = useState('')
  const [err, setErr] = useState('')
  const left = ownLeft(today, data)
  const items = data.ptItems.filter((i) => i.active).sort((a, b) => a.sort - b.sort)
  return (
    <form
      className="card pad ptsheet"
      onSubmit={(e) => {
        e.preventDefault()
        const w = own.trim()
        if (w) {
          if (w.length > 40) return setErr('請寫短一點（40 字以內）')
          if (!left) return setErr(`自己寫的這週已經用完 ${OWN_PER_WEEK} 次了`)
          run({ t: 'pt-req', id: newId(), kind: 'help', item_id: null, reward_id: null, title: w, own: true, pts: 0, at: now() })
        } else {
          const it = items.find((i) => i.id === item)
          if (!it) return setErr('先選做了哪一件，或自己寫')
          run({ t: 'pt-req', id: newId(), kind: 'help', item_id: it.id, reward_id: null, title: it.title, own: false, pts: 0, at: now() })
        }
        onClose()
      }}
    >
      <b className="pth3">我主動多做了什麼？</b>
      <div className="pills">
        {items.map((i) => {
          const used = itemUsed(i.id, today, data)
          return (
            <button
              type="button"
              key={i.id}
              className="pill ptpill"
              aria-pressed={item === i.id}
              disabled={used}
              onClick={() => {
                setItem(i.id)
                setOwn('')
                setErr('')
              }}
            >
              {i.title}
              {used ? '・下週一再來' : ''}
            </button>
          )
        })}
      </div>
      {left ? (
        <input
          className="input"
          id="pt-own"
          placeholder={`清單裡沒有？自己寫（這週還能寫 ${left} 次）`}
          autoComplete="off"
          value={own}
          onChange={(e) => {
            setOwn(e.target.value)
            if (e.target.value) setItem(null)
            setErr('')
          }}
        />
      ) : (
        <div className="note">自己寫的這週已經用完 {OWN_PER_WEEK} 次了。</div>
      )}
      <div className="note">每天今日事的任務、掃地拖地、煮飯是本分，不算。每項一週一次，每週一重新開始。媽媽們確認後才加點。</div>
      <div className="err" role="alert">
        {err}
      </div>
      <div className="grid2">
        <button type="button" className="btn ghost" onClick={onClose}>
          取消
        </button>
        <button className="btn pt">送給媽媽們</button>
      </div>
    </form>
  )
}

function History() {
  const { data } = useStore()
  const today = taipeiToday()
  const rows = history(data).slice(0, 30)
  if (!rows.length) return <div className="empty">還沒有紀錄，從 0 點開始。</div>
  return (
    <>
      {rows.map((r) => (
        <div className="line" key={r.id}>
          <div className="tt">
            <b>{r.text}</b>
            <small>
              {stamp(r.at, today)}
              {r.note ? `・${r.note}` : ''}
            </small>
          </div>
          {r.pts ? <span className={`amt ${r.pts > 0 ? 'plus' : 'minus'}`}>{r.pts > 0 ? `+${r.pts}` : `−${-r.pts}`}</span> : null}
        </div>
      ))}
    </>
  )
}


function MomPoints() {
  const { data } = useStore()
  const pend = pendingReqs(data)
  const ow = owed(data)
  const [bonus, setBonus] = useState(false)
  return (
    <>
      <header>
        <h1>點數</h1>
      </header>
      <main>
        <SyncNotes />
        <GoalCard kid={false} />
        <WeekRow />
        <section className="card">
          <div className="pthd">
            要你們確認<span>{pend.length} 件</span>
          </div>
          {pend.length ? (
            pend.map((q) => <Decide key={q.id} q={q} />)
          ) : (
            <div className="empty ptempty">沒有要確認的。樂樂按「我主動多做了」或想換獎勵時，會出現在這裡。</div>
          )}
        </section>
        {ow.length ? (
          <section className="card">
            <div className="pthd">
              答應了，還沒兌現<span>{ow.length} 件</span>
            </div>
            {ow.map((q) => (
              <Deliver key={q.id} q={q} />
            ))}
          </section>
        ) : null}
        {bonus ? (
          <BonusForm onClose={() => setBonus(false)} />
        ) : (
          <button className="btn ghost" onClick={() => setBonus(true)}>
            ＋ 驚喜加分
          </button>
        )}
        <Fold title="加分清單" hint="每週一重新開始">
          <ItemsEditor />
        </Fold>
        <Fold title="獎勵和點數" hint="可以改點數">
          <RewardList kid={false} />
        </Fold>
        <Fold title="規則">
          <ul className="ptrules">
            <li>每天的任務是本分，不給點</li>
            <li>
              一週裡 {WEEK_GOAL} 天全做完 +{WEEK_BONUS}，加分清單一項 +{HELP_PTS}（每項一週一次）
            </li>
            <li>樂樂自己寫的一週 {OWN_PER_WEEK} 次，你們決定給幾點</li>
            <li>貼心的事不讓她申請，由你們發現了用驚喜加分</li>
            <li>點數不會被扣，做錯事另外處理</li>
            <li>讀書成績不給點，點數不能換錢</li>
            <li>答應的獎勵一定要兌現，做到了再按「做到了」</li>
          </ul>
        </Fold>
        <Fold title="點數紀錄">
          <History />
        </Fold>
      </main>
    </>
  )
}

function Decide({ q }: { q: PtReq }) {
  const { data, run } = useStore()
  const today = taipeiToday()
  const [when, setWhen] = useState('')
  const bal = ptBalance(data)
  const d = (give: number | null, duty = false) => run({ t: 'pt-decide', id: q.id, give, duty, when, at: now() })
  if (q.kind === 'redeem')
    return (
      <div className="ptreq">
        <div className="tt">
          <b>想換：{q.title}</b>
          <small>
            {stamp(q.created_at, today)}・{q.pts} 點，同意後要約時間
          </small>
        </div>
        {q.pts > bal ? <div className="err">樂樂的點數不夠了</div> : null}
        <input className="input" id={`when-${q.id}`} placeholder="約什麼時候？例如：這週六晚上" autoComplete="off" maxLength={30} value={when} onChange={(e) => setWhen(e.target.value)} />
        <div className="grid2">
          <button className="btn ghost" onClick={() => d(null)}>
            再等等
          </button>
          <button className="btn pt" disabled={q.pts > bal} onClick={() => d(q.pts)}>
            同意
          </button>
        </div>
      </div>
    )
  if (q.own)
    return (
      <div className="ptreq">
        <div className="tt">
          <b>樂樂自己寫：{q.title}</b>
          <small>{stamp(q.created_at, today)}・你們決定給幾點</small>
        </div>
        <div className="ptacts">
          <button className="btn pt" onClick={() => d(5)}>
            +5
          </button>
          <button className="btn pt" onClick={() => d(10)}>
            +10
          </button>
          <button className="btn ghost" onClick={() => d(null, true)}>
            謝謝你，這是本分喔
          </button>
        </div>
      </div>
    )
  return (
    <div className="line">
      <div className="tt">
        <b>{q.title}</b>
        <small>
          {stamp(q.created_at, today)}・確認後 +{HELP_PTS}
        </small>
      </div>
      <button className="btn pt sm" onClick={() => d(HELP_PTS)}>
        確認
      </button>
      <button className="btn ghost sm" onClick={() => d(null)}>
        還不算
      </button>
    </div>
  )
}

function Deliver({ q }: { q: PtReq }) {
  const { run } = useStore()
  const today = taipeiToday()
  return (
    <div className="line">
      <div className="tt">
        <b>{q.title}</b>
        <small>
          {q.decided_at ? `${stamp(q.decided_at, today)} 同意` : ''}
          {q.when_text ? `・約好 ${q.when_text}` : ''}
        </small>
      </div>
      <button className="btn pt sm" onClick={() => run({ t: 'pt-deliver', id: q.id, at: now() })}>
        做到了
      </button>
    </div>
  )
}

const KIND = ['媽媽們累的時候主動按摩、倒水', '家人生病時主動照顧']

function BonusForm({ onClose }: { onClose: () => void }) {
  const { run } = useStore()
  const [why, setWhy] = useState('')
  const [amt, setAmt] = useState(10)
  const [err, setErr] = useState('')
  return (
    <form
      className="card pad"
      onSubmit={(e) => {
        e.preventDefault()
        const w = why.trim()
        if (!w) return setErr('寫一句原因，樂樂才知道是哪件事被看見')
        if (w.length > 60) return setErr('請寫短一點（60 字以內）')
        run({ t: 'pt-bonus', id: newId(), pts: amt, why: w, at: now() })
        onClose()
      }}
    >
      <b className="pth3">驚喜加分</b>
      <div className="note">貼心的事不讓她自己申請，由你們發現了再加，她才知道是被看見，而不是去換點數。</div>
      <div className="pills">
        {KIND.map((k) => (
          <button type="button" key={k} className="pill ptpill" aria-pressed={why === k} onClick={() => setWhy(k)}>
            {k}
          </button>
        ))}
      </div>
      <input className="input" id="pt-why" placeholder="或自己寫，例如：今天主動幫忙收攤" autoComplete="off" value={why} onChange={(e) => (setWhy(e.target.value), setErr(''))} />
      <div className="pills" role="group" aria-label="加幾點">
        {[5, 10, 20].map((a) => (
          <button type="button" key={a} className="pill ptpill" aria-pressed={amt === a} onClick={() => setAmt(a)}>
            +{a}
          </button>
        ))}
      </div>
      <div className="err" role="alert">
        {err}
      </div>
      <div className="grid2">
        <button type="button" className="btn ghost" onClick={onClose}>
          取消
        </button>
        <button className="btn pt">加分</button>
      </div>
    </form>
  )
}

const isDuty = (title: string, s: Snapshot) => {
  const t = title.replace(/\s/g, '')
  return DUTY_WORDS.some((w) => t.includes(w)) || s.tasks.some((k) => k.active && (t.includes(k.title.replace(/\s/g, '')) || k.title.replace(/\s/g, '').includes(t)))
}

function ItemsEditor() {
  const { data, run } = useStore()
  const [title, setTitle] = useState('')
  const [err, setErr] = useState('')
  const [confirm, setConfirm] = useState<string | null>(null)
  const items = data.ptItems.filter((i) => i.active).sort((a, b) => a.sort - b.sort)
  return (
    <>
      <div className="note ptin">樂樂只能從這裡選，或一週自己寫 {OWN_PER_WEEK} 次。今日事每天的任務、掃地拖地、煮飯是本分，加不進來。</div>
      {items.map((i) => (
        <div className="line" key={i.id}>
          <div className="tt">
            <b>{i.title}</b>
            <small>+{HELP_PTS}・一週一次</small>
          </div>
          <button
            className="linkbtn danger"
            onClick={() => (confirm === i.id ? (run({ t: 'pt-item', id: i.id, title: i.title, active: false, sort: i.sort, isNew: false }), setConfirm(null)) : setConfirm(i.id))}
          >
            {confirm === i.id ? '確定移除' : '移除'}
          </button>
        </div>
      ))}
      <form
        className="ptadd"
        onSubmit={(e) => {
          e.preventDefault()
          const t = title.trim()
          if (!t) return setErr('寫要加哪一項')
          if (t.length > 30) return setErr('請寫短一點（30 字以內）')
          if (isDuty(t, data)) return setErr('這是每天的本分，不能放進加分清單')
          if (items.some((i) => i.title === t)) return setErr('清單裡已經有了')
          run({ t: 'pt-item', id: newId(), title: t, active: true, sort: (items.at(-1)?.sort ?? 0) + 10, isNew: true })
          setTitle('')
        }}
      >
        <input className="input" id="pt-new-item" placeholder="新增一項" autoComplete="off" value={title} onChange={(e) => (setTitle(e.target.value), setErr(''))} />
        <button className="btn pt">新增</button>
      </form>
      <div className="err ptin" role="alert">
        {err}
      </div>
    </>
  )
}

/** 第一頁的一行：樂樂看目標進度；媽媽們只在有事要處理時看到 */
export function PointsLine({ onOpen }: { onOpen: () => void }) {
  const { data, role } = useStore()
  if (!data.ptState) return null
  let text = ''
  if (role === 'kid') {
    const bal = ptBalance(data)
    const goal = activeRewards(data).find((r) => r.id === data.ptState?.goal)
    const news = kidNews(data).length
    text = news ? `媽媽們回覆了 ${news} 件` : goal ? `${goal.title}：${bal >= goal.pts ? '點數夠了，可以換了' : `還差 ${goal.pts - bal} 點`}` : `${bal} 點・選一個目標開始存`
  } else {
    const help = pendingReqs(data).filter((q) => q.kind === 'help').length
    const red = pendingReqs(data).filter((q) => q.kind === 'redeem').length
    const ow = owed(data).length
    const parts = [help ? `樂樂想加分 ${help} 件` : '', red ? `樂樂想換獎勵 ${red} 件` : '', ow ? `答應了還沒兌現 ${ow} 件` : ''].filter(Boolean)
    if (!parts.length) return null
    text = parts.join('・')
  }
  return (
    <button className="ptline" onClick={onOpen}>
      <span className="tt">
        <small>點數</small>
        <b>{text}</b>
      </span>
      <span className="chev" aria-hidden="true">
        ›
      </span>
    </button>
  )
}
