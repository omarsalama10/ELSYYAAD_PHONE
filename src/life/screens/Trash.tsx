import { lifeDb } from '../db/db'
import { purgeTrash, restoreGoal, restoreNote, restoreProject, restoreTask } from '../db/repo'
import { dayKey } from '../domain/time'
import { useLife } from '../state'
import { Button } from '../../ui/primitives'
import { useSafe, useToast } from '../../ui/Toast'
import { fmtDayShort } from '../ui/format'
import { Empty, Header } from '../ui/kit'

export function TrashScreen() {
  const { data } = useLife()
  const safe = useSafe()
  const toast = useToast()
  const items = [
    ...data.tasks.filter((t) => t.deletedAt).map((t) => ({ id: t.id, kind: 'مهمة', title: t.title, at: t.deletedAt!, restore: () => restoreTask(t.id) })),
    ...data.projects.filter((p) => p.deletedAt).map((p) => ({ id: p.id, kind: 'مشروع', title: p.name, at: p.deletedAt!, restore: () => restoreProject(p.id) })),
    ...data.goals.filter((g) => g.deletedAt).map((g) => ({ id: g.id, kind: 'هدف', title: g.title, at: g.deletedAt!, restore: () => restoreGoal(g.id) })),
    ...data.notes.filter((n) => n.deletedAt).map((n) => ({ id: n.id, kind: 'ملاحظة', title: n.title, at: n.deletedAt!, restore: () => restoreNote(n.id) })),
    ...data.commitments.filter((c) => c.deletedAt).map((c) => ({ id: c.id, kind: 'التزام', title: c.title, at: c.deletedAt!, restore: async () => { const x = await lifeDb.commitments.get(c.id); if (x) { delete x.deletedAt; await lifeDb.commitments.put(x) } } })),
  ].sort((a, b) => b.at - a.at)
  return (
    <div className="space-y-3">
      <Header back title="سلة المحذوفات" sub="الحذف هنا مؤقت؛ بعد 30 يوم تقدر تفضّيها" />
      {items.length === 0 ? <Empty>السلة فاضية.</Empty> : items.map((i) => (
        <div key={i.id} className="glass flex items-center gap-2 px-3.5 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{i.title}</span>
            <span className="text-xs text-muted">{i.kind} • اتحذف {fmtDayShort(dayKey(i.at))}</span>
          </span>
          <Button variant="soft" className="px-3 py-1.5 text-sm" onClick={() => void safe(i.restore, 'اترجع')}>استرجاع</Button>
        </div>
      ))}
      {items.length > 0 && (
        <Button variant="danger" className="w-full" onClick={() => void safe(async () => {
          if (!confirm('تمسح نهائيًا اللي عدّى عليه أكتر من 30 يوم في السلة؟')) return
          toast(`اتمسح ${await purgeTrash(30)} عنصر نهائيًا`)
        })}>تفضية القديم (+30 يوم)</Button>
      )}
    </div>
  )
}
