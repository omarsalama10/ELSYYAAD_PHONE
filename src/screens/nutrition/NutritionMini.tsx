import { Link } from 'react-router-dom'
import { fmtNum, todayISO } from '../../lib/format'
import { useNutrition } from '../../lib/nutrition'
import { ProgressRing } from '../../ui/viz'

/** Home card: today's calories and protein against target. */
export function NutritionMini() {
  const v = useNutrition(todayISO())
  if (!v) return null
  if (!v.targets)
    return (
      <Link to="/nutrition/setup" className="glass block p-4">
        <span className="font-semibold">🍽️ ظبط أكلك</span>
        <span className="block text-xs text-muted">نحسبلك السعرات والبروتين حسب هدفك (تضخيم نضيف)</span>
      </Link>
    )
  const pLeft = Math.max(0, Math.round(v.targets.p - v.totals.p))
  return (
    <Link to="/nutrition" className="glass flex items-center gap-4 p-4" aria-label="ملخص الأكل النهارده" data-testid="nutrition-mini">
      <ProgressRing value={v.totals.kcal / v.targets.kcal} size={64} stroke={7} label={`${v.totals.kcal} من ${v.targets.kcal} سعرة`}>
        <span className="text-xs font-bold num">{Math.round((v.totals.kcal / v.targets.kcal) * 100)}%</span>
      </ProgressRing>
      <div className="flex-1">
        <div className="font-semibold">🍽️ أكل النهارده</div>
        <div className="text-xs text-muted num">{v.totals.kcal} / {v.targets.kcal} سعرة • بروتين {fmtNum(v.totals.p, 0)} / {v.targets.p} جم</div>
        {pLeft > 0 && <div className="text-xs text-accent">فاضلك {pLeft} جم بروتين</div>}
      </div>
    </Link>
  )
}
