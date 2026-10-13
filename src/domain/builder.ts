import type { Block, Exercise, Program, ProgramDay, Section } from './types'

export type BGoal = 'strength' | 'hypertrophy' | 'recomp' | 'fatloss'
export type Experience = 'beginner' | 'returning' | 'intermediate' | 'advanced'
export type Equipment = 'gym' | 'dumbbells' | 'bodyweight'
export type Limitation = 'knee' | 'lowerback' | 'shoulder'
export type Focus = 'legs' | 'back' | 'chest' | 'shoulders' | 'arms' | 'forearms' | 'abs' | 'glutes'

export interface BuilderInput {
  goal: BGoal
  experience: Experience
  days: number
  minutes: number
  equipment: Equipment
  focus: Focus[]
  limitations: Limitation[]
  posture: boolean
  cardio: boolean
}

type Pattern =
  | 'squat' | 'hinge' | 'lunge' | 'legcurl' | 'legext' | 'glute' | 'calves' | 'adductor'
  | 'hpush' | 'ipush' | 'vpush' | 'hpull' | 'vpull' | 'reardelt' | 'lateral' | 'traps'
  | 'biceps' | 'triceps' | 'wristflex' | 'wristext' | 'grip' | 'coreA' | 'coreB' | 'cardio'

/** Candidate exercises per pattern and equipment, in order of preference. */
export const CANDIDATES: Record<Pattern, Record<Equipment, string[]>> = {
  squat: { gym: ['Hack_Squat', 'Barbell_Squat', 'Leg_Press', 'Goblet_Squat'], dumbbells: ['Goblet_Squat', 'Dumbbell_Squat'], bodyweight: ['Bodyweight_Squat'] },
  hinge: { gym: ['Romanian_Deadlift', 'Trap_Bar_Deadlift', 'Barbell_Hip_Thrust'], dumbbells: ['Stiff-Legged_Dumbbell_Deadlift', 'Single_Leg_Glute_Bridge'], bodyweight: ['Single_Leg_Glute_Bridge', 'Superman'] },
  lunge: { gym: ['Split_Squat_with_Dumbbells', 'single_leg_press', 'Dumbbell_Lunges'], dumbbells: ['Split_Squat_with_Dumbbells', 'Dumbbell_Step_Ups', 'Dumbbell_Lunges'], bodyweight: ['Bodyweight_Walking_Lunge', 'Single_Leg_Glute_Bridge'] },
  legcurl: { gym: ['Lying_Leg_Curls', 'Seated_Leg_Curl'], dumbbells: ['Stiff-Legged_Dumbbell_Deadlift'], bodyweight: ['Single_Leg_Glute_Bridge'] },
  legext: { gym: ['Single-Leg_Leg_Extension', 'Leg_Extensions'], dumbbells: ['Goblet_Squat'], bodyweight: ['Bodyweight_Squat'] },
  glute: { gym: ['Barbell_Hip_Thrust', 'Single_Leg_Glute_Bridge'], dumbbells: ['Single_Leg_Glute_Bridge', 'Glute_Kickback'], bodyweight: ['Single_Leg_Glute_Bridge', 'Glute_Kickback'] },
  calves: { gym: ['Standing_Calf_Raises', 'Seated_Calf_Raise'], dumbbells: ['Standing_Dumbbell_Calf_Raise'], bodyweight: [] },
  adductor: { gym: ['Thigh_Adductor'], dumbbells: [], bodyweight: [] },
  hpush: { gym: ['Dumbbell_Bench_Press', 'Barbell_Bench_Press_-_Medium_Grip', 'Machine_Bench_Press'], dumbbells: ['Dumbbell_Bench_Press', 'Pushups'], bodyweight: ['Pushups', 'Incline_Push-Up'] },
  ipush: { gym: ['Incline_Dumbbell_Press', 'Cable_Crossover', 'Dips_-_Chest_Version'], dumbbells: ['Incline_Dumbbell_Press', 'Dumbbell_Flyes'], bodyweight: ['Incline_Push-Up', 'Pushups'] },
  vpush: { gym: ['Dumbbell_Shoulder_Press', 'Leverage_Shoulder_Press', 'Barbell_Shoulder_Press'], dumbbells: ['Dumbbell_Shoulder_Press', 'Arnold_Dumbbell_Press'], bodyweight: ['Pushups'] },
  hpull: { gym: ['Dumbbell_Incline_Row', 'Seated_Cable_Rows', 'Leverage_Iso_Row', 'One-Arm_Dumbbell_Row', 'Bent_Over_Barbell_Row'], dumbbells: ['Dumbbell_Incline_Row', 'One-Arm_Dumbbell_Row', 'Bent_Over_Two-Dumbbell_Row'], bodyweight: ['Inverted_Row'] },
  vpull: { gym: ['Wide-Grip_Lat_Pulldown', 'Band_Assisted_Pull-Up', 'Close-Grip_Front_Lat_Pulldown'], dumbbells: ['Band_Assisted_Pull-Up', 'Pullups'], bodyweight: ['Pullups', 'Inverted_Row'] },
  reardelt: { gym: ['Face_Pull', 'Reverse_Flyes', 'Cable_Rear_Delt_Fly'], dumbbells: ['Reverse_Flyes', 'Band_Pull_Apart'], bodyweight: ['Band_Pull_Apart'] },
  lateral: { gym: ['Side_Lateral_Raise', 'Seated_Side_Lateral_Raise'], dumbbells: ['Side_Lateral_Raise', 'Seated_Side_Lateral_Raise'], bodyweight: [] },
  traps: { gym: ['Dumbbell_Shrug', 'Barbell_Shrug'], dumbbells: ['Dumbbell_Shrug'], bodyweight: [] },
  biceps: { gym: ['Hammer_Curls', 'Barbell_Curl', 'Concentration_Curls'], dumbbells: ['Hammer_Curls', 'Concentration_Curls'], bodyweight: ['Chin-Up'] },
  triceps: { gym: ['Triceps_Pushdown_-_Rope_Attachment', 'Cable_Rope_Overhead_Triceps_Extension', 'Close-Grip_Barbell_Bench_Press'], dumbbells: ['Standing_Dumbbell_Triceps_Extension', 'Tricep_Dumbbell_Kickback'], bodyweight: ['Bench_Dips', 'Pushups'] },
  wristflex: { gym: ['Palms-Up_Dumbbell_Wrist_Curl_Over_A_Bench'], dumbbells: ['Palms-Up_Dumbbell_Wrist_Curl_Over_A_Bench'], bodyweight: ['gripper'] },
  wristext: { gym: ['Palms-Down_Dumbbell_Wrist_Curl_Over_A_Bench', 'Wrist_Roller'], dumbbells: ['Palms-Down_Dumbbell_Wrist_Curl_Over_A_Bench'], bodyweight: ['finger_extensions'] },
  grip: { gym: ['Farmers_Walk', 'Plate_Pinch', 'dead_hang'], dumbbells: ['Farmers_Walk', 'dead_hang'], bodyweight: ['dead_hang', 'gripper'] },
  coreA: { gym: ['Plank', 'Pallof_Press', 'Side_Bridge'], dumbbells: ['Plank', 'Side_Bridge', 'Dead_Bug'], bodyweight: ['Plank', 'Side_Bridge', 'Dead_Bug'] },
  coreB: { gym: ['Cable_Crunch', 'Knee_Hip_Raise_On_Parallel_Bars', 'Hanging_Leg_Raise'], dumbbells: ['Crunches', 'Hanging_Leg_Raise'], bodyweight: ['Crunches', 'Hanging_Leg_Raise'] },
  cardio: { gym: ['Walking_Treadmill', 'Elliptical_Trainer'], dumbbells: ['Walking_Treadmill'], bodyweight: ['Walking_Treadmill'] },
}

