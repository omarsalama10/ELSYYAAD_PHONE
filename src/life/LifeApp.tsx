import { useEffect, useState } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../ui/Toast'
import { materializeRecurring, snapshotOnUpgrade } from './db/repo'
import { lifeDb } from './db/db'
import { LifeProvider } from './state'
import { ReminderEngine } from './lib/reminderEngine'
import { QuickAddProvider } from './ui/tasks'
import { LifeLayout } from './ui/LifeLayout'
import { Home } from './screens/Home'
import { PlanScreen } from './screens/Plan'
import { TasksScreen } from './screens/Tasks'
import { TaskDetail } from './screens/TaskDetail'
import { ProjectsScreen } from './screens/Projects'
import { ProjectDetail } from './screens/ProjectDetail'
import { GoalDetail, GoalsScreen } from './screens/Goals'
import { HabitsScreen } from './screens/Habits'
import { FocusScreen } from './screens/Focus'
import { InsightsScreen } from './screens/Insights'
import { NotesScreen } from './screens/Notes'
import { DataCenter } from './screens/DataCenter'
import { MoreScreen } from './screens/More'
import { TrashScreen } from './screens/Trash'
import { InboxScreen } from './screens/Inbox'
import { TemplatesScreen } from './screens/Templates'
import { PlannerSettings } from './screens/PlannerSettings'
import { LifeSettingsScreen } from './screens/LifeSettings'

/** Pre-upgrade snapshot, then recurring instances for the coming week. */
async function init() {
  await lifeDb.open()
  await snapshotOnUpgrade(__APP_VERSION__)
  await materializeRecurring()
}

/** ELSYYAAD Life OS — a separate PWA from the gym tracker (own origin, own data). */
export default function LifeApp() {
  const [state, setState] = useState<'loading' | 'ready' | Error>('loading')
  useEffect(() => {
    init().then(() => setState('ready'), (e: unknown) => setState(e instanceof Error ? e : new Error(String(e))))
  }, [])

  if (state === 'loading') return <div className="flex h-screen items-center justify-center text-muted">...</div>
  if (state instanceof Error)
    return (
      <div className="p-6 pt-safe space-y-2">
        <h1 className="text-xl font-bold text-danger">مقدرناش نفتح قاعدة البيانات</h1>
        <p className="text-sm text-muted">لو فاتح من وضع التصفح الخاص (Private) افتح من الأيقونة على الشاشة الرئيسية.</p>
        <pre className="ltr text-xs text-muted whitespace-pre-wrap">{state.message}</pre>
      </div>
    )

  return (
    <ToastProvider>
      <LifeProvider>
        <HashRouter>
          <QuickAddProvider>
            <ReminderEngine />
            <Routes>
              <Route element={<LifeLayout />}>
                <Route index element={<Home />} />
                <Route path="plan" element={<PlanScreen />} />
                <Route path="tasks" element={<TasksScreen />} />
                <Route path="tasks/:id" element={<TaskDetail />} />
                <Route path="projects" element={<ProjectsScreen />} />
                <Route path="projects/:id" element={<ProjectDetail />} />
                <Route path="goals" element={<GoalsScreen />} />
                <Route path="goals/:id" element={<GoalDetail />} />
                <Route path="habits" element={<HabitsScreen />} />
                <Route path="focus" element={<FocusScreen />} />
                <Route path="insights" element={<InsightsScreen />} />
                <Route path="notes" element={<NotesScreen />} />
                <Route path="data" element={<DataCenter />} />
                <Route path="more" element={<MoreScreen />} />
                <Route path="trash" element={<TrashScreen />} />
                <Route path="inbox" element={<InboxScreen />} />
                <Route path="templates" element={<TemplatesScreen />} />
                <Route path="settings" element={<LifeSettingsScreen />} />
                <Route path="settings/planner" element={<PlannerSettings />} />
              </Route>
            </Routes>
          </QuickAddProvider>
        </HashRouter>
      </LifeProvider>
    </ToastProvider>
  )
}
