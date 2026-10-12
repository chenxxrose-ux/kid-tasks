// 日期一律以台灣時間計算，字串格式 YYYY-MM-DD；跟手機設定的時區無關
const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export function taipei(d: Date = new Date()) {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]))
  return { day: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, hour: Number(p.hour), minutes: Number(p.hour) * 60 + Number(p.minute) }
}

export const taipeiToday = () => taipei().day

const utc = (k: string) => {
  const [y, m, d] = k.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10)

export const addDays = (k: string, n: number) => ymd(utc(k) + n * 864e5)
export const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / 864e5)
/** 0 = 星期日 */
export const weekday = (k: string) => new Date(utc(k)).getUTCDay()
export const WK = ['日', '一', '二', '三', '四', '五', '六']
export const md = (k: string) => `${Number(k.slice(5, 7))}/${Number(k.slice(8, 10))}`
export const mdw = (k: string) => `${md(k)}（週${WK[weekday(k)]}）`

/** 時間戳記 → 台灣時間 HH:MM */
export const hmOf = (iso: string) => taipei(new Date(iso)).hm
/** 時間戳記 → 台灣日期 */
export const dayOf = (iso: string) => taipei(new Date(iso)).day
/** 留言、存錢筒用：今天只寫時間，其他天寫日期＋時間 */
export function stamp(iso: string, today: string) {
  const t = taipei(new Date(iso))
  return t.day === today ? t.hm : `${md(t.day)} ${t.hm}`
}

/** 那一週（星期日開始）的七天 */
export function weekOf(k: string) {
  const start = addDays(k, -weekday(k))
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}