const AVOID: Record<Limitation, string[]> = {
  knee: ['Barbell_Squat', 'Hack_Squat', 'Dumbbell_Squat', 'Split_Squat_with_Dumbbells', 'Dumbbell_Lunges', 'Bodyweight_Walking_Lunge', 'Dumbbell_Step_Ups', 'Single-Leg_Leg_Extension', 'Leg_Extensions', 'Jogging_Treadmill'],
  lowerback: ['Barbell_Squat', 'Romanian_Deadlift', 'Trap_Bar_Deadlift', 'Stiff-Legged_Dumbbell_Deadlift', 'Bent_Over_Barbell_Row', 'Bent_Over_Two-Dumbbell_Row', 'Barbell_Shoulder_Press', 'Superman', 'Hyperextensions_Back_Extensions'],
  shoulder: ['Barbell_Shoulder_Press', 'Arnold_Dumbbell_Press', 'Dips_-_Chest_Version', 'Bench_Dips', 'Barbell_Bench_Press_-_Medium_Grip', 'Wide-Grip_Lat_Pulldown'],
}

/** Safer stand-ins when every candidate of a pattern is ruled out by a limitation. */
export const FALLBACK: Partial<Record<Pattern, Record<Equipment, string[]>>> = {
  squat: { gym: ['Leg_Press', 'Goblet_Squat'], dumbbells: ['Goblet_Squat', 'Single_Leg_Glute_Bridge'], bodyweight: ['Single_Leg_Glute_Bridge'] },
  hinge: { gym: ['Barbell_Hip_Thrust', 'Lying_Leg_Curls'], dumbbells: ['Single_Leg_Glute_Bridge'], bodyweight: ['Single_Leg_Glute_Bridge'] },
  lunge: { gym: ['Leg_Press', 'Barbell_Hip_Thrust'], dumbbells: ['Single_Leg_Glute_Bridge'], bodyweight: ['Glute_Kickback'] },
  vpush: { gym: ['Side_Lateral_Raise'], dumbbells: ['Side_Lateral_Raise'], bodyweight: ['Incline_Push-Up'] },
  vpull: { gym: ['Close-Grip_Front_Lat_Pulldown', 'Band_Assisted_Pull-Up'], dumbbells: ['Band_Assisted_Pull-Up'], bodyweight: ['Inverted_Row'] },
}

