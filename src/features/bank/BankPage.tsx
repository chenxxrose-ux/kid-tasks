import { useState } from 'react'
import { newId, useStore } from '../data/store'
import { balance } from '../../lib/schedule'
import { stamp, taipeiToday } from '../../lib/dates'
import { SyncNotes, money } from '../../ui/kit'
import type { BankRow } from '../../lib/types'

export function BankPage() {
  const { data, role, run } = useStore()
  const [form, setForm] = useState(false)
  if (!role) return null
  const kid = role === 'kid'
  const bal = balance(data)
  const pend = data.bank.filter((b) => b.status === 'pending')
  const hist = data.bank.filter((b) => b.status !== 'pending').slice().reverse()
  const today = taipeiToday()

  return (
    <>
      <header>
        <div className="note">樂樂的存錢筒 · 錢放在媽媽們那邊</div>
        <div className="big">{money(bal)}</div>
      </header>
      <main>
        <SyncNotes />
        {pend.map((p) => (
          <Pending key={p.id} p={p} bal={bal} />
        ))}
        {form ? (
          <BankForm
            kid={kid}
            bal={bal}
            onClose={() => setForm(false)}
            onSave={(amount, memo) => {
              run({ t: 'bank', id: newId(), kind: kid ? 'out' : 'in', amount, memo: kid ? `領錢：${memo}` : memo, at: new Date().toISOString() })
              setForm(false)
            }}
          />
        ) : (
          <button className="btn" onClick={() => setForm(true)}>
            {kid ? '申請領錢' : '記一筆存入'}
          </button>
        )}
        <section className="group">
          <h2>紀錄</h2>
          <div className="card">
            {hist.length ? (
              hist.map((b) => (
                <div className="line" key={b.id}>
                  <div className="tt">
                    <b>{b.memo}</b>
                    <small>{stamp(b.created_at, today)}</small>
                  </div>
                  {b.status !== 'ok' ? (
                    <span className="amt void">{b.status === 'cancelled' ? '取消了' : '沒同意'}</span>
                  ) : (
                    <span className={`amt ${b.kind === 'in' ? 'plus' : 'minus'}`}>
                      {b.kind === 'in' ? '+' : '−'}
                      {b.amount.toLocaleString('zh-TW')}
                    </span>
                  )}
                </div>
              ))
            ) : (
              <div className="empty">{kid ? '還沒有紀錄。' : '還沒有紀錄。第一筆可以記紙本帳上的金額。'}</div>
            )}
          </div>
        </section>
      </main>
    </>
  )
}

function Pending({ p, bal }: { p: BankRow; bal: number }) {
  const { role, run } = useStore()
  const over = p.amount > bal
  const at = () => new Date().toISOString()
  return (
    <div className="card pad pending">
      <div>
        <b>樂樂想領 {money(p.amount)}</b>
        <div className="note">要用在：{p.memo.replace(/^領錢：/, '')}</div>
      </div>
      {role === 'kid' ? (
        <div className="row">
          <span className="note">等媽媽們確認</span>
          <button className="linkbtn" onClick={() => run({ t: 'cancel', id: p.id, at: at() })}>
            取消申請
          </button>
        </div>
      ) : (
        <>
          {over ? <div className="err">超過她現在的金額</div> : null}
          <div className="grid2">
            <button className="btn ghost" onClick={() => run({ t: 'decide', id: p.id, approve: false, at: at() })}>
              不同意
            </button>
            <button className="btn" disabled={over} onClick={() => run({ t: 'decide', id: p.id, approve: true, at: at() })}>
              同意
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function BankForm({ kid, bal, onClose, onSave }: { kid: boolean; bal: number; onClose: () => void; onSave: (amount: number, memo: string) => void }) {
  const [amt, setAmt] = useState('')
  const [why, setWhy] = useState('')
  const [err, setErr] = useState('')
  return (
    <form
      className="card pad"
      onSubmit={(e) => {
        e.preventDefault()
        const raw = amt.replace(/[,\s]/g, '')
        const n = Number(raw)
        const w = why.trim()
        if (!/^\d+$/.test(raw) || !Number.isSafeInteger(n) || n <= 0) return setErr('請輸入大於 0 的整數金額')
        if (n > 10_000_000) return setErr('金額太大了')
        if (!w) return setErr(kid ? '請寫要用在哪裡' : '請寫是什麼錢')
        if (w.length > 50) return setErr('請寫短一點（50 字以內）')
        if (kid && n > bal) return setErr(`超過你現在的 ${money(bal)}`)
        onSave(n, w)
      }}
    >
      <div className="field">
        <label htmlFor="amt">金額</label>
        <input className="input" id="amt" inputMode="numeric" placeholder="NT$" autoComplete="off" autoFocus value={amt} onChange={(e) => setAmt(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="why">{kid ? '要用在哪裡' : '是什麼錢'}</label>
        <input className="input" id="why" placeholder={kid ? '' : '零用錢、紅包、紙本帳轉入…'} autoComplete="off" value={why} onChange={(e) => setWhy(e.target.value)} />
      </div>
      <div className="err" role="alert">
        {err}
      </div>
      <div className="grid2">
        <button type="button" className="btn ghost" onClick={onClose}>
          取消
        </button>
        <button className="btn">{kid ? '送出申請' : '存入'}</button>
      </div>
    </form>
  )
}
