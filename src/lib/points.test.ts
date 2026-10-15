import { describe, expect, it } from 'vitest'
import { apply, applyAll } from './apply'
import { BUNDLED_HOLIDAYS as H } from './calendar'
import { history, itemUsed, kidNews, monday, owed, ownLeft, ptBalance, rewardGroups, weekDots, weeksToAward } from './points'
import { emptySnapshot, type Op, type Snapshot } from './types'

const base = (): Snapshot => ({
  ...emptySnapshot(),
  tasks: [{ id: 'desk', title: '書桌', slot: 'morning', days: [0, 1, 2, 3, 4, 5, 6], active: true, sort: 1 }],
  ptItems: [{ id: 'fridge', title: '整理冰箱', active: true, sort: 1 }],
  ptRewards: [
    { id: 'meal', title: '決定週末某一餐吃什麼', sub: '', pts: 20, active: true, sort: 1 },
    { id: 'book', title: '睡前媽媽陪 20 分鐘', sub: '', pts: 20, active: true, sort: 2 },
    { id: 'wish', title: '一個小願望', sub: '', pts: 100, active: true, sort: 3 },
  ],
  ptState: { goal: null, seen_at: '2026-10-12T00:00:00.000Z' },
})
const tick = (day: string): Op => ({ t: 'check', day, task_id: 'desk', checked_at: `${day}T01:00:00.000Z` })

describe('點數', () => {
  it('一週從星期一開始', () => {
    expect(monday('2026-10-15')).toBe('2026-10-12')
    expect(monday('2026-10-18')).toBe('2026-10-12') // 星期日還是同一週
    expect(monday('2026-10-19')).toBe('2026-10-19')
  })

  it('一週 5 天全做完：漏一天不歸零，第 5 天才記 +10，同一週只記一次', () => {
    let s = applyAll(base(), [tick('2026-10-12'), tick('2026-10-14'), tick('2026-10-15'), tick('2026-10-16')])
    let w = weekDots('2026-10-16', s, H)
    expect(w.days.map((d) => d.state)).toEqual(['on', 'miss', 'on', 'on', 'on', 'todo', 'todo'])
    expect(w).toMatchObject({ done: 4, need: 1, possible: true, awarded: false })
    expect(weeksToAward('2026-10-16', s, H)).toEqual([])

    s = apply(s, tick('2026-10-17'))
    expect(weeksToAward('2026-10-17', s, H)).toEqual(['2026-10-12'])
    s = apply(s, { t: 'pt-streak', id: 'w1', week: '2026-10-12', at: '2026-10-17T02:00:00.000Z' })
    s = apply(s, { t: 'pt-streak', id: 'w2', week: '2026-10-12', at: '2026-10-17T02:00:01.000Z' })
    expect(ptBalance(s)).toBe(10)
    expect(weekDots('2026-10-17', s, H).awarded).toBe(true)
    expect(weeksToAward('2026-10-17', s, H)).toEqual([])
    // 下週一還能補記上週（如果上週沒記到）
    expect(weeksToAward('2026-10-19', applyAll(base(), ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'].map(tick)), H)).toEqual([
      '2026-10-12',
    ])
  })

  it('這週來不及做到 5 天', () => {
    const s = applyAll(base(), [tick('2026-10-12')])
    expect(weekDots('2026-10-15', s, H)).toMatchObject({ done: 1, possible: true }) // 週四到週日還有 4 天
    expect(weekDots('2026-10-16', s, H)).toMatchObject({ done: 1, possible: false })
  })

  it('加分清單每項一週一次；還不算、取消的可以再申請；自己寫的一週 2 次', () => {
    const at = '2026-10-15T02:00:00.000Z'
    let s = apply(base(), { t: 'pt-req', id: 'r1', kind: 'help', item_id: 'fridge', reward_id: null, title: '整理冰箱', own: false, pts: 0, at })
    expect(itemUsed('fridge', '2026-10-15', s)).toBe(true)
    expect(itemUsed('fridge', '2026-10-19', s)).toBe(false) // 下週一重新開始
    s = apply(s, { t: 'pt-decide', id: 'r1', give: null, duty: false, when: '', at })
    expect(itemUsed('fridge', '2026-10-15', s)).toBe(false)

    expect(ownLeft('2026-10-15', s)).toBe(2)
    s = apply(s, { t: 'pt-req', id: 'o1', kind: 'help', item_id: null, reward_id: null, title: '幫忙搬貨', own: true, pts: 0, at })
    s = apply(s, { t: 'pt-req', id: 'o2', kind: 'help', item_id: null, reward_id: null, title: '洗碗', own: true, pts: 0, at })
    expect(ownLeft('2026-10-15', s)).toBe(0)
    s = apply(s, { t: 'pt-cancel', id: 'o2', at })
    expect(ownLeft('2026-10-15', s)).toBe(1)
  })

  it('確認、本分、換獎勵、兌現，以及樂樂看到的回覆', () => {
    const at = (m: number) => `2026-10-15T0${m}:00:00.000Z`
    let s = applyAll(base(), [
      { t: 'pt-req', id: 'h1', kind: 'help', item_id: 'fridge', reward_id: null, title: '整理冰箱', own: false, pts: 0, at: at(1) },
      { t: 'pt-req', id: 'h2', kind: 'help', item_id: null, reward_id: null, title: '倒垃圾', own: true, pts: 0, at: at(1) },
      { t: 'pt-decide', id: 'h1', give: 5, duty: false, when: '', at: at(2) },
      { t: 'pt-decide', id: 'h1', give: 5, duty: false, when: '', at: at(2) }, // 重複按不會重複加
      { t: 'pt-decide', id: 'h2', give: null, duty: true, when: '', at: at(2) },
      { t: 'pt-bonus', id: 'b1', pts: 20, why: '主動幫忙收攤', at: at(3) },
      { t: 'pt-goal', goal: 'meal' },
      { t: 'pt-req', id: 'x1', kind: 'redeem', item_id: null, reward_id: 'meal', title: '決定週末某一餐吃什麼', own: false, pts: 20, at: at(4) },
      { t: 'pt-decide', id: 'x1', give: 20, duty: false, when: ' 週六晚上 ', at: at(5) },
    ])
    expect(ptBalance(s)).toBe(5)
    expect(s.ptState?.goal).toBeNull() // 換到了，目標清掉
    expect(owed(s).map((q) => q.id)).toEqual(['x1'])
    expect(kidNews(s).map((n) => [n.text, n.pts])).toEqual([
      ['確認了：整理冰箱', 5],
      ['倒垃圾：謝謝你，這是本分喔', 0],
      ['驚喜加分：主動幫忙收攤', 20],
      ['答應了：決定週末某一餐吃什麼（週六晚上）', -20],
    ])
    s = apply(s, { t: 'pt-seen', at: at(6) })
    expect(kidNews(s)).toEqual([])
    s = apply(s, { t: 'pt-deliver', id: 'x1', at: at(7) })
    expect(owed(s)).toEqual([])
    expect(history(s)[0]).toMatchObject({ text: '兌現了：決定週末某一餐吃什麼', pts: 0 })
  })

  it('獎勵照點數分組', () => {
    expect(rewardGroups(base().ptRewards).map((g) => [g.pts, g.items.length])).toEqual([
      [20, 2],
      [100, 1],
    ])
  })
})
