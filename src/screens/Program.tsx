import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { getActiveProgram, saveProgram, uid } from '../db/repo'
import { addBlock, moveBlock, removeBlock, toggleSupersetWithPrev, updateBlock } from '../domain/programEdit'
import type { Block, Exercise, Program, Section } from '../domain/types'
import { UNIT } from '../lib/format'
import { useExercises } from '../lib/hooks'
import { SECTION_AR } from '../lib/workout'
import { ExerciseList } from '../ui/ExerciseList'
import { Icon } from '../ui/icons'
import { CommitNumber, PageTitle } from '../ui/primitives'
import { useSafe } from '../ui/Toast'
import { Segmented } from '../ui/viz'

type Picker = { mode: 'add'; section: Section } | { mode: 'swap'; blockId: string }
const SECTIONS: Section[] = ['warmup', 'main', 'finisher', 'cardio']

function newBlock(e: Exercise, section: Section): Block {
  const timed = e.metric === 'time'
  const cardio = e.metric === 'cardio'
  return {
    id: uid(), exerciseId: e.id, section,
    sets: cardio || section === 'warmup' ? 1 : 3,
    repMin: cardio ? 20 : timed ? 30 : 8,
    repMax: cardio ? 20 : timed ? 45 : 12,
    restSec: section === 'warmup' || cardio ? 0 : 90,
  }
}

export function ProgramScreen() {
  const safe = useSafe()
  const exercises = useExercises()
  const program = useLiveQuery(() => getActiveProgram(), [])
  const [dayId, setDayId] = useState('A')
  const [picker, setPicker] = useState<Picker>()
  if (!program || !exercises) return null
  const day = program.days.find((d) => d.id === dayId) ?? program.days[0]!

  const save = (next: Program) => safe(() => saveProgram(next))

  if (picker)
    return (
      <div className="space-y-3">
        <PageTitle action={<button type="button" className="text-accent2" onClick={() => setPicker(undefined)}>إلغاء</button>}>
          {picker.mode === 'add' ? 'ضيف تمرين' : 'بدّل التمرين'}
        </PageTitle>
        <ExerciseList
          exercises={[...exercises.values()]}
          onPick={(e) => {
            const next = picker.mode === 'add'
              ? addBlock(program, day.id, picker.section, newBlock(e, picker.section))
              : updateBlock(program, day.id, picker.blockId, { exerciseId: e.id })
            void save(next)
            setPicker(undefined)
          }}
        />
      </div>
    )

  return (
    <div className="space-y-4">
      <PageTitle action={<Link to="/exercises" className="glass-strong rounded-2xl px-3 py-2 text-sm text-accent">مكتبة التمارين</Link>}>
        <span className="flex items-center gap-2"><Link to="/workouts" aria-label="رجوع" className="text-muted"><Icon.back /></Link>البرنامج</span>
      </PageTitle>
      <p className="-mt-2 text-sm text-muted">{program.name} — أي تعديل بيتحفظ لوحده.</p>

      <Segmented options={program.days.map((d) => ({ value: d.id, label: d.name }))} value={day.id} onChange={setDayId} />

      {SECTIONS.map((sec) => {
        const blocks = day.blocks.filter((b) => b.section === sec)
        return (
          <section key={sec} className="space-y-2">
            <h2 className="text-sm font-bold text-muted">{SECTION_AR[sec]}</h2>
            {blocks.map((b, i) => {
              const e = exercises.get(b.exerciseId)
              const linked = !!b.group && blocks[i - 1]?.group === b.group
              const unit = e ? UNIT[e.metric] : ''
              return (
                <div key={b.id} className={`glass p-3 ${b.group ? 'ring-2 ring-accent2/40' : ''}`} data-testid={`edit-${b.id}`}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold">{e?.nameAr ?? b.exerciseId}</div>
                      <div className="ltr truncate text-right text-xs text-muted">{e?.name}</div>
                    </div>
                    <button type="button" aria-label="لفوق" className="rounded-lg bg-white/60 p-1.5" onClick={() => void save(moveBlock(program, day.id, b.id, -1))}><Icon.up /></button>
                    <button type="button" aria-label="لتحت" className="rounded-lg bg-white/60 p-1.5" onClick={() => void save(moveBlock(program, day.id, b.id, 1))}><Icon.down /></button>
                    <button type="button" aria-label="حذف" className="rounded-lg bg-danger/15 p-1.5 text-danger" onClick={() => { if (confirm('تشيل التمرين ده من اليوم؟')) void save(removeBlock(program, day.id, b.id)) }}><Icon.trash /></button>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-muted">
                    <label className="space-y-1">مجموعات<CommitNumber ariaLabel="مجموعات" min={1} value={b.sets} onCommit={(v) => void save(updateBlock(program, day.id, b.id, { sets: Math.round(v) }))} /></label>
                    <label className="space-y-1">من ({unit})<CommitNumber ariaLabel="من" value={b.repMin} onCommit={(v) => void save(updateBlock(program, day.id, b.id, { repMin: v, repMax: Math.max(v, b.repMax) }))} /></label>
                    <label className="space-y-1">لـ ({unit})<CommitNumber ariaLabel="إلى" value={b.repMax} onCommit={(v) => void save(updateBlock(program, day.id, b.id, { repMax: v, repMin: Math.min(v, b.repMin) }))} /></label>
                    <label className="space-y-1">راحة (ث)<CommitNumber ariaLabel="راحة" value={b.restSec} onCommit={(v) => void save(updateBlock(program, day.id, b.id, { restSec: Math.round(v) }))} /></label>
                  </div>
                  <div className="mt-2 flex gap-3 text-sm">
                    <button type="button" className="text-accent2" onClick={() => setPicker({ mode: 'swap', blockId: b.id })}>بدّل التمرين</button>
                    {i > 0 && (
                      <button type="button" className={linked ? 'text-warn' : 'text-accent2'} onClick={() => void save(toggleSupersetWithPrev(program, day.id, b.id, uid()))}>
                        {linked ? 'فك السوبر سيت' : 'سوبر سيت مع اللي قبله'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            <button type="button" className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-line py-2 text-sm text-accent2" onClick={() => setPicker({ mode: 'add', section: sec })}>
              <Icon.plus /> ضيف تمرين
            </button>
          </section>
        )
      })}
    </div>
  )
}
