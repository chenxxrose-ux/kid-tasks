import { beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { as, createDb, USERS } from './harness'

let db: PGlite
beforeEach(async () => {
  db = await createDb()
})

const today = async () => (await db.query<{ d: string }>(`select public.kt_today()::text as d`)).rows[0].d

describe('任務與交代', () => {
  it('種子資料有每日任務和段考', async () => {
    const t = await as<{ n: number }>(db, USERS.kid, 'select count(*)::int as n from public.kt_tasks')
    expect(t[0].n).toBe(16)
    const e = await as<{ n: number }>(db, USERS.kid, `select count(*)::int as n from public.kt_exams where title like '%段考'`)
    expect(e[0].n).toBe(7)
  })
  it('只有媽媽們能交代事情', async () => {
    const d = await today()
    await as(db, USERS.mom, `insert into public.kt_asks (day, title) values ($1, '倒垃圾')`, [d])
    await expect(as(db, USERS.kid, `insert into public.kt_asks (day, title) values ($1, '不用做')`, [d])).rejects.toThrow()
    await expect(as(db, USERS.kid, `update public.kt_tasks set title = 'x'`)).resolves.toBeDefined()
    const t = await as<{ title: string }>(db, USERS.kid, `select title from public.kt_tasks where id = 'homework'`)
    expect(t[0].title).toBe('作業完成') // 樂樂改不到（RLS 讓更新影響 0 列）
  })
  it('不是成員什麼都看不到', async () => {
    const t = await as(db, USERS.stranger, 'select * from public.kt_tasks')
    expect(t).toHaveLength(0)
  })
})

describe('打勾', () => {
  it('樂樂可以勾今天、取消今天；媽媽們不能幫她勾', async () => {
    const d = await today()
    await as(db, USERS.kid, `insert into public.kt_checks (day, task_id, checked_at) values ($1, 'homework', now())`, [d])
    await expect(
      as(db, USERS.mom, `insert into public.kt_checks (day, task_id, checked_at) values ($1, 'table', now())`, [d]),
    ).rejects.toThrow()
    await as(db, USERS.kid, `delete from public.kt_checks where day = $1 and task_id = 'homework'`, [d])
    const left = await as(db, USERS.kid, 'select * from public.kt_checks')
    expect(left).toHaveLength(0)
  })
  it('離線勾的昨天可以補送，前天不行，時間要在那一天', async () => {
    await as(
      db,
      USERS.kid,
      `insert into public.kt_checks (day, task_id, checked_at)
       values (public.kt_today() - 1, 'homework', ((public.kt_today() - 1)::timestamp + interval '21 hours') at time zone 'Asia/Taipei')`,
    )
    await expect(
      as(db, USERS.kid, `insert into public.kt_checks (day, task_id, checked_at) values (public.kt_today() - 2, 'table', now() - interval '2 days')`),
    ).rejects.toThrow()
    await expect(
      as(db, USERS.kid, `insert into public.kt_checks (day, task_id, checked_at) values (public.kt_today(), 'table', now() - interval '3 days')`),
    ).rejects.toThrow()
  })
  it('昨天的勾鎖住，不能取消', async () => {
    await db.query(
      `insert into public.kt_checks (day, task_id, checked_at, checked_by) values (public.kt_today() - 1, 'homework', now() - interval '1 day', $1)`,
      [USERS.kid],
    )
    await as(db, USERS.kid, `delete from public.kt_checks where task_id = 'homework'`)
    const left = await as(db, USERS.mom, 'select * from public.kt_checks')
    expect(left).toHaveLength(1)
  })
})

describe('留言與已讀', () => {
  it('身分由資料庫決定，不能冒充', async () => {
    await as(db, USERS.kid, `insert into public.kt_messages (body) values ('我到家了')`)
    await expect(as(db, USERS.kid, `insert into public.kt_messages (body, role) values ('x', 'mom')`)).rejects.toThrow()
    const m = await as<{ role: string }>(db, USERS.mom, 'select role from public.kt_messages')
    expect(m.map((x) => x.role)).toEqual(['kid'])
  })
  it('已讀時間只記自己的身分、只會往後', async () => {
    await as(db, USERS.mom, `select public.kt_mark_read(now())`)
    await as(db, USERS.mom2, `select public.kt_mark_read(now() - interval '1 hour')`)
    await expect(as(db, USERS.kid, `insert into public.kt_reads (role, read_at) values ('mom', now())`)).rejects.toThrow()
    await expect(as(db, USERS.stranger, `select public.kt_mark_read(now())`)).rejects.toThrow()
    const r = await as<{ role: string; fresh: boolean }>(db, USERS.kid, `select role, read_at > now() - interval '1 minute' as fresh from public.kt_reads`)
    expect(r).toEqual([{ role: 'mom', fresh: true }])
  })
})

describe('存錢筒', () => {
  const balance = async () => (await db.query<{ b: string }>('select public.kt_balance()::text as b')).rows[0].b
  it('媽媽們存入，樂樂申請領錢，媽媽們同意後扣掉', async () => {
    await as(db, USERS.mom, `insert into public.kt_bank (kind, amount, memo) values ('in', 1000, '紙本帳轉入')`)
    expect(await balance()).toBe('1000')
    // 不能自己標成已同意
    await expect(
      as(db, USERS.kid, `insert into public.kt_bank (kind, amount, memo, status) values ('out', 300, '買書', 'ok')`),
    ).rejects.toThrow()
    const [r] = await as<{ id: string; status: string }>(
      db,
      USERS.kid,
      `insert into public.kt_bank (kind, amount, memo) values ('out', 300, '買書') returning id, status`,
    )
    expect(r.status).toBe('pending')
    expect(await balance()).toBe('1000')
    await expect(as(db, USERS.kid, `select public.kt_decide($1, true)`, [r.id])).rejects.toThrow()
    await as(db, USERS.mom2, `select public.kt_decide($1, true)`, [r.id])
    expect(await balance()).toBe('700')
    await expect(as(db, USERS.mom, `select public.kt_decide($1, true)`, [r.id])).rejects.toThrow(/處理過/)
  })
  it('不能超過餘額；樂樂不能存入；可以取消自己的申請', async () => {
    await as(db, USERS.mom, `insert into public.kt_bank (kind, amount, memo) values ('in', 100, '零用錢')`)
    await expect(as(db, USERS.kid, `insert into public.kt_bank (kind, amount, memo) values ('in', 100, 'x')`)).rejects.toThrow()
    const [r] = await as<{ id: string }>(db, USERS.kid, `insert into public.kt_bank (kind, amount, memo) values ('out', 500, '耳機') returning id`)
    await expect(as(db, USERS.mom, `select public.kt_decide($1, true)`, [r.id])).rejects.toThrow(/超過/)
    await as(db, USERS.kid, `select public.kt_cancel($1)`, [r.id])
    const s = await as<{ status: string }>(db, USERS.mom, `select status from public.kt_bank where id = $1`, [r.id])
    expect(s[0].status).toBe('cancelled')
  })
  it('紀錄不能直接改或刪', async () => {
    await as(db, USERS.mom, `insert into public.kt_bank (kind, amount, memo) values ('in', 100, '零用錢')`)
    await expect(as(db, USERS.mom, `update public.kt_bank set amount = 999`)).rejects.toThrow()
    await expect(as(db, USERS.mom, `delete from public.kt_bank`)).rejects.toThrow()
  })
})

describe('打開網頁的時間', () => {
  it('只記樂樂的，媽媽們看得到', async () => {
    await as(db, USERS.kid, `insert into public.kt_visits (at) values (now())`)
    await expect(as(db, USERS.mom, `insert into public.kt_visits (at) values (now())`)).rejects.toThrow()
    const v = await as(db, USERS.mom, 'select * from public.kt_visits')
    expect(v).toHaveLength(1)
  })
})
