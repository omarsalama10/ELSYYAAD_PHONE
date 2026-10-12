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

export default function App() {
  const [state, setState] = useState<'loading' | 'ready' | Error>('loading')
  useEffect(() => {
    ensureSeeded().then(() => {
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
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Today />} />
              <Route path="workouts" element={<WorkoutsScreen />} />
              <Route path="program" element={<ProgramScreen />} />
              <Route path="exercises" element={<LibraryScreen />} />
              <Route path="body" element={<BodyScreen />} />
              <Route path="progress" element={<ProgressScreen />} />
              <Route path="settings" element={<SettingsScreen />} />
            </Route>
            <Route path="session/:id" element={<SessionScreen />} />
            <Route path="exercises/:id" element={<ExerciseDetail />} />
            <Route path="workouts/:dayId" element={<DayDetail />} />
          </Routes>
        </HashRouter>
      </RestTimerProvider>
    </ToastProvider>
  )
}
