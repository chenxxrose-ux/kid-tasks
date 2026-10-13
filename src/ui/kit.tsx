import { useStore } from '../features/data/store'
import { unread } from '../lib/schedule'
import { hmOf, stamp, taipeiToday } from '../lib/dates'
import { NAMES } from './names'

/** 新留言：每一頁最上面一行，按「知道了」或回覆才消失 */
export function MsgBanner({ onReply }: { onReply: () => void }) {
  const { data, role, run } = useStore()
  if (!role) return null
  const un = unread(role, data.messages, data.reads)
  if (!un.length) return null
  const m = un[un.length - 1]
  const other = NAMES[m.role]
  return (
    <div className="mban" role="status">
      <span className="mdot" aria-hidden="true" />
      <button className="mtxt" onClick={onReply} aria-label={`${other}的新留言：${m.body}，去回覆`}>
        <b>
          {other}
          {un.length > 1 ? ` ${un.length} 則` : ''}：
        </b>
        {m.body}
      </button>
      <button className="mok" onClick={() => run({ t: 'read', role, at: new Date().toISOString() })}>
        知道了
      </button>
    </div>
  )
}

/** 離線、還沒送出、送不出去的提示 */
export function SyncNotes() {
  const { online, pending, syncedAt, problems, dismissProblem, loadError } = useStore()
  return (
    <>
      {!online ? (
        <div className="sync off" role="status">
          <span className="s" aria-hidden="true" />
          <span>
            離線中・{pending ? `${pending} 件先存在手機，有網路會自動送出` : '打勾會先存在手機'}
            {syncedAt ? `（資料是 ${stamp(syncedAt, taipeiToday())} 的）` : ''}
          </span>
        </div>
      ) : pending ? (
        <div className="sync" role="status">
          <span className="s" aria-hidden="true" />
          <span>正在送出 {pending} 件…</span>
        </div>
      ) : null}
      {loadError ? (
        <div className="problem" role="alert">
          <span>資料讀不到：{loadError}</span>
        </div>
      ) : null}
      {problems.map((p) => (
        <div className="problem" role="alert" key={p.id}>
          <span>{p.text}</span>
          <button onClick={() => dismissProblem(p.id)} aria-label="關掉這個提示">
            ✕
          </button>
        </div>
      ))}
    </>
  )
}

export const money = (n: number) => `NT$ ${n.toLocaleString('zh-TW')}`
export { hmOf }

/** 拿掉：按一次問「確定拿掉」，再按一次才拿掉 */
export function RemoveLink({ confirm, onAsk, onRemove }: { confirm: boolean; onAsk: () => void; onRemove: () => void }) {
  return (
    <button type="button" className="linkbtn danger" style={{ alignSelf: 'flex-start' }} onClick={confirm ? onRemove : onAsk}>
      {confirm ? '確定拿掉' : '拿掉這件'}
    </button>
  )
}

/** 標題列右邊的「＋」：清單有東西時，新增按鈕放這裡，不多佔一行 */
export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="hadd" onClick={onClick} aria-label={label}>
      ＋ 新增
    </button>
  )
}

/** 清單空的時候只留這一行 */
export function AddRow({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <div className="task">
      <button className="tbtn" onClick={onClick} aria-label={label}>
        <span className="box" style={{ borderStyle: 'dashed' }} />
        <span className="tt">
          <b className="addlink">{children}</b>
        </span>
      </button>
    </div>
  )
}
