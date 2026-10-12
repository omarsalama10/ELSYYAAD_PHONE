import { NavLink, Outlet } from 'react-router-dom'
import { Icon } from './icons'

const TABS = [
  { to: '/', label: 'اليوم', icon: Icon.today, end: true },
  { to: '/program', label: 'البرنامج', icon: Icon.program },
  { to: '/body', label: 'الجسم', icon: Icon.body },
  { to: '/progress', label: 'التقدم', icon: Icon.progress },
  { to: '/settings', label: 'الإعدادات', icon: Icon.settings },
]

export function Layout() {
  return (
    <div className="min-h-full">
      <main className="mx-auto max-w-xl px-4 pb-28">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 backdrop-blur pb-safe">
        <div className="mx-auto flex max-w-xl">
          {TABS.map(({ to, label, icon: I, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? 'text-accent' : 'text-muted'}`}
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
