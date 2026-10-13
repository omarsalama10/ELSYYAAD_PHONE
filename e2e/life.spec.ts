import { expect, test, type Page } from '@playwright/test'

// Fixed wall clock (Monday 10:00) so the planner output is deterministic; timers stay real.
const NOW = new Date(2026, 9, 12, 10, 0, 0)
const TODAY = '2026-10-12'

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  page.on('pageerror', (e) => { throw e })
  await page.clock.setFixedTime(NOW)
})

async function quickAdd(page: Page, text: string) {
  await page.getByRole('button', { name: 'إضافة سريعة' }).click()
  await page.getByLabel('عنوان المهمة').fill(text)
  await page.getByRole('button', { name: 'إضافة', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'اتضافت' })).toBeVisible()
}

test('quick add → scheduled today → approve plan → timer → finish', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByText('مفيش حاجة مخططة دلوقتي')).toBeVisible()
  await quickAdd(page, 'كتابة التقرير 60د !5')

  const timeline = page.getByTestId(`timeline-${TODAY}`)
  await expect(timeline.getByRole('button', { name: /كتابة التقرير 10:00/ })).toBeVisible()
  await expect(page.getByText('خطة اليوم مقترحة')).toBeVisible()

  await page.getByText('خطة اليوم مقترحة').click()
  await page.getByRole('button', { name: /اعتمد خطة/ }).click()
  await expect(page.getByText('خطة اليوم مقترحة')).toHaveCount(0)

  await page.getByRole('button', { name: 'ابدأ', exact: false }).first().click()
  await expect(page.getByText('شغال دلوقتي')).toBeVisible()
  await page.getByRole('button', { name: '✓ خلصت' }).first().click()
  await expect(page.getByRole('status').filter({ hasText: 'برافو' })).toBeVisible()

  await page.getByRole('link', { name: 'المهام' }).click()
  await page.getByRole('tab', { name: 'المنتهية' }).click()
  await expect(page.getByTestId('task-row').filter({ hasText: 'كتابة التقرير' })).toBeVisible()
})

test('commitments block time and dependencies order the plan', async ({ page }) => {
  await page.goto('./#/plan?tab=commitments')
  await page.getByRole('button', { name: '+ التزام ثابت' }).click()
  await page.getByLabel('الاسم').fill('الشغل')
  await page.getByLabel('من', { exact: true }).fill('10:00')
  await page.getByLabel('إلى', { exact: true }).fill('14:00')
  await page.getByLabel('التكرار').selectOption('daily')
  await page.getByRole('button', { name: 'حفظ' }).click()
  await expect(page.getByText('الشغل')).toBeVisible()

  await page.goto('./')
  await quickAdd(page, 'تطوير الميزة 60د')
  const timeline = page.getByTestId(`timeline-${TODAY}`)
  await expect(timeline.getByRole('button', { name: /الشغل 10:00/ })).toBeVisible()
  // Work can't overlap the commitment, so it starts at 14:00.
  await expect(timeline.getByRole('button', { name: /تطوير الميزة 14:00/ })).toBeVisible()
})

test('project workspace: create, add task, move on the board', async ({ page }) => {
  await page.goto('./#/projects')
  await page.getByRole('button', { name: 'مشروع جديد' }).click()
  await page.getByLabel('الاسم').fill('برنامج المحاسبة')
  await page.getByRole('button', { name: 'إنشاء' }).click()
  await expect(page.getByRole('heading', { name: 'برنامج المحاسبة' })).toBeVisible()

  await page.getByRole('button', { name: '+ مهمة' }).click()
  await page.getByLabel('عنوان المهمة').fill('شاشة الفواتير 90د')
  await page.getByRole('button', { name: 'إضافة', exact: true }).click()

  await page.getByRole('tab', { name: 'Kanban' }).click()
  const col = page.getByTestId('col-new')
  await expect(col.getByText('شاشة الفواتير')).toBeVisible()
  await col.getByRole('button', { name: 'للعمود اللي بعده' }).click()
  await expect(page.getByTestId('col-planned').getByText('شاشة الفواتير')).toBeVisible()

  await page.getByRole('tab', { name: 'نظرة عامة' }).click()
  await expect(page.getByText('0/1 مهام')).toBeVisible()
})

