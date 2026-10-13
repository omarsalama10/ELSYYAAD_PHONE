import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => { throw e })
})

test('build a 4-day program with a knee limitation, then switch back', async ({ page }) => {
  await page.goto('./#/workouts')
  await page.getByTestId('build-program').click()
  await page.getByRole('tab', { name: '4', exact: true }).click()
  await page.getByRole('tab', { name: '60', exact: true }).click()
  await page.getByRole('group', { name: 'القيود' }).getByRole('button', { name: /ركبة/ }).click()
  const preview = page.getByTestId('wizard-preview')
  await expect(preview).toContainText('يوم D — أسفل')
  await expect(preview).not.toContainText('هاك سكوات')
  await page.getByRole('button', { name: 'اعتمد البرنامج ده' }).click()

  await expect(page).toHaveURL(/#\/workouts$/)
  await expect(page.getByTestId('day-D')).toBeVisible()
  await expect(page.getByText(/برنامج تضخيم — 4 أيام/)).toBeVisible()

  await page.goto('./#/program')
  await page.getByLabel('البرنامج الشغال').selectOption({ label: 'عودة Full Body — 3 أيام' })
  await page.goto('./#/workouts')
  await expect(page.getByTestId('day-D')).toHaveCount(0)
  await expect(page.getByTestId('day-C')).toBeVisible()
})
