import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { lifeDb as db } from '../../src/life/db/db'
import {
  applyPlanChanges, approvePlan, createProject, createSnapshot, createTask, currentPlans, deleteTasks, finishTask, getSettings, instantiateProjectTemplate,
  loadAll, markHabit, createHabit, materializeRecurring, pauseTimer, postponeTask, projectAsTemplate, replaceAll, restoreSnapshot, restoreTask,
  runningLog, saveSettings, snapshotOnUpgrade, startTimer, taskEvents, updateGoal, createGoal, updateTask, purgeTrash,
} from '../../src/life/db/repo'
import { PLAN_SCHEMA, previewPlanFile } from '../../src/life/domain/planFile'
import { plan } from '../../src/life/domain/scheduler'
import { addDays, at } from '../../src/life/domain/time'
import { MON, time } from './factory'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('tasks', () => {
  it('records history, postponements and completion side effects', async () => {
    const t = await createTask({ title: 'تقرير', dueAt: time(17) }, time(8))
    await updateTask(t.id, { dueAt: time(17, 0, addDays(MON, 1)) }, { reason: 'اجتماع طارئ', now: time(9) })
    await updateTask(t.id, { status: 'done' }, { now: time(10) })
    const cur = (await db.tasks.get(t.id))!
    expect(cur).toMatchObject({ status: 'done', progress: 100, completedAt: time(10), postponeCount: 1 })
    const ev = await taskEvents(t.id)
    expect(ev.map((e) => e.type)).toEqual(['status', 'postponed', 'created'])
    expect(ev[1]!.reason).toBe('اجتماع طارئ')
  })

  it('postponeTask moves the start, unpins and keeps the deadline valid', async () => {
    const t = await createTask({ title: 'x', dueAt: time(17), pinned: { day: MON, startMin: 600 } })
    await postponeTask(t.id, addDays(MON, 2), 'وقت غير كافٍ')
    const cur = (await db.tasks.get(t.id))!
    expect(cur.pinned).toBeUndefined()
    expect(cur.startDate).toBe(addDays(MON, 2))
    expect(cur.dueAt).toBe(at(addDays(MON, 2), 23 * 60 + 59))
  })

  it('soft delete and restore', async () => {
    const t = await createTask({ title: 'x' })
    await deleteTasks([t.id])
    expect((await db.tasks.get(t.id))!.deletedAt).toBeDefined()
    await restoreTask(t.id)
    expect((await db.tasks.get(t.id))!.deletedAt).toBeUndefined()
  })

  it('materializes recurring instances idempotently', async () => {
    // Creating the series already materializes the next 7 days.
    await createTask({ title: 'مراجعة يومية', recurrence: { type: 'daily', every: 1 }, startDate: MON, estimateMin: 15 }, time(8))
    expect(await materializeRecurring(time(8), 7)).toBe(0)
    expect(await materializeRecurring(time(8), 9)).toBe(2)
    const inst = (await db.tasks.toArray()).filter((t) => t.seriesId)
    expect(inst.map((t) => t.occurrence).sort()).toEqual(Array.from({ length: 9 }, (_, i) => addDays(MON, i)))
    expect(inst.every((t) => !t.recurrence && t.estimateMin === 15)).toBe(true)
  })
})

describe('timer', () => {
  it('tracks actual time across pause/resume and only one runs at a time', async () => {
    const a = await createTask({ title: 'a', energy: 'deep' })
    const b = await createTask({ title: 'b' })
    await startTimer(a.id, { now: time(9) })
    await pauseTimer(time(9, 30))
    expect((await db.tasks.get(a.id))!).toMatchObject({ status: 'paused', actualMin: 30 })
    await startTimer(a.id, { now: time(10) })
    await startTimer(b.id, { now: time(10, 20) }) // switching closes a's segment
    expect((await db.tasks.get(a.id))!.actualMin).toBe(50)
    await finishTask(b.id, time(10, 50))
    expect(await runningLog()).toBeUndefined()
    expect((await db.tasks.get(b.id))!).toMatchObject({ status: 'done', actualMin: 30 })
    expect((await db.logs.toArray()).find((l) => l.taskId === a.id)!.kind).toBe('deep')
  })
})

describe('plans', () => {
  it('approving keeps revisions and marks tasks planned', async () => {
    const t = await createTask({ title: 'a', estimateMin: 30 })
    const s = await getSettings()
    const r = plan({ tasks: [t], commitments: [], settings: s, now: time(9), days: 1 })
    await approvePlan(r.blocks, [MON], undefined, time(9))
    await approvePlan(r.blocks, [MON], 'إعادة جدولة', time(10))
    const all = await db.plans.toArray()
    expect(all.map((p) => [p.revision, p.current]).sort()).toEqual([[1, 0], [2, 1]])
    expect((await currentPlans(MON, addDays(MON, 1)))[0]!.reason).toBe('إعادة جدولة')
    expect((await db.tasks.get(t.id))!.status).toBe('planned')
  })
})

