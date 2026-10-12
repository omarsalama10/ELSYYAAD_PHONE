import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  page.on('pageerror', (e) => { throw e })
})

test('editing sets in the program changes the workout rows', async ({ page }) => {
  await page.goto('./#/program')
  const block = page.getByTestId('edit-A-warmup-2')
  const sets = block.getByLabel('مجموعات')
  await sets.fill('2')
  await sets.blur()
  await expect(sets).toHaveValue('2')

  await page.getByRole('link', { name: 'اليوم' }).click()
  await page.getByRole('button', { name: 'ابدأ يوم A' }).click()
  const card = page.getByTestId('card-A-warmup-2')
  if ((await card.getAttribute('aria-expanded')) !== 'true') await card.getByRole('button').first().click()
  await expect(card.getByTestId('set-row')).toHaveCount(2)
})

test('swap exercise via picker and add one to a section', async ({ page }) => {
  await page.goto('./#/program')
  await page.getByTestId('edit-A-main-1').getByRole('button', { name: 'بدّل التمرين' }).click()
  await page.getByPlaceholder(/دوّر/).fill('Goblet')
  await page.getByRole('button', { name: /جوبلت سكوات/ }).click()
  await expect(page.getByTestId('edit-A-main-1')).toContainText('جوبلت سكوات')

  await page.getByRole('button', { name: 'ضيف تمرين' }).nth(2).click()
  await page.getByPlaceholder(/دوّر/).fill('Wrist Roller')
  await page.getByRole('button', { name: /لفّاف الرسغ/ }).click()
  await expect(page.locator('section').nth(2)).toContainText('لفّاف الرسغ')
})

test('exercise detail opens from the library with chart empty state', async ({ page }) => {
  await page.goto('./#/exercises')
  await page.getByPlaceholder(/دوّر/).fill('ساعد')
  await page.getByRole('button', { name: /مشية الفلاح/ }).click()
  await expect(page.getByRole('heading', { name: 'مشية الفلاح' })).toBeVisible()
  await expect(page.getByText('مفيش بيانات لسه')).toBeVisible()
  await expect(page.getByRole('button', { name: 'ضيف فيديو من الجاليري' })).toBeVisible()
})
