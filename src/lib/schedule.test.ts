import { describe, expect, it } from 'vitest'
import { apply, applyAll } from './apply'
import { BUNDLED_HOLIDAYS as H, dayNote, parseHolidayJson, ruleDay } from './calendar'
import { addDays, taipei, weekOf } from './dates'
import { balance, dueText, examSoon, nextExam, progress, shouldLogVisit, streak, tasksFor, teacherItems, unread } from './schedule'
import { emptySnapshot, type Snapshot } from './types'

const base = (): Snapshot => ({
  ...emptySnapshot(),
  tasks: [
    { id: 'desk', title: '書桌', slot: 'morning', days: [0, 1, 2, 3, 4, 5, 6], active: true, sort: 1 },
    { id: 'lunchbox', title: '餐盒洗好', slot: 'home', days: [1, 2, 3, 4, 5], active: true, sort: 2 },
    { id: 'old', title: '停用的', slot: 'home', days: [0, 1, 2, 3, 4, 5, 6], active: false, sort: 3 },
  ],
})

describe('日期與假日', () => {
  it('台灣時間', () => {
    expect(taipei(new Date('2026-10-11T16:30:00Z'))).toMatchObject({ day: '2026-10-12', hm: '00:30', hour: 0 })
  })
  it('一週從星期日開始', () => {
    expect(weekOf('2026-10-14')).toEqual(['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'])
  })
  it('平日放假照星期日的清單，也不用洗餐盒', () => {
    expect(ruleDay('2026-10-26', H)).toBe(0) // 光復節補假（週一）
    expect(ruleDay('2026-11-16', H)).toBe(0) // 校慶補假
    expect(ruleDay('2026-10-27', H)).toBe(2)
    expect(tasksFor('2026-10-26', base(), H).map((t) => t.id)).toEqual(['desk'])
    expect(tasksFor('2026-10-27', base(), H).map((t) => t.id)).toEqual(['desk', 'lunchbox'])
  })
  it('放假的說明：媽媽們多看到「照假日的清單」', () => {
    expect(dayNote('2026-10-26', H, false)).toBe('光復節補假，放假')
    expect(dayNote('2026-10-26', H, true)).toBe('光復節補假，放假・照假日的清單')
    expect(dayNote('2026-10-13', H, false)).toBe('沒補習，做完就是自己的時間')
  })
  it('讀下載的國定假日', () => {
    expect(parseHolidayJson([{ date: '20280101', isHoliday: true, description: '開國紀念日' }, { date: '20280102', isHoliday: true, description: '' }])).toEqual({
      '2028-01-01': '開國紀念日',
    })
    expect(parseHolidayJson('壞掉')).toEqual({})
  })
})

describe('老師說', () => {
  const t = (id: string, day: string, due: string | null) =>
    ({ t: 'ask', id, day, title: id, at: `${day}T01:00:00.000Z`, source: 'teacher', due }) as const
  it('做完前一直留著，不算進每天的進度；期限近的排前面', () => {
    const s = applyAll(base(), [t('直笛', '2026-10-12', null), t('習作', '2026-10-12', '2026-10-16'), t('簽名', '2026-10-13', '2026-10-14')])
    expect(tasksFor('2026-10-12', s, H).map((x) => x.id)).toEqual(['desk', 'lunchbox'])
    expect(teacherItems('2026-10-12', s).map((x) => x.title)).toEqual(['習作', '直笛']) // 明天寫的還不會出現
    expect(teacherItems('2026-10-14', s).map((x) => x.title)).toEqual(['簽名', '習作', '直笛'])
  })
  it('打勾後樂樂那邊消失；媽媽們再看 7 天', () => {
    const s = applyAll(base(), [t('習作', '2026-10-12', '2026-10-16'), { t: 'check', day: '2026-10-13', task_id: 'tch:習作', checked_at: '2026-10-13T11:00:00.000Z' }])
    expect(teacherItems('2026-10-13', s)[0].doneDay).toBe('2026-10-13')
    expect(teacherItems('2026-10-14', s)).toEqual([])
    expect(teacherItems('2026-10-20', s, 7)).toHaveLength(1)
    expect(teacherItems('2026-10-21', s, 7)).toHaveLength(0)
  })
  it('期限的寫法', () => {
    expect(dueText(null, '2026-10-12')).toBeNull()
    expect(dueText('2026-10-12', '2026-10-12')?.text).toBe('今天到期')
    expect(dueText('2026-10-13', '2026-10-12')?.text).toBe('明天到期')
    expect(dueText('2026-10-16', '2026-10-12')?.text).toBe('10/16（週五）到期')
    expect(dueText('2026-10-11', '2026-10-12')).toEqual({ text: '10/11 到期，已經過了', tone: 'late' })
  })
})