type Role = 'main' | 'acc' | 'fin'
interface Slot { p: Pattern; role: Role }
const M = (p: Pattern): Slot => ({ p, role: 'main' })
const A = (p: Pattern): Slot => ({ p, role: 'acc' })
const F = (p: Pattern): Slot => ({ p, role: 'fin' })

interface DayTemplate { label: string; slots: Slot[] }

const FULL_A: DayTemplate = { label: '', slots: [M('squat'), M('hpush'), M('hpull'), A('hinge'), A('lateral'), A('reardelt'), A('biceps'), A('triceps'), F('coreA')] }
const FULL_B: DayTemplate = { label: '', slots: [M('hinge'), M('vpull'), M('vpush'), A('lunge'), A('hpull'), A('ipush'), A('reardelt'), F('grip'), F('coreB')] }
const FULL_C: DayTemplate = { label: '', slots: [M('lunge'), M('vpull'), M('ipush'), A('legcurl'), A('hpull'), A('lateral'), A('calves'), F('wristflex'), F('coreA')] }
const UPPER_1: DayTemplate = { label: 'أعلى', slots: [M('hpush'), M('hpull'), M('vpush'), A('vpull'), A('reardelt'), A('lateral'), A('biceps'), A('triceps'), F('wristflex')] }
const LOWER_1: DayTemplate = { label: 'أسفل', slots: [M('squat'), M('hinge'), A('lunge'), A('legcurl'), A('calves'), A('adductor'), F('coreA'), F('coreB')] }
const UPPER_2: DayTemplate = { label: 'أعلى', slots: [M('vpull'), M('ipush'), M('hpull'), A('vpush'), A('reardelt'), A('lateral'), A('biceps'), A('triceps'), F('grip')] }
const LOWER_2: DayTemplate = { label: 'أسفل', slots: [M('hinge'), M('lunge'), A('squat'), A('glute'), A('legext'), A('calves'), F('coreB'), F('coreA')] }
const PUSH: DayTemplate = { label: 'دفع', slots: [M('hpush'), M('vpush'), A('ipush'), A('lateral'), A('triceps'), A('triceps'), F('coreA')] }
const PULL: DayTemplate = { label: 'سحب', slots: [M('vpull'), M('hpull'), A('hpull'), A('reardelt'), A('traps'), A('biceps'), A('biceps'), F('grip'), F('wristext')] }
const LEGS: DayTemplate = { label: 'رجل', slots: [M('squat'), M('hinge'), A('lunge'), A('legcurl'), A('legext'), A('calves'), F('coreB')] }

