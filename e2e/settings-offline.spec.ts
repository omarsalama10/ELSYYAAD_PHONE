import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  page.on('pageerror', (e) => { throw e })
})

test('backup export → wipe → import restores data', async ({ page }) => {
  await page.goto('./#/body?tab=inbody')
  await page.getByRole('button', { name: '+ قياس جديد' }).click()
  await page.getByLabel('الوزن', { exact: true }).fill('70.5')
  await page.getByRole('button', { name: 'حفظ' }).click()

  await page.goto('./#/settings')
  await expect(page.getByText('لسه معملتش')).toBeVisible()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'اعمل نسخة' }).click()])
  expect(download.suggestedFilename()).toMatch(/^elsyyaad-backup-\d{4}-\d{2}-\d{2}\.zip$/)
  const path = await download.path()
  await expect(page.getByText('لسه معملتش')).toHaveCount(0)

  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'امسح كل الداتا' }).click()])
  await page.goto('./#/body?tab=inbody')
  await expect(page.getByText('سجّل أول قياس InBody')).toBeVisible()

  await page.goto('./#/settings')
  await page.locator('input[type=file]').setInputFiles(path)
  await expect(page.getByRole('status').filter({ hasText: 'تم الاسترجاع' })).toBeVisible()
  await page.goto('./#/body')
  await expect(page.getByText(/70.5 كجم/).first()).toBeVisible()
})

test('importing a non-backup file is rejected', async ({ page }) => {
  await page.goto('./#/settings')
  await page.locator('input[type=file]').setInputFiles({ name: 'x.zip', mimeType: 'application/zip', buffer: Buffer.from('nope') })
  await expect(page.getByRole('status')).toContainText('مش ملف نسخة احتياطية')
})

test('works offline after the service worker installs', async ({ page, context }) => {
  await page.goto('./')
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)

  await page.goto('./#/settings')
  await expect(page.getByTestId('offline-state')).toContainText('جاهز')
  await expect(page.getByTestId('image-progress')).toContainText('✅', { timeout: 20_000 })
  await page.getByRole('button', { name: 'تفاصيل فنية' }).click()
  await expect(page.getByTestId('diagnostics')).toContainText('controller: true')
  await page.goto('./#/gym')
  await expect(page.getByText('بيتجهّز للشغل من غير نت')).toHaveCount(0)

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('button', { name: /ابدأ يوم/ })).toBeVisible()
  await page.goto('./')
  await expect(page.getByRole('heading', { name: /صباح الخير|أهلًا بيك|مساء الخير|سهران/ })).toBeVisible()
  await page.goto('./#/exercises')
  const img = page.locator('img').first()
  await expect(img).toBeVisible()
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true)
  await context.setOffline(false)
})

test('first launch becomes offline-ready without any reload', async ({ page, context }) => {
  await page.goto('./#/settings')
  await expect(page.getByTestId('offline-state')).toContainText('جاهز', { timeout: 10_000 })
  await expect(page.getByTestId('image-progress')).toContainText('✅', { timeout: 20_000 })
  await context.setOffline(true)
  await page.goto('./#/gym')
  await expect(page.getByRole('button', { name: /ابدأ يوم/ })).toBeVisible()
  await context.setOffline(false)
})