describe('交代、段考複習、進度', () => {
  it('交代的排最前面，段考前 7 天多一項複習', () => {
    let s = base()
    s = apply(s, { t: 'ask', id: 'a1', day: '2026-10-12', title: '倒垃圾', at: '2026-10-12T00:00:00.000Z' })
    s = { ...s, exams: [{ id: 'e', day: '2026-10-13', title: '第 1 次段考', subjects: '' }] }
    expect(tasksFor('2026-10-12', s, H).map((t) => t.id)).toEqual(['ask:a1', 'exam-review', 'desk', 'lunchbox'])
    expect(examSoon('2026-10-13', s.exams)).toBe(false) // 考試當天不用
    expect(examSoon('2026-10-05', s.exams)).toBe(false) // 8 天前還不用
  })
  it('拿掉的交代不顯示', () => {
    let s = apply(base(), { t: 'ask', id: 'a1', day: '2026-10-12', title: '倒垃圾', at: '2026-10-12T00:00:00.000Z' })
    s = apply(s, { t: 'unask', id: 'a1', at: '2026-10-12T01:00:00.000Z' })
    expect(tasksFor('2026-10-12', s, H).map((t) => t.id)).toEqual(['desk', 'lunchbox'])
  })
  it('打勾、取消、連續全部完成的天數', () => {
    const s = applyAll(base(), [
      { t: 'check', day: '2026-10-10', task_id: 'desk', checked_at: '2026-10-10T00:00:00.000Z' },
      { t: 'check', day: '2026-10-11', task_id: 'desk', checked_at: '2026-10-11T00:00:00.000Z' },
      { t: 'check', day: '2026-10-12', task_id: 'desk', checked_at: '2026-10-12T00:00:00.000Z' },
      { t: 'check', day: '2026-10-12', task_id: 'lunchbox', checked_at: '2026-10-12T01:00:00.000Z' },
      { t: 'check', day: '2026-10-12', task_id: 'lunchbox', checked_at: '2026-10-12T02:00:00.000Z' },
    ])
    expect(progress('2026-10-12', s, H)).toEqual({ done: 2, total: 2 })
    expect(streak('2026-10-12', s, H)).toBe(3) // 10/10 週六、10/11 週日只有書桌
    const undone = apply(s, { t: 'uncheck', day: '2026-10-12', task_id: 'lunchbox' })
    expect(progress('2026-10-12', undone, H)).toEqual({ done: 1, total: 2 })
    expect(streak('2026-10-12', undone, H)).toBe(2) // 今天還沒做完，從昨天往回算
  })
})

describe('考試卡', () => {
  it('列出同一場考試的每一天', () => {
    const exams = [
      { id: '1', day: '2026-10-14', title: '第 1 次段考', subjects: '數學' },
      { id: '2', day: '2026-10-13', title: '第 1 次段考', subjects: '國文' },
      { id: '3', day: '2026-11-26', title: '第 2 次段考', subjects: '' },
    ]
    const n = nextExam('2026-10-12', exams)!
    expect(n.inDays).toBe(1)
    expect(n.days.map((d) => d.subjects)).toEqual(['國文', '數學'])
    expect(nextExam('2026-10-14', exams)!.days.map((d) => d.day)).toEqual(['2026-10-14'])
    expect(nextExam('2027-12-01', exams)).toBeNull()
  })
})

describe('留言未讀', () => {
  it('看自己身分的已讀時間，按「知道了」後清掉', () => {
    let s = apply(emptySnapshot(), { t: 'msg', id: 'm1', role: 'mom', body: '加油', at: '2026-10-12T01:00:00.000Z' })
    s = apply(s, { t: 'msg', id: 'm2', role: 'kid', body: '好', at: '2026-10-12T02:00:00.000Z' })
    expect(unread('kid', s.messages, s.reads).map((m) => m.id)).toEqual(['m1'])
    expect(unread('mom', s.messages, s.reads).map((m) => m.id)).toEqual(['m2'])
    s = apply(s, { t: 'read', role: 'kid', at: '2026-10-12T03:00:00.000Z' })
    expect(unread('kid', s.messages, s.reads)).toEqual([])
    s = apply(s, { t: 'read', role: 'kid', at: '2026-10-12T00:00:00.000Z' }) // 舊的已讀不會蓋掉新的
    expect(unread('kid', s.messages, s.reads)).toEqual([])
  })
})

describe('存錢筒', () => {
  it('存入、申請、同意、不同意、取消', () => {
    let s = apply(emptySnapshot(), { t: 'bank', id: 'b1', kind: 'in', amount: 1000, memo: '紙本帳轉入', at: '2026-10-12T00:00:00.000Z' })
    s = apply(s, { t: 'bank', id: 'b2', kind: 'out', amount: 300, memo: '買書', at: '2026-10-12T01:00:00.000Z' })
    expect(balance(s)).toBe(1000)
    s = apply(s, { t: 'decide', id: 'b2', approve: true, at: '2026-10-12T02:00:00.000Z' })
    expect(balance(s)).toBe(700)
    s = apply(s, { t: 'bank', id: 'b3', kind: 'out', amount: 100, memo: '飲料', at: '2026-10-12T03:00:00.000Z' })
    s = apply(s, { t: 'cancel', id: 'b3', at: '2026-10-12T04:00:00.000Z' })
    s = apply(s, { t: 'decide', id: 'b3', approve: true, at: '2026-10-12T05:00:00.000Z' }) // 取消後不能再同意
    expect(balance(s)).toBe(700)
  })
})

describe('打開網頁的紀錄', () => {
  it('5 分鐘內重複打開算同一次', () => {
    const s = apply(emptySnapshot(), { t: 'visit', id: 'v', at: '2026-10-12T10:00:00.000Z' })
    expect(shouldLogVisit(s, new Date('2026-10-12T10:04:00Z'))).toBe(false)
    expect(shouldLogVisit(s, new Date('2026-10-12T10:05:00Z'))).toBe(true)
    expect(shouldLogVisit(emptySnapshot(), new Date())).toBe(true)
  })
  it('跨日計算', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})
