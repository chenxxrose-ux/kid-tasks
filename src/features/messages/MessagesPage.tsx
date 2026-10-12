import { useEffect, useRef, useState } from 'react'
import { newId, useStore } from '../data/store'
import { stamp, taipeiToday } from '../../lib/dates'
import { Arrow } from '../../ui/icons'
import { SyncNotes } from '../../ui/kit'
import { NAMES } from '../../ui/names'

export function MessagesPage() {
  const { data, role, run } = useStore()
  const [v, setV] = useState('')
  const [err, setErr] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const today = taipeiToday()
  const count = data.messages.length
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [count])
  if (!role) return null

  return (
    <>
      <header>
        <h1>留言</h1>
        <div className="note">{role === 'kid' ? '想跟媽媽們說什麼都可以' : '樂樂和媽媽們的對話'}</div>
      </header>
      <main>
        <SyncNotes />
        <div className="msgs">
          {data.messages.length ? (
            data.messages.map((m) => (
              <div key={m.id} className={`bub ${m.role === role ? 'me' : ''}`}>
                {m.body}
                <small>
                  {NAMES[m.role]} · {stamp(m.created_at, today)}
                </small>
              </div>
            ))
          ) : (
            <div className="empty">還沒有留言。</div>
          )}
          <div ref={end} />
        </div>
        <form
          className="compose"
          onSubmit={(e) => {
            e.preventDefault()
            const body = v.trim()
            if (!body) return
            if (body.length > 500) return setErr('太長了，請分成幾則（500 字以內）')
            const at = new Date().toISOString()
            run({ t: 'read', role, at })
            run({ t: 'msg', id: newId(), role, body, at })
            setV('')
            setErr('')
          }}
        >
          <label className="sr" htmlFor="msg">
            留言
          </label>
          <input
            className="input"
            id="msg"
            placeholder={role === 'kid' ? '寫給媽媽們' : '寫給樂樂'}
            autoComplete="off"
            enterKeyHint="send"
            value={v}
            onChange={(e) => setV(e.target.value)}
          />
          <button className="round" aria-label="送出" disabled={!v.trim()}>
            <Arrow />
          </button>
        </form>
        <div className="err" role="alert">
          {err}
        </div>
      </main>
    </>
  )
}
