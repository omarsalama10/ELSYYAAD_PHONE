import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  page.on('pageerror', (e) => { throw e })
})

async function addInBody(page: import('@playwright/test').Page, date: string, weight: string, smm: string, pbf: string, ll: string, rl: string) {
  await page.getByRole('button', { name: '+ قياس جديد' }).click()
  await page.locator('input[type=date]').fill(date)
  await page.getByLabel('الوزن', { exact: true }).fill(weight)
  await page.getByLabel('كتلة العضل (SMM)').fill(smm)
  await page.getByLabel('نسبة الدهون (PBF)').fill(pbf)
  await page.getByLabel('رجل شمال').first().fill(ll)
  await page.getByLabel('رجل يمين').first().fill(rl)
  await page.getByRole('button', { name: 'حفظ' }).click()
}

test('InBody entries render deltas, asymmetry and charts', async ({ page }) => {
  await page.goto('./#/body')
  await expect(page.getByText('سجّل أول قياس InBody')).toBeVisible()
  await addInBody(page, '2026-10-01', '68', '28.5', '22', '8.6', '9.4')
  await addInBody(page, '2026-10-29', '69', '29.4', '20.5', '8.9', '9.5')

  await expect(page.getByText('عضل الرجلين: فرق 6%')).toBeVisible()
  await expect(page.getByText('الشمال أضعف')).toBeVisible()
  await expect(page.getByTestId('chart').first().locator('path')).toHaveCount(1)
  await expect(page.getByText('(كويس)')).toHaveCount(2)
})

test('weight is required', async ({ page }) => {
  await page.goto('./#/body')
  await page.getByRole('button', { name: '+ قياس جديد' }).click()
  await page.getByRole('button', { name: 'حفظ' }).click()
  await expect(page.getByRole('status')).toHaveText('الوزن مطلوب')
})

test('tape measurements show forearm left vs right', async ({ page }) => {
  await page.goto('./#/body')
  await page.getByRole('button', { name: 'مقاسات بالشريط' }).click()
  await page.getByRole('button', { name: '+ قياس جديد' }).click()
  await page.getByLabel('ساعد يمين').fill('26')
  await page.getByLabel('ساعد شمال').fill('25')
  await page.getByLabel('الوسط (عند السرة)').fill('84')
  await page.getByRole('button', { name: 'حفظ' }).click()
  await expect(page.getByText(/الساعد: فرق 4%/)).toBeVisible()
})
