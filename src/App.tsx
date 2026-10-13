import { useEffect, useState } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { ensureSeeded } from './db/seed'
import { CATALOG } from './data/catalog'
import { startImageWarmup } from './lib/offline'
import { Layout } from './ui/Layout'
import { RestTimerProvider } from './ui/RestTimer'
import { ToastProvider } from './ui/Toast'
import { Today } from './screens/Today'
import { SessionScreen } from './screens/Session'
import { ProgramScreen } from './screens/Program'
import { LibraryScreen } from './screens/Library'
import { ExerciseDetail } from './screens/ExerciseDetail'
import { BodyScreen } from './screens/Body'
import { ProgressScreen } from './screens/Progress'
import { SettingsScreen } from './screens/Settings'
import { WorkoutsScreen } from './screens/Workouts'
import { DayDetail } from './screens/DayDetail'
import { HistoryDetail, HistoryList } from './screens/History'
import { materializeRecurring, snapshotOnUpgrade } from './life/db/repo'
import { LifeProvider } from './life/state'
import { ReminderEngine } from './life/lib/reminderEngine'
import { QuickAddProvider } from './life/ui/tasks'
import { Home } from './life/screens/Home'
import { PlanScreen } from './life/screens/Plan'
import { TasksScreen } from './life/screens/Tasks'
import { TaskDetail } from './life/screens/TaskDetail'
import { ProjectsScreen } from './life/screens/Projects'
import { ProjectDetail } from './life/screens/ProjectDetail'
import { GoalDetail, GoalsScreen } from './life/screens/Goals'
import { HabitsScreen } from './life/screens/Habits'
import { FocusScreen } from './life/screens/Focus'
import { InsightsScreen } from './life/screens/Insights'
import { NotesScreen } from './life/screens/Notes'
import { DataCenter } from './life/screens/DataCenter'
import { MoreScreen } from './life/screens/More'
import { TrashScreen } from './life/screens/Trash'
import { InboxScreen } from './life/screens/Inbox'
import { TemplatesScreen } from './life/screens/Templates'
import { PlannerSettings } from './life/screens/PlannerSettings'

/** Gym data seed + Life OS upkeep: pre-upgrade snapshot, then recurring instances. */
async function init() {
  await ensureSeeded()
  await snapshotOnUpgrade(__APP_VERSION__)
  await materializeRecurring()
}

export default function App() {
  const [state, setState] = useState<'loading' | 'ready' | Error>('loading')
  useEffect(() => {
    init().then(() => {
      setState('ready')
      startImageWarmup([...new Set(CATALOG.flatMap((e) => e.images))])
    }, (e: unknown) => setState(e instanceof Error ? e : new Error(String(e))))
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
      <RestTimerProvider>
        <LifeProvider>
          <HashRouter>
            <QuickAddProvider>
              <ReminderEngine />
              <Routes>
                <Route element={<Layout />}>
                  {/* Life OS */}
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
                  <Route path="settings" element={<SettingsScreen />} />
                  <Route path="settings/planner" element={<PlannerSettings />} />
                  {/* Health & gym module */}
                  <Route path="gym" element={<Today />} />
                  <Route path="workouts" element={<WorkoutsScreen />} />
                  <Route path="program" element={<ProgramScreen />} />
                  <Route path="exercises" element={<LibraryScreen />} />
                  <Route path="body" element={<BodyScreen />} />
                  <Route path="progress" element={<ProgressScreen />} />
                </Route>
                <Route path="session/:id" element={<SessionScreen />} />
                <Route path="exercises/:id" element={<ExerciseDetail />} />
                <Route path="workouts/:dayId" element={<DayDetail />} />
                <Route path="history" element={<HistoryList />} />
                <Route path="history/:id" element={<HistoryDetail />} />
              </Routes>
            </QuickAddProvider>
          </HashRouter>
        </LifeProvider>
      </RestTimerProvider>
    </ToastProvider>
  )
}
