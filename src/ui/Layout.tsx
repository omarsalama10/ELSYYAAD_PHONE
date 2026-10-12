import { NavLink, Outlet } from 'react-router-dom'
import { Icon } from './icons'

const TABS = [
  { to: '/', label: 'الرئيسية', icon: Icon.today, end: true },
  { to: '/workouts', label: 'التمارين', icon: Icon.program },
  { to: '/progress', label: 'التقدم', icon: Icon.progress },
  { to: '/body', label: 'الجسم', icon: Icon.body },
  { to: '/settings', label: 'الإعدادات', icon: Icon.settings },
]

export function Layout() {
  return (
    <div className="min-h-full">
      <main className="mx-auto max-w-xl px-4 pb-32">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 px-4 pb-safe">
        <div className="glass-strong mx-auto mb-2 flex max-w-xl items-center justify-between rounded-[1.75rem] px-2 py-1.5">
          {TABS.map(({ to, label, icon: I, end }) => (
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