function split(days: number): { name: string; days: DayTemplate[] } {
  switch (days) {
    case 2: return { name: 'Full Body', days: [FULL_A, FULL_B] }
    case 3: return { name: 'Full Body', days: [FULL_A, FULL_B, FULL_C] }
    case 4: return { name: 'أعلى/أسفل', days: [UPPER_1, LOWER_1, UPPER_2, LOWER_2] }
    case 5: return { name: 'أعلى/أسفل + دفع/سحب/رجل', days: [UPPER_1, LOWER_1, PUSH, PULL, LEGS] }
    default: return { name: 'دفع/سحب/رجل ×2', days: [PUSH, PULL, LEGS, PUSH, PULL, LEGS] }
  }
}

const FOCUS_SLOTS: Record<Focus, Pattern[]> = {
  legs: ['lunge', 'legext'], back: ['hpull', 'vpull'], chest: ['ipush'], shoulders: ['lateral', 'reardelt'],
  arms: ['biceps', 'triceps'], forearms: ['wristflex', 'wristext', 'grip'], abs: ['coreB', 'coreA'], glutes: ['glute'],
}

interface Dose { sets: number; repMin: number; repMax: number; rest: number }

function dose(goal: BGoal, exp: Experience, role: Role, metric: Exercise['metric']): Dose {
  const extra = exp === 'advanced' ? 1 : 0
  if (metric === 'time') return { sets: role === 'fin' ? 2 : 3, repMin: 30, repMax: 60, rest: 45 }
  if (metric === 'distance') return { sets: 3, repMin: 30, repMax: 30, rest: 60 }
  if (role === 'main') {
    if (goal === 'strength') return { sets: 4 + extra, repMin: 4, repMax: 6, rest: 180 }
    if (goal === 'fatloss') return { sets: 3, repMin: 8, repMax: 12, rest: 90 }
    return { sets: 3 + extra, repMin: 6, repMax: 10, rest: 120 }
  }
  if (role === 'acc') {
    if (goal === 'strength') return { sets: 3, repMin: 8, repMax: 10, rest: 90 }
    if (goal === 'fatloss') return { sets: 2 + extra, repMin: 12, repMax: 15, rest: 45 }
    return { sets: 3, repMin: 10, repMax: 15, rest: 60 }
  }
  return { sets: 2, repMin: 12, repMax: 20, rest: 45 }
}

const WARMUP_IDS: [string, number, number][] = [['Kneeling_Hip_Flexor', 30, 30], ['Cat_Stretch', 10, 10], ['chin_tucks', 10, 10], ['wall_angels', 10, 10], ['Band_Pull_Apart', 15, 15], ['Dead_Bug', 8, 8]]
const GENERAL_WARMUP: [string, number, number][] = [['Cat_Stretch', 10, 10], ['Band_Pull_Apart', 15, 15], ['Dead_Bug', 8, 8]]
const WORK_SEC = 40
const WARMUP_MIN = 8

export function blockMinutes(sets: number, rest: number, unilateral: boolean): number {
  return (sets * (WORK_SEC * (unilateral ? 2 : 1) + rest)) / 60
}

const DAY_IDS = ['A', 'B', 'C', 'D', 'E', 'F']
const GOAL_NAME: Record<BGoal, string> = { strength: 'قوة', hypertrophy: 'تضخيم', recomp: 'ريكومب', fatloss: 'تنشيف' }

