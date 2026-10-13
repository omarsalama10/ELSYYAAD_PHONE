import { expect, test, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => { throw e })
})

async function setup(page: Page, budget?: string) {
  await page.goto('./#/nutrition')
  await page.getByRole('link', { name: 'ابدأ' }).click()
  await page.getByLabel('الطول').fill('178')
  await page.getByLabel('الوزن الحالي').fill('68')
  if (budget) await page.getByLabel('الميزانية').fill(budget)
  await page.getByRole('button', { name: 'حفظ' }).click()
  await expect(page).toHaveURL(/#\/nutrition$/)
}

async function addFood(page: Page, slot: string, search: string, name: RegExp, price?: string) {
  await page.getByRole('button', { name: `ضيف ${slot}` }).click()
  await page.getByLabel('دوّر على أكلة').fill(search)
  await page.getByRole('button', { name }).first().click()
  if (price) await page.getByLabel('السعر').fill(price)
  await page.getByRole('button', { name: 'ضيف', exact: true }).click()
}

test('setup computes targets; logging food updates the day', async ({ page }) => {
  await setup(page)
  await expect(page.getByRole('region', { name: 'ملخص اليوم' })).toContainText('سعرة')
  await expect(page.getByTestId('kcal-eaten')).toHaveText('0')

  await addFood(page, 'فطار', 'فول', /فول مدمس/)
  await expect(page.getByTestId('kcal-eaten')).toHaveText('220')
  await expect(page.getByTestId('slot-breakfast')).toContainText('فول مدمس')

  await page.getByRole('button', { name: 'كوباية 4' }).click()
  await expect(page.getByTestId('water')).toContainText('1.00')
  await page.getByRole('button', { name: 'كرياتين 5 جم' }).click()
  await expect(page.getByRole('button', { name: /كرياتين 5 جم/ })).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('link', { name: 'الرئيسية' }).click()
  await expect(page.getByTestId('nutrition-mini')).toContainText('220')
})

test('custom food and quick add', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: 'ضيف غدا' }).click()
  await page.getByRole('tab', { name: 'أكلة جديدة' }).click()
  await page.getByLabel('اسم الأكلة الجديدة').fill('كفتة ماما')
  await page.getByLabel('وزن الحصة').fill('60')
  await page.getByLabel('حصة kcal').fill('150')
  await page.getByLabel('حصة p').fill('12')
  await page.getByRole('button', { name: 'حفظ الأكلة' }).click()
  await page.getByRole('button', { name: 'أكتر' }).click() // 1.5 servings
  await page.getByRole('button', { name: 'ضيف', exact: true }).click()
  await expect(page.getByTestId('kcal-eaten')).toHaveText('225')

  await page.getByRole('button', { name: 'ضيف سناكس' }).click()
  await page.getByRole('tab', { name: 'سريع' }).click()
  await page.getByLabel('سعرات').fill('300')
  await page.getByLabel('بروتين').fill('5')
  await page.getByRole('button', { name: 'ضيف', exact: true }).click()
  await expect(page.getByTestId('kcal-eaten')).toHaveText('525')
})

test('budget: priced foods rank and fill remaining protein', async ({ page }) => {
  await setup(page, '60')
  await addFood(page, 'فطار', 'بيض', /بيض \(بيضة كاملة\)/, '6')
  await addFood(page, 'غدا', 'فول', /فول مدمس/, '10')
  await expect(page.getByText('صرفت 16 من 60 جنيه')).toBeVisible()
  await expect(page.getByTestId('budget-fill')).toContainText('فول مدمس')
})
