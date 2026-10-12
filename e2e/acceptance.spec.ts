import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { addDays, md, taipeiToday } from '../src/lib/dates'

// 驗收流程：樂樂和媽媽們的手機同時開著，資料即時同步；樂樂的手機離線再連線
const MOCK = 'http://localhost:54321'
const today = taipeiToday()

test.describe.configure({ mode: 'serial' })

let kid: Page
let mom: Page
let kidCtx: BrowserContext
let momCtx: BrowserContext

async function sql<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
  const r = await fetch(`${MOCK}/__test/sql`, { method: 'POST', body: JSON.stringify({ sql: query, params }) })
  return r.json()
}

async function login(browser: Browser, email: string) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto('/')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('密碼').fill('test-password')
  await page.getByRole('button', { name: '登入' }).click()
  return { ctx, page }
}

/** 樂樂的頁面每一段可以收合：把某一段打開 */
async function openPart(page: Page, name: RegExp) {
  const hd = page.locator('button.parthd', { hasText: name })
  if ((await hd.getAttribute('aria-expanded')) !== 'true') await hd.click()
}

test.beforeAll(async ({ browser }) => {
  await sql(`delete from public.kt_exams`)
  ;({ ctx: kidCtx, page: kid } = await login(browser, 'kid@test.local'))
  await expect(kid.getByRole('heading', { name: /^今天/ })).toBeVisible()
  ;({ ctx: momCtx, page: mom } = await login(browser, 'mom@test.local'))
  await expect(mom.getByRole('heading', { name: /^樂樂/ })).toBeVisible()
})

test.afterAll(async () => {
  await kidCtx?.close()
  await momCtx?.close()
})

test('密碼錯誤、沒開通的帳號', async ({ browser }) => {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto('/')
  await page.getByLabel('Email').fill('kid@test.local')
  await page.getByLabel('密碼').fill('wrong')
  await page.getByRole('button', { name: '登入' }).click()
  await expect(page.getByRole('alert')).toHaveText('Email 或密碼不對')
  await expect(page.getByLabel('Email')).toHaveValue('kid@test.local') // 保留輸入
  await page.getByLabel('Email').fill('stranger@test.local')
  await page.getByLabel('密碼').fill('test-password')
  await page.getByRole('button', { name: '登入' }).click()
  await expect(page.getByText('這個帳號還沒有開通今日事。')).toBeVisible()
  await ctx.close()
})

test('媽媽們看得到樂樂幾點打開網頁', async () => {
  await expect(mom.locator('.visit')).toContainText('樂樂今天打開過 1 次：')
  // 樂樂沒有「安排」分頁
  await expect(kid.getByRole('button', { name: '安排' })).toHaveCount(0)
})

test('媽媽們交代的事，樂樂馬上看到；樂樂打勾，媽媽們看到時間', async () => {
  await mom.getByRole('button', { name: '交代一件事' }).click()
  await mom.getByRole('button', { name: '交代', exact: true }).click()
  await expect(mom.getByRole('alert').filter({ hasText: '請寫要交代的事' })).toBeVisible()
  await mom.getByLabel('要交代的事').fill('把報紙拿去回收')
  await mom.getByRole('button', { name: '交代', exact: true }).click()

  const box = kid.locator('.askbox')
  await expect(box).toContainText('把報紙拿去回收')
  await box.getByRole('button', { name: /把報紙拿去回收/ }).click()
  await expect(kid.locator('.toast')).toContainText('把報紙拿去回收')
  await expect(kid.locator('.askbox')).toHaveCount(0) // 做完就從清單消失

  await expect(mom.locator('.askbox h2')).toContainText('1 / 1 完成')
  await expect(mom.locator('.askbox .time')).toHaveText(/^\d\d:\d\d$/)

  // 媽媽們不能幫她勾
  await expect(mom.locator('.group .tbtn').first()).toBeDisabled()

  // 樂樂按復原，媽媽們那邊也取消
  await kid.locator('.toast').getByRole('button', { name: '復原' }).click()
  await expect(kid.locator('.askbox')).toContainText('把報紙拿去回收')
  await expect(mom.locator('.askbox h2')).toContainText('0 / 1 完成')
})

