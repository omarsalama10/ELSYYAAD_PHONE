import { expect, test } from '@playwright/test'
import { unzipSync, strFromU8 } from 'fflate'
import { readFileSync } from 'node:fs'

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => { throw e })
})

test('CSV export zip contains sets and sessions', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('./#/workouts/A')
  await page.getByRole('button', { name: 'ابدأ التمرين' }).click()
  const card = page.getByTestId('card-A-main-1')
  await card.getByRole('button').first().click()
  const r = card.getByTestId('set-row').nth(0)
  await r.getByLabel('الوزن').fill('60')
  await r.getByLabel('عدة').fill('10')
  await r.getByRole('button', { name: 'تمت المجموعة' }).click()
  await page.getByRole('button', { name: 'إنهاء', exact: true }).click()
  await expect(page).toHaveURL(/#\/gym$/)

  await page.goto('./#/settings')
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV + JSON' }).click()])
  const files = unzipSync(new Uint8Array(readFileSync((await dl.path())!)))
  expect(Object.keys(files)).toEqual(expect.arrayContaining(['sets.csv', 'sessions.csv', 'inbody.csv', 'meals.csv', 'data.json']))
  expect(strFromU8(files['sets.csv']!)).toContain('Hack Squat,1,,60,10')
})

test('report page renders and builds a ChatGPT summary', async ({ page }) => {
  await page.goto('./#/report')
  await expect(page.getByTestId('report')).toContainText('تاريخ التقرير')
  await expect(page.getByTestId('ai-summary')).toHaveValue(/# ملخص تمريني/)
  await expect(page.getByRole('button', { name: 'طباعة / حفظ PDF' })).toBeVisible()
})