test('Claude plan file: preview, apply, snapshot', async ({ page }) => {
  await page.goto('./#/data')
  const plan = {
    schema: 'elsyyaad.lifeos.plan/v1',
    title: 'خطة الإصدار الأول',
    goals: [{ ref: 'g', title: 'إصدار أول', targetDate: '2026-11-12' }],
    projects: [{ ref: 'p', name: 'الإصدار الأول', goal: 'g' }],
    tasks: [
      { ref: 'a', title: 'تصميم قاعدة البيانات', project: 'p', estimateMin: 120, importance: 4 },
      { ref: 'b', title: 'اختبارات التكامل', project: 'p', dependsOn: ['a'], estimateMin: 60 },
    ],
  }
  await page.getByLabel('ملف الخطة').fill(JSON.stringify(plan))
  await page.getByRole('button', { name: 'راجع التغييرات' }).click()
  const preview = page.getByTestId('plan-preview')
  await expect(preview.getByRole('listitem')).toHaveCount(4)
  await page.getByRole('button', { name: 'طبّق 4 تغيير' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'اتطبق 4 تغيير' })).toBeVisible()
  await expect(page.getByText(/قبل استيراد خطة: خطة الإصدار الأول/)).toBeVisible()

  await page.goto('./#/projects')
  await expect(page.getByTestId('project-card').filter({ hasText: 'الإصدار الأول' })).toBeVisible()

  // Invalid files are rejected with precise errors and nothing is applied.
  await page.goto('./#/data')
  await page.getByLabel('ملف الخطة').fill(JSON.stringify({ schema: 'elsyyaad.lifeos.plan/v1', tasks: [{ title: '' }] }))
  await page.getByRole('button', { name: 'راجع التغييرات' }).click()
  await expect(page.getByTestId('plan-errors')).toContainText('tasks[0].title')
})

test('goals, habits, focus mode, insights and trash', async ({ page }) => {
  await page.goto('./#/goals')
  await page.getByRole('button', { name: 'هدف جديد' }).click()
  await page.getByLabel('الهدف').fill('إنهاء 20 درس')
  await page.getByLabel('طريقة القياس').selectOption('numeric')
  await page.getByLabel('المستهدف').fill('20')
  await page.getByRole('button', { name: 'إنشاء' }).click()
  await page.getByRole('button', { name: 'زوّد' }).click()
  await page.getByRole('button', { name: 'زوّد' }).click()
  await expect(page.getByText('10%').first()).toBeVisible()

  await page.goto('./#/habits')
  await page.getByRole('button', { name: 'عادة جديدة' }).click()
  await page.getByLabel('العادة').fill('قراءة')
  await page.getByRole('button', { name: 'حفظ' }).click()
  await page.getByRole('button', { name: 'سجّل قراءة النهارده' }).click()
  await expect(page.getByTestId('habit').getByText('🔥 1')).toBeVisible()

  await page.goto('./')
  await page.getByRole('button', { name: 'وضع التركيز' }).click()
  await expect(page.getByTestId('focus-mode')).toBeVisible()
  await page.getByRole('button', { name: 'اخرج من وضع التركيز' }).click()

  await quickAdd(page, 'مهمة للحذف')
  await page.getByRole('link', { name: 'المهام' }).click()
  await page.getByTestId('task-row').filter({ hasText: 'مهمة للحذف' }).click()
  await page.getByRole('button', { name: 'حذف', exact: true }).click()
  await page.goto('./#/trash')
  await page.getByRole('button', { name: 'استرجاع' }).click()
  await page.goto('./#/tasks')
  await expect(page.getByTestId('task-row').filter({ hasText: 'مهمة للحذف' })).toBeVisible()

  await page.goto('./#/insights')
  await expect(page.getByTestId('metric-execution')).toBeVisible()
})

test('gym module is reachable and keeps its own tabs', async ({ page }) => {
  await page.goto('./#/more')
  await page.getByRole('link', { name: /الصحة والجيم/ }).click()
  await expect(page.getByRole('button', { name: /ابدأ يوم/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'الجسم' })).toBeVisible()
  await page.getByRole('link', { name: 'Life OS' }).click()
  await expect(page.getByRole('link', { name: 'المشاريع' })).toBeVisible()
})
