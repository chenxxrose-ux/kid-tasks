import { weekday } from './dates'

// 國定假日：行政院人事行政總處辦公日曆表，資料取自 github.com/ruyut/TaiwanCalendar（2026-10-11 取得）。
// 之後的年份由 loadHolidays() 從同一個來源下載並存在手機裡。
export const HOLIDAY_SOURCE = '行政院人事行政總處辦公日曆表（經 github.com/ruyut/TaiwanCalendar）'
export const BUNDLED_HOLIDAYS: Record<string, string> = {"2026-01-01": "開國紀念日", "2026-02-15": "小年夜", "2026-02-16": "農曆除夕", "2026-02-17": "春節", "2026-02-18": "春節", "2026-02-19": "春節", "2026-02-20": "春節補假", "2026-02-27": "和平紀念日補假", "2026-02-28": "和平紀念日", "2026-04-03": "兒童節補假", "2026-04-04": "兒童節", "2026-04-05": "清明節", "2026-04-06": "清明節補假", "2026-05-01": "勞動節", "2026-06-19": "端午節", "2026-09-25": "中秋節", "2026-09-28": "教師節", "2026-10-09": "國慶日補假", "2026-10-10": "國慶日", "2026-10-25": "光復節", "2026-10-26": "光復節補假", "2026-12-25": "行憲紀念日", "2027-01-01": "開國紀念日", "2027-02-04": "小年夜", "2027-02-05": "農曆除夕", "2027-02-06": "春節", "2027-02-07": "春節", "2027-02-08": "春節", "2027-02-09": "春節補假", "2027-02-10": "春節補假", "2027-02-28": "和平紀念日", "2027-03-01": "和平紀念日補假", "2027-04-04": "兒童節", "2027-04-05": "清明節", "2027-04-06": "兒童節補假", "2027-04-30": "勞動節補假", "2027-05-01": "勞動節", "2027-06-09": "端午節", "2027-09-15": "中秋節", "2027-09-28": "教師節", "2027-10-10": "國慶日", "2027-10-11": "國慶日補假", "2027-10-25": "光復節", "2027-12-24": "行憲紀念日補假", "2027-12-25": "行憲紀念日", "2027-12-31": "開國紀念日補假"}

// 學校行事曆：115 學年度第一學期（家長提供的教務處 0815 版）。段考日期另外放在資料庫，讓媽媽們可以改。
export const SCHOOL_SOURCE = '學校 115 學年度第一學期行事曆（教務處 0815 版）'
type SchoolDay = { n: string[]; off?: boolean }
const S = (n: string, off = false): SchoolDay => ({ n: [n], off })
const range = (from: string, to: string, v: SchoolDay) => {
  const out: Record<string, SchoolDay> = {}
  for (let t = Date.parse(from); t <= Date.parse(to); t += 864e5) out[new Date(t).toISOString().slice(0, 10)] = v
  return out
}
export const SCHOOL: Record<string, SchoolDay> = {
  '2026-10-16': S('科學園遊會'),
  '2026-10-17': S('科學園遊會'),
  ...range('2026-10-19', '2026-10-23', S('作業抽查週')),
  '2026-10-22': { n: ['作業抽查週', '流感疫苗施打'] },
  '2026-11-13': S('校慶'),
  '2026-11-14': S('校慶（週六要到校）'),
  '2026-11-16': S('校慶補假（暫定）', true),
  ...range('2026-11-30', '2026-12-04', S('作業抽查週')),
  '2026-12-11': S('國一健檢'),
  '2027-01-20': S('休業式'),
  ...range('2027-01-21', '2027-02-10', S('寒假', true)),
  '2027-02-11': S('開學'),
}

export type Holidays = Record<string, string>

export const isOff = (k: string, hol: Holidays) => Boolean(hol[k] || SCHOOL[k]?.off)

/** 平日遇到國定假日或學校放假，照星期日（假日）的清單 */
export function ruleDay(k: string, hol: Holidays) {
  const w = weekday(k)
  return isOff(k, hol) && w >= 1 && w <= 5 ? 0 : w
}

const DAY_NOTE: Record<number, string> = {
  1: '有補習，做完每天的事就好',
  2: '沒補習，做完就是自己的時間',
  3: '有補習，做完每天的事就好',
  4: '有補習，做完每天的事就好',
  5: '補習到 20:30，整理好早點休息',
  6: '早上補習，其他時間自己安排',
  0: '假日，把週一要的東西準備好',
}

export function dayNote(k: string, hol: Holidays, forMoms: boolean) {
  const parts: string[] = []
  if (hol[k]) parts.push(`${hol[k]}，放假`)
  if (SCHOOL[k]) parts.push(...SCHOOL[k].n.filter((x) => x !== '寒假' || !hol[k]))
  if (!parts.length) return DAY_NOTE[weekday(k)]
  if (forMoms && ruleDay(k, hol) !== weekday(k)) parts.push('照假日的清單')
  return parts.join('・')
}

/** 下載的國定假日格式（ruyut/TaiwanCalendar）：[{ date: '20260101', isHoliday: true, description: '開國紀念日' }] */
export function parseHolidayJson(rows: unknown): Holidays {
  const out: Holidays = {}
  if (!Array.isArray(rows)) return out
  for (const r of rows as { date?: string; isHoliday?: boolean; description?: string }[]) {
    if (!r?.isHoliday || !r.description || !/^\d{8}$/.test(r.date ?? '')) continue
    const d = r.date as string
    out[`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`] = r.description
  }
  return out
}
