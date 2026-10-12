import { useState } from 'react'
import { supabase, configured } from '../data/supabase'

export function Login() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="login"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!email.trim() || !pw) return setErr('請填 Email 和密碼')
        if (!navigator.onLine) return setErr('現在沒有網路，第一次登入需要網路')
        setBusy(true)
        setErr('')
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw })
        setBusy(false)
        if (error) setErr(/invalid/i.test(error.message) ? 'Email 或密碼不對' : `登入失敗：${error.message}`)
      }}
    >
      <div>
        <h1>今日事</h1>
        <div className="note">登入一次，之後這支手機會一直記得。</div>
      </div>
      {!configured ? <div className="problem">網站還沒設定好資料庫。</div> : null}
      <div className="field">
        <label htmlFor="email">Email</label>
        <input className="input" id="email" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="pw">密碼</label>
        <input className="input" id="pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      </div>
      <div className="err" role="alert">
        {err}
      </div>
      <button className="btn" disabled={busy}>
        {busy ? '登入中…' : '登入'}
      </button>
    </form>
  )
}