/** Deterministic program generator: same input → same program. */
export function buildProgram(input: BuilderInput, catalog: Map<string, Exercise>, now: number): Program {
  const days = Math.min(6, Math.max(2, Math.round(input.days)))
  const avoid = new Set(input.limitations.flatMap((l) => AVOID[l]))
  const usable = (id: string) => catalog.has(id) && !avoid.has(id)
  const plan = split(days)
  const cardioMin = input.cardio ? (input.goal === 'fatloss' ? 25 : 15) : 0
  const budget = input.minutes - WARMUP_MIN - cardioMin

  const pick = (p: Pattern, used: Set<string>, rotate: number): string | undefined => {
    const list = [...CANDIDATES[p][input.equipment], ...(FALLBACK[p]?.[input.equipment] ?? [])].filter(usable)
    if (list.length === 0) return undefined
    for (let k = 0; k < list.length; k++) {
      const id = list[(k + rotate) % list.length]!
      if (!used.has(id)) return id
    }
    return undefined
  }

  const programDays: ProgramDay[] = plan.days.map((tpl, di) => {
    const key = DAY_IDS[di]!
    const blocks: Block[] = []
    let n = 0
    const push = (exerciseId: string, section: Section, d: Dose, note?: string) => {
      blocks.push({ id: `${key}-${section}-${++n}`, exerciseId, sets: d.sets, repMin: d.repMin, repMax: d.repMax, restSec: d.rest, section, ...(note ? { note } : {}) })
    }

    for (const [id, min, max] of input.posture ? WARMUP_IDS : GENERAL_WARMUP)
      if (usable(id)) push(id, 'warmup', { sets: 1, repMin: min, repMax: max, rest: 0 }, id === 'Kneeling_Hip_Flexor' || id === 'Dead_Bug' ? 'لكل ناحية' : undefined)

    // Slots in priority order: mains → focus extras → accessories → finishers; stop at the time budget.
    const GRIP: Pattern[] = ['wristflex', 'wristext', 'grip']
    const focusExtra: Slot[] = input.focus.flatMap((f) => FOCUS_SLOTS[f].slice(0, 1).map((p) => (GRIP.includes(p) ? F(p) : A(p))))
    const postureExtra: Slot[] = input.posture && tpl.slots.some((s) => ['hpush', 'vpush', 'hpull', 'vpull'].includes(s.p)) && !tpl.slots.some((s) => s.p === 'reardelt') ? [A('reardelt')] : []
    const ordered = [
      ...tpl.slots.filter((s) => s.role === 'main'),
      ...focusExtra, ...postureExtra,
      ...tpl.slots.filter((s) => s.role === 'acc'),
      ...tpl.slots.filter((s) => s.role === 'fin'),
    ]
    // Pick in priority order (fits the time budget), then emit in training order: mains, accessories, finishers.
    const used = new Set<string>()
    const chosen: { slot: Slot; id: string; d: Dose; rank: number }[] = []
    let minutes = 0
    ordered.forEach((slot, rank) => {
      const id = pick(slot.p, used, slot.role === 'main' ? di % 2 : di)
      if (!id) return
      const e = catalog.get(id)!
      const d = dose(input.goal, input.experience, slot.role, e.metric)
      const cost = blockMinutes(d.sets, d.rest, e.unilateral)
      if (slot.role !== 'main' && minutes + cost > budget) return
      used.add(id)
      minutes += cost
      chosen.push({ slot, id, d, rank: tpl.slots.indexOf(slot) >= 0 ? tpl.slots.indexOf(slot) : 100 + rank })
    })
    const ROLE_ORDER: Record<Role, number> = { main: 0, acc: 1, fin: 2 }
    chosen.sort((a, b) => ROLE_ORDER[a.slot.role] - ROLE_ORDER[b.slot.role] || a.rank - b.rank)
    for (const { slot, id, d } of chosen) {
      const e = catalog.get(id)!
      push(id, slot.role === 'fin' ? 'finisher' : 'main', d, e.unilateral && slot.role === 'main' ? 'ابدأ بالناحية الأضعف' : undefined)
    }

    if (cardioMin) {
      const cid = pick('cardio', new Set(), 0)
      if (cid) push(cid, 'cardio', { sets: 1, repMin: cardioMin, repMax: cardioMin, rest: 0 }, input.goal === 'fatloss' ? 'شدة متوسطة — تقدر تتكلم بصعوبة' : 'Zone 2 — تقدر تتكلم')
    }
    return { id: key, name: tpl.label ? `يوم ${key} — ${tpl.label}` : `يوم ${key}`, blocks }
  })

  return {
    id: `custom-${now}`,
    name: `برنامج ${GOAL_NAME[input.goal]} — ${days} أيام (${plan.name})`,
    active: 1,
    createdAt: now,
    days: programDays,
  }
}

/** Estimated session length in minutes (warm-up + blocks + cardio) for validation and display. */
export function estimateDayMinutes(day: ProgramDay, catalog: Map<string, Exercise>): number {
  let m = 0
  for (const b of day.blocks) {
    const e = catalog.get(b.exerciseId)
    if (!e) continue
    if (b.section === 'warmup') continue
    if (e.metric === 'cardio') m += b.repMax
    else m += blockMinutes(b.sets, b.restSec, e.unilateral)
  }
  return Math.round(m + WARMUP_MIN)
}
