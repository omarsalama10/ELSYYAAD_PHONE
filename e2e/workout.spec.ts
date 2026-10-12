import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  page.on('pageerror', (e) => { throw e })
})

test('first run → Day A → log sets → finish → next is Day B', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'ابدأ يوم A' })).toBeVisible()
  await page.getByRole('button', { name: 'ابدأ يوم A' }).click()

  await expect(page).toHaveURL(/#\/session\//)
  // first incomplete block (warm-up) is open; open Hack Squat card
  const card = page.getByTestId('card-A-main-1')
  await card.getByRole('button', { expanded: false }).click()
  await expect(card.getByTestId('suggestion')).toContainText('أول مرة')
  // return phase: 2 rows
  await expect(card.getByTestId('set-row')).toHaveCount(2)

  const row1 = card.getByTestId('set-row').nth(0)
  await row1.getByLabel('الوزن').fill('60')
  await row1.getByLabel('عدة').fill('10')
  await row1.getByRole('button', { name: 'تمت المجموعة' }).click()
  await expect(page.getByTestId('rest-left')).toBeVisible()
  await page.getByRole('button', { name: 'تخطي' }).click()

  // second row is prefilled from the first
  const row2 = card.getByTestId('set-row').nth(1)
  await expect(row2.getByLabel('الوزن')).toHaveValue('60')
  await row2.getByRole('button', { name: 'تمت المجموعة' }).click()
  await page.getByRole('button', { name: 'تخطي' }).click()

  await page.getByRole('button', { name: 'إنهاء', exact: true }).click()
  await expect(page).toHaveURL(/#\/$/)
  await expect(page.getByRole('button', { name: 'ابدأ يوم B' })).toBeVisible()
  await expect(page.getByText('1/3 الأسبوع ده')).toBeVisible()
})

test('unilateral exercise shows left/right rows and suggestion uses history', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'ابدأ يوم A' }).click()
  const card = page.getByTestId('card-A-main-5')
  await card.getByRole('button', { expanded: false }).click()
  await expect(card.getByTestId('set-row')).toHaveCount(4)
  await expect(card.getByText('شمال').first()).toBeVisible()
})
