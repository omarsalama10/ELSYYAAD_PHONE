import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Icon } from './icons'
import { LI } from '../life/ui/icons'
import { useQuickAdd } from '../life/ui/tasks'

const LIFE_TABS = [
  { to: '/', label: 'اليوم', icon: () => LI.sun(), end: true },
  { to: '/plan', label: 'الخطة', icon: () => LI.calendar() },
  { to: '/tasks', label: 'المهام', icon: () => LI.tasks() },
  { to: '/projects', label: 'المشاريع', icon: () => LI.folder() },
  { to: '/more', label: 'المزيد', icon: () => LI.grid() },
]

/** The gym tracker keeps its own tabs; it is the optional health module of Life OS. */
const GYM_TABS = [
  { to: '/gym', label: 'الرئيسية', icon: Icon.today, end: true },
  { to: '/workouts', label: 'التمارين', icon: Icon.program },
  { to: '/progress', label: 'التقدم', icon: Icon.progress },
  { to: '/body', label: 'الجسم', icon: Icon.body },
  { to: '/settings', label: 'الإعدادات', icon: Icon.settings },
]

const GYM_PATHS = ['/gym', '/workouts', '/program', '/exercises', '/body', '/progress']
export const isGymPath = (p: string) => GYM_PATHS.some((g) => p === g || p.startsWith(`${g}/`))

export function Layout() {
  const { pathname } = useLocation()
  const gym = isGymPath(pathname)
  const tabs = gym ? GYM_TABS : LIFE_TABS
  const quick = useQuickAdd()
  const showFab = !gym && ['/', '/plan', '/tasks', '/projects'].includes(pathname)
  return (
    <div className="min-h-full">
      <main className="mx-auto max-w-xl px-4 pb-32">
        <Outlet />
      </main>
      {showFab && (
        <button type="button" aria-label="إضافة سريعة" onClick={() => quick.open()}
          className="fixed bottom-24 left-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-onaccent shadow-lift active:scale-95">
          {LI.plus('h-7 w-7')}
        </button>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-40 px-4 pb-safe">
        <div className="glass-strong mx-auto mb-2 flex max-w-xl items-center justify-between rounded-[1.75rem] px-2 py-1.5">
          {tabs.map(({ to, label, icon: I, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10.5px] transition ${isActive ? 'bg-accent/15 font-semibold text-accent' : 'text-muted'}`
              }
            >
              <I />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

/** Full-screen page without the tab bar (workout, details). */
export function Bare({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-xl px-4 pb-32">{children}</main>
}
