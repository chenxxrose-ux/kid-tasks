import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'

// 點數：樂樂申請加分、媽媽們確認、驚喜加分、換獎勵、兌現；樂樂看到媽媽們的回覆
const MOCK = 'http://localhost:54321'
const SHOTS = process.env.SHOTS

test.describe.configure({ mode: 'serial' })

let kid: Page
let mom: Page
let kidCtx: BrowserContext
let momCtx: BrowserContext

async function login(browser: Browser, email: string) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto('/')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('密碼').fill('test-password')
  await page.getByRole('button', { name: '登入' }).click()
  return { ctx, page }
}
const tab = (p: Page, name: string) => p.locator('nav.tabs').getByRole('button', { name: new RegExp(`^${name}`) }).click()
const shot = async (p: Page, name: string) => {
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/pt-${name}.png`, fullPage: true })
}

test.beforeAll(async ({ browser }) => {
  await fetch(`${MOCK}/__test/sql`, { method: 'POST', body: JSON.stringify({ sql: 'select 1', params: [] }) })
  ;({ ctx: kidCtx, page: kid } = await login(browser, 'kid@test.local'))
  await expect(kid.getByRole('heading', { level: 1, name: /^今天/ })).toBeVisible()
  ;({ ctx: momCtx, page: mom } = await login(browser, 'mom@test.local'))
  await expect(mom.getByRole('heading', { level: 1, name: /^樂樂/ })).toBeVisible()
})

test.afterAll(async () => {
  await kidCtx?.close()
  await momCtx?.close()
})

test('樂樂從 0 點開始，選目標', async () => {
  await expect(kid.locator('.ptline')).toContainText('0 點・選一個目標開始存')
  await expect(mom.locator('.ptline')).toHaveCount(0) // 沒事的時候媽媽們第一頁不出現
  await tab(kid, '點數')
  await expect(kid.locator('.ptgoal')).toContainText('還沒選目標')
  await shot(kid, '1-kid-empty')
  await kid.getByRole('button', { name: '選一個想換的獎勵當目標' }).click()
  await kid.getByRole('button', { name: '設為目標：決定週末某一餐吃什麼' }).click()
  await kid.getByRole('button', { name: '好了' }).click()
  await expect(kid.locator('.ptgoal')).toContainText('決定週末某一餐吃什麼')
  await expect(kid.locator('.ptgoal')).toContainText('還差 20 點')
})

test('加分清單：樂樂申請，媽媽們確認，樂樂看到回覆；同一項這週不能再申請', async () => {
  await kid.getByRole('button', { name: '＋ 我主動多做了' }).click()
  await kid.getByRole('button', { name: '送給媽媽們' }).click()
  await expect(kid.getByRole('alert').filter({ hasText: '先選做了哪一件' })).toBeVisible()
  await kid.getByRole('button', { name: '整理冰箱' }).click()
  await shot(kid, '2-kid-help')
  await kid.getByRole('button', { name: '送給媽媽們' }).click()
  await expect(kid.locator('section.card', { hasText: '進行中' })).toContainText('等確認')

  await expect(mom.locator('.ptline')).toContainText('樂樂想加分 1 件')
  await expect(mom.locator('nav.tabs .dot')).toHaveText('1')
  await tab(mom, '點數')
  await shot(mom, '3-mom-confirm')
  await mom.getByRole('button', { name: '確認' }).click()
  await expect(mom.locator('.ptgoal')).toContainText('5')

  await expect(kid.locator('.ptnews')).toContainText('確認了：整理冰箱')
  await expect(kid.locator('.ptnews')).toContainText('+5')
  await expect(kid.locator('.ptgoal')).toContainText('還差 15 點')
  await kid.getByRole('button', { name: '＋ 我主動多做了' }).click()
  await expect(kid.getByRole('button', { name: /整理冰箱・下週一再來/ })).toBeDisabled()
  await kid.getByRole('button', { name: '取消' }).first().click()
  await kid.getByRole('button', { name: '好', exact: true }).click()
  await expect(kid.locator('.ptnews')).toHaveCount(0)
})

test('自己寫的：媽媽們決定給幾點，或回「這是本分」', async () => {
  for (const w of ['幫忙搬貨', '倒垃圾']) {
    await kid.getByRole('button', { name: '＋ 我主動多做了' }).click()
    await kid.getByPlaceholder(/自己寫/).fill(w)
    await kid.getByRole('button', { name: '送給媽媽們' }).click()
  }
  await kid.getByRole('button', { name: '＋ 我主動多做了' }).click()
  await expect(kid.getByText('自己寫的這週已經用完 2 次了。')).toBeVisible()
  await kid.locator('form').getByRole('button', { name: '取消' }).click()

  const req = (t: string) => mom.locator('.ptreq', { hasText: t })
  await req('幫忙搬貨').getByRole('button', { name: '+10' }).click()
  await req('倒垃圾').getByRole('button', { name: '謝謝你，這是本分喔' }).click()
  await expect(kid.locator('.ptnews')).toContainText('倒垃圾：謝謝你，這是本分喔')
  await expect(kid.locator('.ptnews')).toContainText('+10')
  await shot(kid, '4-kid-news')
})

test('驚喜加分一定要寫原因；點數夠了換獎勵，媽媽們同意、約時間、兌現', async () => {
  await mom.getByRole('button', { name: '＋ 驚喜加分' }).click()
  await mom.getByRole('button', { name: '加分', exact: true }).click()
  await expect(mom.getByRole('alert').filter({ hasText: '寫一句原因' })).toBeVisible()
  await mom.getByRole('button', { name: '媽媽們累的時候主動按摩、倒水' }).click()
  await mom.getByRole('button', { name: '+20' }).click()
  await mom.getByRole('button', { name: '加分', exact: true }).click()
  await expect(mom.locator('.ptgoal')).toContainText('35')

  await kid.getByRole('button', { name: '好', exact: true }).click()
  await kid.getByRole('button', { name: '換「決定週末某一餐吃什麼」' }).click()
  await expect(kid.locator('.ptgoal')).toContainText('已經送出，等媽媽們同意')
  await expect(mom.locator('.ptline').or(mom.locator('nav.tabs .dot'))).toBeTruthy()
  await mom.getByPlaceholder('約什麼時候？例如：這週六晚上').fill('這週六晚上')
  await shot(mom, '5-mom-redeem')
  await mom.getByRole('button', { name: '同意' }).click()
  await expect(mom.locator('section.card', { hasText: '答應了，還沒兌現' })).toContainText('約好 這週六晚上')

  await expect(kid.locator('.ptnews')).toContainText('答應了：決定週末某一餐吃什麼（這週六晚上）')
  await expect(kid.locator('.ptgoal')).toContainText('換到了！選下一個目標')
  await expect(kid.locator('.ptgoal')).toContainText('15')
  await expect(kid.locator('section.card', { hasText: '進行中' })).toContainText('等兌現')
  await shot(kid, '6-kid-won')

  await mom.getByRole('button', { name: '做到了' }).click()
  await expect(mom.locator('section.card', { hasText: '答應了，還沒兌現' })).toHaveCount(0)
  await expect(kid.locator('section.card', { hasText: '進行中' })).toHaveCount(0)
})

test('媽媽們的加分清單不能放本分；新增的樂樂看得到', async () => {
  await mom.getByRole('button', { name: /加分清單/ }).click()
  await mom.getByPlaceholder('新增一項').fill('掃地')
  await mom.getByRole('button', { name: '新增', exact: true }).click()
  await expect(mom.getByRole('alert').filter({ hasText: '這是每天的本分' })).toBeVisible()
  await mom.getByPlaceholder('新增一項').fill('衣服曬好')
  await mom.getByRole('button', { name: '新增', exact: true }).click()
  await expect(mom.getByRole('alert').filter({ hasText: '這是每天的本分' })).toBeVisible()
  await mom.getByPlaceholder('新增一項').fill('幫忙洗車')
  await mom.getByRole('button', { name: '新增', exact: true }).click()
  await expect(mom.locator('.line', { hasText: '幫忙洗車' })).toBeVisible()
  await shot(mom, '7-mom-page')
  await kid.getByRole('button', { name: '＋ 我主動多做了' }).click()
  await expect(kid.getByRole('button', { name: '幫忙洗車' })).toBeVisible()
  await kid.locator('form').getByRole('button', { name: '取消' }).click()
})