describe('goals and habits', () => {
  it('goal target changes keep a reason', async () => {
    const g = await createGoal({ title: 'هدف', startDate: MON, targetDate: addDays(MON, 30) })
    await updateGoal(g.id, { targetDate: addDays(MON, 45) }, 'نطاق أكبر')
    expect((await db.goals.get(g.id))!.changes[0]).toMatchObject({ field: 'targetDate', reason: 'نطاق أكبر' })
  })

  it('habit marks cycle done → skipped → none', async () => {
    const h = await createHabit({ title: 'قراءة' })
    await markHabit(h.id, MON)
    expect((await db.habitLogs.toArray())[0]!.mark).toBe('done')
    await markHabit(h.id, MON)
    expect((await db.habitLogs.toArray())[0]!.mark).toBe('skipped')
    await markHabit(h.id, MON)
    expect(await db.habitLogs.count()).toBe(0)
  })
})

describe('templates', () => {
  it('round-trips a project with milestones and dependencies', async () => {
    const p = await createProject({ name: 'إطلاق', startDate: MON })
    const a = await createTask({ title: 'تطوير', projectId: p.id, estimateMin: 120, dueAt: at(addDays(MON, 5), 0) })
    await createTask({ title: 'اختبار', projectId: p.id, dependsOn: [a.id] })
    const tpl = await projectAsTemplate(p.id, 'قالب إطلاق')
    const q = await instantiateProjectTemplate(tpl.id, 'إطلاق 2', addDays(MON, 10))
    const ts = await db.tasks.where('projectId').equals(q.id).toArray()
    const dev = ts.find((t) => t.title === 'تطوير')!
    expect(ts.find((t) => t.title === 'اختبار')!.dependsOn).toEqual([dev.id])
    expect(dev.dueAt).toBe(at(addDays(MON, 15), 23 * 60 + 59))
  })
})

describe('settings, snapshots and plan import', () => {
  it('merges settings with defaults', async () => {
    await saveSettings({ bufferPct: 0.3 })
    expect(await getSettings()).toMatchObject({ bufferPct: 0.3, defaultSessionMin: 90 })
  })

  it('applies a plan file after a snapshot and can roll back', async () => {
    await createTask({ title: 'قديمة' })
    const data = await loadAll()
    let n = 0
    const preview = previewPlanFile({ schema: PLAN_SCHEMA, title: 'خطة الأسبوع', projects: [{ ref: 'p', name: 'جديد' }], tasks: [{ title: 'مهمة جديدة', project: 'p' }] }, data, { now: Date.now(), newId: () => `n${++n}` })
    expect(preview.errors).toEqual([])
    await applyPlanChanges(preview.changes, 'خطة الأسبوع', '2.0.0')
    expect(await db.tasks.count()).toBe(2)
    expect(await db.projects.count()).toBe(1)
    const snap = (await db.snapshots.toArray()).find((s) => s.reason.includes('خطة الأسبوع'))!
    await restoreSnapshot(snap.id, '2.0.0')
    expect(await db.tasks.count()).toBe(1)
    expect(await db.projects.count()).toBe(0)
  })

  it('snapshots automatically on version change only when data exists', async () => {
    expect(await snapshotOnUpgrade('1.0.0')).toBe(false)
    await createTask({ title: 'x' })
    expect(await snapshotOnUpgrade('1.0.0')).toBe(false)
    expect(await snapshotOnUpgrade('2.0.0')).toBe(true)
    expect((await db.snapshots.toArray())[0]!.appVersion).toBe('1.0.0')
  })

  it('replaceAll validates and restores everything', async () => {
    await createTask({ title: 'x' })
    await createSnapshot('يدوي', '2.0.0')
    const d = await loadAll()
    await db.tasks.clear()
    await replaceAll(JSON.parse(JSON.stringify(d)))
    expect(await db.tasks.count()).toBe(1)
    await expect(replaceAll({ schema: 99 })).rejects.toThrow('غير مدعوم')
  })

  it('purges only old trash', async () => {
    const a = await createTask({ title: 'قديم' })
    const b = await createTask({ title: 'حديث' })
    await deleteTasks([a.id], Date.now() - 40 * 86_400_000)
    await deleteTasks([b.id])
    expect(await purgeTrash(30)).toBe(1)
    expect(await db.tasks.count()).toBe(1)
  })
})