test('老師說：樂樂自己記，媽媽們馬上看到；打勾後媽媽們看到時間', async () => {
  const kbox = kid.locator('.teach')
  await kbox.getByRole('button', { name: /記下老師/ }).click()
  await kbox.getByRole('button', { name: '記下來' }).click()
  await expect(kbox.getByRole('alert')).toHaveText('請寫老師交代什麼')
  await kbox.getByLabel('老師交代什麼').fill('帶直笛')
  await kbox.getByRole('button', { name: '記下來' }).click()
  await expect(kbox).toContainText('明天到期')

  const mbox = mom.locator('.teach')
  await expect(mbox).toContainText('帶直笛')
  await expect(mbox.locator('h2')).toContainText('0 / 1 完成')

  await kbox.getByRole('button', { name: /帶直笛/ }).click()
  await expect(kbox.getByRole('button', { name: /帶直笛/ })).toHaveCount(0)
  await expect(mbox.locator('h2')).toContainText('1 / 1 完成')
  await expect(mbox.locator('.time')).toHaveText(/^\d\d:\d\d$/)
  await kid.locator('.toast').getByRole('button', { name: '復原' }).click()
  await expect(mbox.locator('h2')).toContainText('0 / 1 完成')

  // 媽媽們也能記、能拿掉
  await mbox.getByRole('button', { name: /記下老師/ }).click()
  await mbox.getByLabel('老師交代什麼').fill('繳班費')
  await mbox.getByRole('button', { name: '老師沒說' }).click()
  await mbox.getByRole('button', { name: '記下來' }).click()
  await expect(kbox).toContainText('繳班費')
  await mbox.getByRole('button', { name: '拿掉「繳班費」' }).click()
  await mbox.getByRole('button', { name: '確定拿掉' }).click()
  await expect(kbox).not.toContainText('繳班費')
})

test('留言：新留言每一頁都看得到，按知道了或回覆才消失', async () => {
  await mom.getByRole('button', { name: /^留言/ }).click()
  await mom.getByRole('textbox', { name: '留言' }).fill('今天早點睡')
  await mom.getByRole('button', { name: '送出' }).click()

  const kidBanner = kid.locator('.mban')
  await expect(kidBanner).toContainText('媽媽們：今天早點睡')
  await kid.getByRole('button', { name: /^存錢筒/ }).click()
  await expect(kidBanner).toBeVisible() // 換頁還在
  await kid.getByRole('button', { name: /^留言/ }).click()
  await expect(kidBanner).toBeVisible() // 打開留言頁也還在
  await kidBanner.getByRole('button', { name: '知道了' }).click()
  await expect(kidBanner).toHaveCount(0)

  await kid.getByRole('textbox', { name: '留言' }).fill('好，我到家了')
  await kid.getByRole('button', { name: '送出' }).click()
  const momBanner = mom.locator('.mban')
  await expect(momBanner).toContainText('樂樂：好，我到家了')
  await mom.getByRole('textbox', { name: '留言' }).fill('收到')
  await mom.getByRole('button', { name: '送出' }).click()
  await expect(momBanner).toHaveCount(0) // 回覆也算看過了
  await expect(kid.locator('.bub').last()).toContainText('收到')
})

test('存錢筒：媽媽們存入，樂樂申請領錢，媽媽們同意後扣掉', async () => {
  await mom.getByRole('button', { name: /^存錢筒/ }).click()
  await expect(mom.getByText('還沒有紀錄。第一筆可以記紙本帳上的金額。')).toBeVisible()
  await mom.getByRole('button', { name: '記一筆存入' }).click()
  await mom.getByLabel('金額').fill('1,000')
  await mom.getByLabel('是什麼錢').fill('紙本帳轉入')
  await mom.getByRole('button', { name: '存入', exact: true }).click()
  await expect(mom.locator('.big')).toHaveText('NT$ 1,000')

  await kid.getByRole('button', { name: /^存錢筒/ }).click()
  await expect(kid.locator('.big')).toHaveText('NT$ 1,000')
  await kid.getByRole('button', { name: '申請領錢' }).click()
  await kid.getByLabel('金額').fill('5000')
  await kid.getByLabel('要用在哪裡').fill('耳機')
  await kid.getByRole('button', { name: '送出申請' }).click()
  await expect(kid.getByRole('alert').filter({ hasText: '超過你現在的 NT$ 1,000' })).toBeVisible()
  await expect(kid.getByLabel('要用在哪裡')).toHaveValue('耳機') // 錯誤時保留輸入
  await kid.getByLabel('金額').fill('300')
  await kid.getByRole('button', { name: '送出申請' }).click()
  await expect(kid.getByText('等媽媽們確認')).toBeVisible()

  await expect(mom.getByRole('button', { name: /^存錢筒/ }).locator('.dot')).toHaveText('1')
  await expect(mom.getByText('樂樂想領 NT$ 300')).toBeVisible()
  await mom.getByRole('button', { name: '同意', exact: true }).click()
  await expect(mom.locator('.big')).toHaveText('NT$ 700')
  await expect(kid.locator('.big')).toHaveText('NT$ 700')
  await expect(kid.locator('.amt.minus')).toHaveText('−300')
})

