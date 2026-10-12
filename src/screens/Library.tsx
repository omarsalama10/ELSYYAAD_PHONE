import { useNavigate } from 'react-router-dom'
import { useExercises } from '../lib/hooks'
import { ExerciseList } from '../ui/ExerciseList'
import { PageTitle } from '../ui/primitives'

export function LibraryScreen() {
  const nav = useNavigate()
  const exercises = useExercises()
  if (!exercises) return null
  return (
    <div className="space-y-3">
      <PageTitle>مكتبة التمارين</PageTitle>
      <ExerciseList exercises={[...exercises.values()]} onPick={(e) => nav(`/exercises/${encodeURIComponent(e.id)}`)} />
    </div>
  )
}
