import { describe, expect, it } from 'vitest'
import { PLAN_SCHEMA, previewPlanFile, type ExistingData } from '../../src/life/domain/planFile'
import { newGoal, newProject } from '../../src/life/domain/factory'
import { at } from '../../src/life/domain/time'
import { MON, settings, task, time } from './factory'

const empty = (): ExistingData => ({ tasks: [], projects: [], goals: [], milestones: [], commitments: [], habits: [], notes: [], settings: settings() })
let i = 0
const opt = { now: time(9), newId: () => `new${++i}` }

describe('plan file preview', () => {
  it('rejects wrong schema and non-objects', () => {
    expect(previewPlanFile({ schema: 'x' }, empty(), opt).errors[0]).toContain('schema')
    expect(previewPlanFile([], empty(), opt).errors.length).toBe(1)
  })

  it('creates linked records via refs in any order', () => {
    const p = previewPlanFile({
      schema: PLAN_SCHEMA,
      tasks: [
        { ref: 't2', title: 'اختبار', project: 'p1', dependsOn: ['t1'], due: '2026-10-20', estimateMin: 60 },
        { ref: 't1', title: 'تطوير', project: 'p1', milestone: 'm1', due: '2026-10-18T15:00', checklist: ['تصميم', { title: 'كود', done: true }] },
      ],
      projects: [{ ref: 'p1', name: 'برنامج', goal: 'g1' }],
      milestones: [{ ref: 'm1', title: 'MVP', project: 'p1' }],
      goals: [{ ref: 'g1', title: 'إصدار أول', targetDate: '2026-11-12' }],
    }, empty(), opt)
    expect(p.errors).toEqual([])
    const tasks = p.changes.filter((c) => c.entity === 'task')
    const proj = p.changes.find((c) => c.entity === 'project')!
    const t1 = tasks.find((c) => c.title === 'تطوير')!.record as { id: string; dueAt: number; checklist: unknown[] }
    const t2 = tasks.find((c) => c.title === 'اختبار')!.record as { dependsOn: string[]; projectId: string }
    expect(t2.dependsOn).toEqual([t1.id])
    expect(t2.projectId).toBe(proj.id)
    expect(t1.dueAt).toBe(at('2026-10-18', 900))
    expect(t1.checklist).toHaveLength(2)
    expect(p.changes.every((c) => c.action === 'create')).toBe(true)
  })

  it('updates existing records by id or exact name and reports field diffs', () => {
    const d = empty()
    d.tasks = [task({ id: 'x', title: 'قديمة', importance: 2 })]
    d.projects = [newProject('p', 0, { name: 'برنامج المحاسبة' })]
    const p = previewPlanFile({ schema: PLAN_SCHEMA, tasks: [{ id: 'x', importance: 5, project: 'برنامج المحاسبة' }] }, d, opt)
    expect(p.errors).toEqual([])
    expect(p.changes[0]).toMatchObject({ action: 'update', id: 'x' })
    expect(p.changes[0]!.fields.map((f) => f.field).sort()).toEqual(['importance', 'projectId'])
  })

  it('soft-deletes and logs goal changes with a reason', () => {
    const d = empty()
    d.tasks = [task({ id: 'x', title: 'ملغية' })]
    d.goals = [newGoal('g', 0, { title: 'هدف', startDate: MON, targetDate: '2026-11-01' })]
    const p = previewPlanFile({ schema: PLAN_SCHEMA, tasks: [{ id: 'x', delete: true }], goals: [{ id: 'g', targetDate: '2026-11-15', reason: 'ضغط شغل' }] }, d, opt)
    expect(p.errors).toEqual([])
    const del = p.changes.find((c) => c.entity === 'task')!
    expect(del.action).toBe('delete')
    expect((del.record as { deletedAt?: number }).deletedAt).toBe(opt.now)
    const g = p.changes.find((c) => c.entity === 'goal')!.record as { changes: { reason: string; field: string }[] }
    expect(g.changes).toEqual([expect.objectContaining({ field: 'targetDate', reason: 'ضغط شغل' })])
  })

  it('collects precise validation errors', () => {
    const p = previewPlanFile({
      schema: PLAN_SCHEMA,
      tasks: [{ title: '', importance: 9, due: 'tomorrow', project: 'missing' }, { id: 'nope', title: 'x' }],
      commitments: [{ title: 'شغل', start: '17:00', end: '09:00' }],
    }, empty(), opt)
    const all = p.errors.join('\n')
    expect(all).toContain('tasks[0].title')
    expect(all).toContain('tasks[0].importance')
    expect(all).toContain('tasks[0].due')
    expect(all).toContain('tasks[0].project')
    expect(all).toContain('tasks[1].id')
    expect(all).toContain('commitments[0]')
  })

  it('detects dependency cycles including existing tasks', () => {
    const d = empty()
    d.tasks = [task({ id: 'a', dependsOn: ['b'] }), task({ id: 'b' })]
    const p = previewPlanFile({ schema: PLAN_SCHEMA, tasks: [{ id: 'b', dependsOn: ['a'] }] }, d, opt)
    expect(p.errors.join()).toContain('اعتماديات دائرية')
  })

  it('patches settings with HH:mm times', () => {
    const p = previewPlanFile({ schema: PLAN_SCHEMA, settings: { dayStart: '07:30', bufferPct: 0.2, restWeekdays: [5] } }, empty(), opt)
    expect(p.errors).toEqual([])
    expect(p.changes[0]!.record).toMatchObject({ dayStartMin: 450, bufferPct: 0.2, restWeekdays: [5] })
  })
})