test('考試：媽媽們新增、填科目，樂樂第一頁看到倒數', async () => {
  const day = addDays(today, 3)
  await mom.getByRole('button', { name: /^安排/ }).click()
  await mom.getByRole('button', { name: '新增考試' }).click()
  await mom.getByLabel('日期').fill(day)
  await mom.getByLabel('名稱').fill('第 9 次段考')
  await mom.getByRole('button', { name: '加入', exact: true }).click()
  await expect(mom.getByText('科目還沒填')).toBeVisible()

  await kid.getByRole('button', { name: /^今日事/ }).click()
  const hero = kid.locator('.hero')
  await expect(hero).toContainText('3天')
  await expect(hero).toContainText('科目還沒公布')
  // 段考前 7 天自動多一項複習
  await openPart(kid, /放學後|下午/)
  await expect(kid.getByRole('button', { name: /段考複習 30 分鐘/ })).toBeVisible()

  await mom.locator('.line', { hasText: '第 9 次段考' }).getByRole('button', { name: '修改' }).click()
  await mom.getByLabel('考哪幾科').fill('國文、數學')
  await mom.getByRole('button', { name: '儲存', exact: true }).click()
  await expect(hero).toContainText(`${md(day)}`)
  await expect(hero).toContainText('國文、數學')
})

test('媽媽們新增任務，樂樂那邊出現', async () => {
  await mom.getByRole('button', { name: '新增任務' }).click()
  await mom.getByLabel('名稱').fill('練琴 20 分鐘')
  await mom.getByRole('button', { name: '睡前' }).click()
  await mom.getByRole('button', { name: '加入', exact: true }).click()
  await expect(mom.locator('.group', { hasText: '睡前' })).toContainText('練琴 20 分鐘')
  await openPart(kid, /晚上/)
  await expect(kid.getByRole('button', { name: /練琴 20 分鐘/ })).toBeVisible()
})

test('媽媽們長按拖曳換順序，樂樂那邊跟著變', async () => {
  await mom.getByRole('button', { name: /^今日事/ }).click()
  const night = mom.locator('.group', { hasText: '晚上' })
  const names = () => night.locator('.sortrow .tt b').allTextContents()
  const before = await names()
  const first = night.locator('.sortrow').first()
  const last = night.locator('.sortrow').last()
  await first.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const a = (await first.boundingBox())!
  const b = (await last.boundingBox())!
  await mom.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await mom.mouse.down()
  await mom.waitForTimeout(500)
  await mom.mouse.move(a.x + a.width / 2, b.y + b.height - 4, { steps: 12 })
  await expect(night.locator('.sortrow.lifted')).toHaveCount(1)
  await mom.mouse.up()
  const after = [...before.slice(1), before[0]]
  await expect.poll(names).toEqual(after)
  await openPart(kid, /晚上/)
  await expect.poll(() => kid.locator('.parthd:has-text("晚上") ~ .task .tt b').allTextContents()).toEqual(after)

  // 輕輕滑過去是捲動，不會換順序
  await mom.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await mom.mouse.down()
  await mom.mouse.move(a.x + a.width / 2, b.y + b.height - 4, { steps: 5 })
  await mom.mouse.up()
  await expect.poll(names).toEqual(after)
})

test('樂樂離線打勾，連上網路後媽媽們才看到', async () => {
  await mom.getByRole('button', { name: /^今日事/ }).click()
  await kidCtx.setOffline(true)
  await openPart(kid, /晚上/)
  await kid.getByRole('button', { name: /練琴 20 分鐘/ }).click()
  await expect(kid.locator('.sync')).toContainText('離線中・1 件先存在手機')
  // 離線時重新整理也打得開，勾的還在
  await kid.reload()
  await expect(kid.getByRole('heading', { name: /^今天/ })).toBeVisible()
  await expect(kid.locator('.sync')).toContainText('1 件先存在手機')

  await expect(mom.locator('.group', { hasText: '練琴 20 分鐘' }).locator('.task.done')).toHaveCount(0)
  await kidCtx.setOffline(false)
  await expect(kid.locator('.sync')).toHaveCount(0)
  await expect(mom.locator('.task.done', { hasText: '練琴 20 分鐘' })).toBeVisible()
})
