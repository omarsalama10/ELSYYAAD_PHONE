import type { Block, Program, ProgramDay, Section } from '../domain/types'

type Row = [exerciseId: string, sets: number, repMin: number, repMax: number, restSec: number, group?: string, note?: string]

function blocks(dayKey: string, section: Section, rows: Row[], offset = 0): Block[] {
  return rows.map(([exerciseId, sets, repMin, repMax, restSec, group, note], i) => ({
    id: `${dayKey}-${section}-${offset + i + 1}`,
    exerciseId,
    sets,
    repMin,
    repMax,
    restSec,
    section,
    ...(group ? { group: `${dayKey}-${group}` } : {}),
    ...(note ? { note } : {}),
  }))
}

const WARMUP: Row[] = [
  ['Kneeling_Hip_Flexor', 1, 30, 30, 0, undefined, 'لكل ناحية'],
  ['Cat_Stretch', 1, 10, 10, 0],
  ['chin_tucks', 1, 10, 10, 0],
  ['wall_angels', 1, 10, 10, 0],
  ['Band_Pull_Apart', 1, 15, 15, 0],
  ['Dead_Bug', 1, 8, 8, 30, undefined, 'لكل ناحية'],
]

function day(key: string, name: string, main: Row[], finisher: Row[], cardio: Row): ProgramDay {
  return {
    id: key,
    name,
    blocks: [
      ...blocks(key, 'warmup', WARMUP),
      ...blocks(key, 'main', main),
      ...blocks(key, 'finisher', finisher),
      ...blocks(key, 'cardio', [cardio]),
    ],
  }
}

const WALK: Row = ['Walking_Treadmill', 1, 20, 20, 0, undefined, 'ميل 8-12% — سرعة 5-6 كم/س']

export const DEFAULT_PROGRAM_ID = 'default-fullbody-3'

export function createDefaultProgram(now: number): Program {
  return {
    id: DEFAULT_PROGRAM_ID,
    name: 'عودة Full Body — 3 أيام',
    active: 1,
    createdAt: now,
    days: [
      day(
        'A',
        'يوم A',
        [
          ['Hack_Squat', 3, 8, 10, 150],
          ['Dumbbell_Bench_Press', 3, 8, 10, 60, 's1'],
          ['Dumbbell_Incline_Row', 3, 10, 12, 90, 's1'],
          ['Romanian_Deadlift', 3, 8, 10, 120],
          ['Single-Leg_Leg_Extension', 3, 10, 12, 60, undefined, 'ابدأ بالرجل الأضعف'],
          ['Face_Pull', 3, 15, 15, 30, 's2'],
          ['Side_Lateral_Raise', 3, 12, 15, 60, 's2'],
          ['Hammer_Curls', 3, 10, 12, 30, 's3'],
          ['Triceps_Pushdown_-_Rope_Attachment', 3, 10, 12, 60, 's3'],
        ],
        [
          ['Palms-Up_Dumbbell_Wrist_Curl_Over_A_Bench', 2, 15, 20, 30, 'f1'],
          ['Palms-Down_Dumbbell_Wrist_Curl_Over_A_Bench', 2, 15, 20, 60, 'f1'],
          ['Plank', 3, 30, 60, 45],
        ],
        WALK,
      ),
      day(
        'B',
        'يوم B',
        [
          ['Barbell_Hip_Thrust', 3, 8, 10, 120],
          ['Wide-Grip_Lat_Pulldown', 3, 8, 10, 60, 's1'],
          ['Dumbbell_Shoulder_Press', 3, 8, 10, 90, 's1'],
          ['Split_Squat_with_Dumbbells', 3, 8, 10, 90, undefined, 'ابدأ بالرجل الأضعف'],
          ['Seated_Cable_Rows', 3, 10, 12, 60, 's2'],
          ['Incline_Dumbbell_Press', 3, 8, 10, 90, 's2'],
          ['Reverse_Flyes', 3, 12, 15, 30, 's3'],
          ['Hyperextensions_Back_Extensions', 3, 12, 15, 60, 's3'],
          ['Barbell_Curl', 3, 8, 10, 30, 's4'],
          ['Cable_Rope_Overhead_Triceps_Extension', 3, 10, 12, 60, 's4'],
        ],
        [
          ['Farmers_Walk', 3, 30, 30, 60],
          ['Cable_Crunch', 3, 12, 15, 30, 'f1'],
          ['Side_Bridge', 2, 30, 45, 45, 'f1'],
          ['Isometric_Neck_Exercise_-_Front_And_Back', 2, 15, 20, 30],
        ],
        WALK,
      ),
      day(
        'C',
        'يوم C',
        [
          ['single_leg_press', 3, 10, 12, 60, undefined, 'ابدأ بالرجل الأضعف'],
          ['Band_Assisted_Pull-Up', 3, 6, 10, 60, 's1'],
          ['Dips_-_Chest_Version', 3, 6, 10, 90, 's1'],
          ['Lying_Leg_Curls', 3, 10, 12, 30, 's2'],
          ['Standing_Calf_Raises', 3, 12, 15, 60, 's2'],
          ['One-Arm_Dumbbell_Row', 3, 8, 10, 60],
          ['Seated_Side_Lateral_Raise', 3, 12, 15, 30, 's3'],
          ['Thigh_Adductor', 2, 12, 15, 60, 's3'],
        ],
        [
          ['Plate_Pinch', 3, 20, 30, 30, 'f1'],
          ['finger_extensions', 2, 20, 25, 45, 'f1'],
          ['gripper', 2, 10, 15, 30, 'f2'],
          ['Wrist_Roller', 2, 1, 1, 60, 'f2'],
          ['dead_hang', 3, 20, 60, 60],
          ['Knee_Hip_Raise_On_Parallel_Bars', 3, 10, 15, 45],
        ],
        ['Walking_Treadmill', 1, 20, 20, 0, undefined, 'من الأسبوع 5 (اختياري): جري دقيقة / مشي دقيقتين'],
      ),
    ],
  }
}
