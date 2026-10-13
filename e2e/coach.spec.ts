import { expect, test, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => { throw e })
})

async function doSet(page: Page, blockId: string, row: number, weight: string, reps: string) {
  const card = page.getByTestId(`card-${blockId}`)
  if ((await card.getByRole('button').first().getAttribute('aria-expanded')) !== 'true') await card.getByRole('button').first().click()
  const r = card.getByTestId('set-row').nth(row)
  await r.getByLabel('الوزن').fill(weight)
  await r.getByLabel('عدة').fill(reps)
  await r.getByRole('button', { name: 'تمت المجموعة' }).click()
  const skip = page.getByRole('button', { name: 'تخطي' })
  if (await skip.isVisible()) await skip.click()
}

async function startDay(page: Page, day: string) {
  await page.goto(`./#/workouts/${day}`)
  await page.getByRole('button', { name: /ابدأ التمرين|كمّل/ }).click()
  await expect(page).toHaveURL(/#\/session\//)
}

async function finish(page: Page) {
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'إنهاء', exact: true }).click()
  await expect(page).toHaveURL(/#\/gym$/)
}

test('readiness check-in scores the day and adjusts suggestions', async ({ page }) => {
  // history so there is something to adjust
  await startDay(page, 'A')
  await doSet(page, 'A-main-1', 0, '60', '10')
  await doSet(page, 'A-main-1', 1, '60', '10')
  await finish(page)

  // terrible day
  for (const [label, v] of [['جودة النوم', '1'], ['الضغط النفسي', '5'], ['ألم العضلات (الشدّ)', '5'], ['التعب', '5']] as const)
    await page.getByRole('radio', { name: `${label} ${v}` }).click()
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'أقل' }).click() // 7h → 4h
  await page.getByRole('button', { name: 'حفظ' }).click()
  await expect(page.getByTestId('readiness')).toContainText('جاهزيتك قليلة')

  await startDay(page, 'A')
  const card = page.getByTestId('card-A-main-1')
  await card.getByRole('button').first().click()
  await expect(card.getByTestId('suggestion')).toContainText('خففنا الوزن')
})

test('breaking a record shows a trophy toast; RPE can be logged', async ({ page }) => {
  await startDay(page, 'A')
  await doSet(page, 'A-main-1', 0, '60', '8')
  await finish(page)

  await startDay(page, 'A')
  await doSet(page, 'A-main-1', 0, '65', '8')
  await expect(page.getByRole('status').filter({ hasText: 'رقم قياسي جديد' })).toBeVisible()

  const row = page.getByTestId('card-A-main-1').getByTestId('set-row').nth(0)
  await page.getByRole('radio', { name: 'RPE 8' }).first().click()
  await expect(row.getByRole('button', { name: 'المجهود 8' })).toBeVisible()
})

test('progress tabs: muscle map, records, achievements', async ({ page }) => {
  await startDay(page, 'A')
  await doSet(page, 'A-main-1', 0, '60', '10')
  await finish(page)

  await page.goto('./#/progress')
  await expect(page.getByTestId('records')).toContainText('هاك سكوات')
  await page.getByRole('tab', { name: 'العضلات' }).click()
  await expect(page.getByRole('img', { name: 'أمام' })).toBeVisible()
  await page.getByRole('tab', { name: 'الإنجازات' }).click()
  await expect(page.getByLabel('البداية: مفتوح')).toBeVisible()
  await expect(page.getByLabel('منتظم: مقفول')).toBeVisible()
})

test('history: edit a past set and rename an exercise', async ({ page }) => {
  await startDay(page, 'A')
  await doSet(page, 'A-main-1', 0, '60', '10')
  await finish(page)

  await page.goto('./#/history')
  await page.getByTestId('history-row').first().click()
  const w = page.getByTestId('history-exercise').filter({ hasText: 'هاك سكوات' }).getByLabel('الوزن').first()
  await w.fill('70')
  await w.blur()
  await page.goto('./#/exercises/Hack_Squat')
  await expect(page.getByTestId('exercise-record')).toContainText('70')

  page.once('dialog', (d) => d.accept('هاك على الجهاز'))
  await page.getByRole('button', { name: 'تغيير الاسم' }).click()
  await expect(page.getByRole('heading', { name: /هاك على الجهاز/ })).toBeVisible()
})
