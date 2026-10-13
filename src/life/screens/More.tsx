import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useLife } from '../state'
import { LI } from '../ui/icons'
import { Header } from '../ui/kit'

export function MoreScreen() {
  const { data } = useLife()
  const trash = data.tasks.filter((t) => t.deletedAt).length + data.projects.filter((p) => p.deletedAt).length + data.notes.filter((n) => n.deletedAt).length + data.goals.filter((g) => g.deletedAt).length
  const inbox = data.reminders.filter((r) => r.status === 'missed').length
  const items: { to: string; label: string; sub: string; icon: ReactNode; badge?: number }[] = [
    { to: '/goals', label: 'الأهداف', sub: 'نتائج قابلة للقياس ← مراحل ← مهام', icon: LI.target() },
    { to: '/habits', label: 'العادات والإيقاع', sub: 'سلاسل الالتزام بدون ضغط', icon: LI.repeat() },
    { to: '/focus', label: 'جلسة تركيز', sub: 'مؤقت عمل واستراحة مربوط بمهمة', icon: LI.focus() },
    { to: '/insights', label: 'التحليلات', sub: 'مؤشرات بتعريفات واضحة', icon: LI.chart() },
    { to: '/notes', label: 'الملاحظات والقرارات', sub: 'بنك أفكار وسجل قرارات ومخاطر', icon: LI.note() },
    { to: '/inbox', label: 'التنبيهات والمتابعة', sub: 'تذكيرات فاتت وأسئلة متابعة', icon: LI.bell(), badge: inbox },
    { to: '/data', label: 'Claude والبيانات', sub: 'صدّر الحالة، استورد خطة، نسخ رجوع', icon: LI.data() },
    { to: '/templates', label: 'القوالب', sub: 'مهام ومشاريع جاهزة', icon: LI.template() },
    { to: '/gym', label: 'الصحة والجيم', sub: 'التمرين والأكل وInBody والجسم', icon: LI.dumbbell() },
    { to: '/trash', label: 'سلة المحذوفات', sub: 'استرجاع أي حاجة اتحذفت بالغلط', icon: LI.trash(), badge: trash },
    { to: '/settings', label: 'الإعدادات', sub: 'التخطيط، التذكير، النسخ الاحتياطي', icon: LI.settings() },
  ]
  return (
    <div className="space-y-3">
      <Header title="المزيد" />
      <div className="grid gap-2">
        {items.map((i) => (
          <Link key={i.to} to={i.to} className="glass flex items-center gap-3 p-3.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/12 text-accent">{i.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{i.label}</span>
              <span className="block truncate text-xs text-muted">{i.sub}</span>
            </span>
            {!!i.badge && <span className="rounded-full bg-danger px-2 text-xs font-bold text-white num">{i.badge}</span>}
          </Link>
        ))}
      </div>
      <p className="pt-2 text-center text-xs text-muted">ELSYYAAD Life OS v{__APP_VERSION__} • كل البيانات على جهازك</p>
    </div>
  )
}
