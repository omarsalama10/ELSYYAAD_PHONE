# Gym Tracker PWA — Design Spec

Date: 2026-10-12
Status: Approved (chat), implementation in progress

## 1. Goal

A free, offline-first iPhone workout tracker for a single user, installed as a PWA
("Add to Home Screen" from Safari). It ships a ready 3-day full-body program tailored
to the user, logs every set, suggests progression, tracks InBody and tape
measurements with charts, and shows exercise demos offline.

### User profile (drives the default program)

- 21 y/o male, returning after a 1-year break → treat as "returning beginner".
- Desk job, fully remote; the gym (3 days/week) is the **only** activity of the week.
  Everything health-related (mobility, posture work, cardio) must fit inside those
  3 sessions. No off-day homework.
- Goals: strength + hypertrophy for every muscle (including forearms, grip, fingers,
  abs, neck), lose belly fat (skinny-fat → body recomposition).
- Thin forearms, mild hand tremor (grip + isometric work; app is not a medical tool).
- Forward-leaning posture → pull:push volume ≈ 2:1, rear delt / upper back work and
  mobility in every session.
- Femur plates (removed at 15, no pain). Leg progress historically lags →
  unilateral leg work, left/right logged separately, asymmetry surfaced in charts.

### Non-goals (v1)

Nutrition/calorie tracking, Apple Health/Watch integration, push notifications when
the app is closed, multi-user, cloud sync, accounts.

## 2. Platform & stack

| Concern | Choice | Why |
|---|---|---|
| Delivery | PWA, installed to iOS home screen | Free, no Mac, no Apple dev account |
| UI | React 18 + TypeScript (strict) + Vite | Maintainable, typed, testable |
| Styling | Tailwind CSS v3, RTL, dark theme | Fast iteration, consistent tokens |
| Routing | react-router (HashRouter) | Works on any static host, no rewrites |
| Storage | IndexedDB via Dexie 4 + dexie-react-hooks | Structured offline data, Blob support |
| Offline | vite-plugin-pwa (Workbox `generateSW`, precache all assets) | Fully offline after first load |
| Charts | Hand-rolled SVG line chart component | Zero deps, RTL-safe, small |
| Backup | JSON file + fflate zip (data + media) via Web Share / download | User keeps backups in iCloud Files |
| Tests | Vitest (logic + db with fake-indexeddb), Playwright (Chromium, iPhone viewport) | Logic correctness + real UI flows |
| Hosting | Cloudflare Pages connected to the private GitHub repo | Free, works with private repos |

Language: Arabic UI (`dir="rtl"`, `lang="ar"`). Exercise names shown in English
(gym vocabulary) with an Arabic subtitle.

## 3. Default program — "عودة Full Body 3 أيام"

Rotation A → B → C → A … (next day = day after the last *completed* session,
never calendar-bound, so a missed day doesn't break anything).

Every day = Warm-up block → Strength (supersets marked ⟂) → Grip/Core → Cardio.
Target ≈ 85 min.

**Warm-up (every day, 1 round):** Kneeling Hip Flexor 30s/side · Cat Stretch ×10 ·
Chin Tucks ×10 · Wall Angels ×10 · Band Pull-Apart ×15 · Dead Bug ×8/side.

**Day A**
1. Hack Squat 3×8–10
2. Dumbbell Bench Press 3×8–10 ⟂ Dumbbell Incline Row 3×10–12
3. Romanian Deadlift 3×8–10
4. Single-Leg Leg Extension 3×10–12 per side (unilateral)
5. Face Pull 3×15 ⟂ Side Lateral Raise 3×12–15
6. Hammer Curls 3×10–12 ⟂ Triceps Pushdown (rope) 3×10–12
7. Palms-Up Wrist Curl 2×15–20 ⟂ Palms-Down Wrist Curl 2×15–20
8. Plank 3×30–60s
9. Walking Treadmill (incline) 20 min

**Day B**
1. Barbell Hip Thrust 3×8–10
2. Wide-Grip Lat Pulldown 3×8–10 ⟂ Dumbbell Shoulder Press 3×8–10
3. Split Squat with Dumbbells (rear foot elevated) 3×8–10 per side (unilateral)
4. Seated Cable Rows 3×10–12 ⟂ Incline Dumbbell Press 3×8–10
5. Reverse Flyes 3×12–15 ⟂ Back Extensions 3×12–15
6. Barbell Curl 3×8–10 ⟂ Overhead Rope Triceps Extension 3×10–12
7. Farmer's Walk 3×30 m
8. Cable Crunch 3×12–15 ⟂ Side Bridge 2×30–45s per side
9. Isometric Neck (front/back) 2×15–20s
10. Walking Treadmill (incline) 20 min

**Day C**
1. Single-Leg Leg Press 3×10–12 per side (unilateral)
2. Band-Assisted Pull-Up 3×6–10 ⟂ Chest Dips (assisted ok) 3×6–10
3. Lying Leg Curls 3×10–12 ⟂ Standing Calf Raises 3×12–15
4. One-Arm Dumbbell Row 3×8–10 per side (unilateral)
5. Seated Side Lateral Raise 3×12–15 ⟂ Thigh Adductor 2×12–15
6. Plate Pinch 3×20–30s ⟂ Finger Extensions (band) 2×20–25
7. Gripper 2×10–15 per hand ⟂ Wrist Roller 2×1 (up+down)
8. Dead Hang 3×max (20–60s)
9. Captain's Chair Knee Raise 3×10–15
10. Walking Treadmill 20 min (from week 5: optional jog/walk intervals 1:2)

Custom exercises (not in the image DB, text cues + user video slot): Chin Tucks,
Wall Angels, Dead Hang, Gripper, Finger Extensions. "Single-Leg Leg Press" reuses
the Leg Press images.

## 4. Progression rules (pure functions, unit-tested)

- **Return phase:** weeks 1–2 (counted from the first completed session):
  2 working sets per exercise, target effort RPE 6–7. UI shows a banner.
- **Double progression** (reps-based exercises): for the last session of an exercise,
  if *every* working set hit `repMax` → suggest `weight + increment`
  (`Exercise.increment`: 2.5 kg barbell/machine/cable, 2 kg per dumbbell, 0 for
  bodyweight → then +1 rep target instead), else suggest same weight and aim for +1 rep.
  Weight is always logged as the load on one implement (one dumbbell / the machine stack).
  If any set fell below `repMin` on two consecutive sessions → suggest −10% (rounded
  to the increment).
- Unilateral exercises evaluate each side independently.
- Time-based exercises (plank, hangs): progress `+5s` when all sets hit the top of
  the range.
- **Deload:** every 7th training week suggest a deload (−40% sets, same weights).
  Banner only; user decides.
- **Estimated 1RM** (Epley, reps ≤ 12) for progress charts.

## 5. Data model (Dexie, DB name `gym-tracker`, version 1)

```ts
type Side = 'L' | 'R'
type Metric = 'reps' | 'time' | 'distance' | 'cardio'

Exercise   { id: string; name: string; nameAr: string; muscles: string[];
             equipment: string; metric: Metric; unilateral: boolean;
             images: string[]; cuesAr: string[]; instructions: string[];
             custom: boolean; increment: number }
Program    { id: string; name: string; active: 0|1; days: ProgramDay[]; createdAt: number }
ProgramDay { id: string; name: string; blocks: Block[] }
Block      { id: string; exerciseId: string; sets: number; repMin: number; repMax: number;
             restSec: number; group?: string /* superset key */; section: 'warmup'|'main'|'finisher'|'cardio' }
Session    { id: string; programId: string; dayId: string; startedAt: number; finishedAt?: number; note?: string }
SetLog     { id: string; sessionId: string; exerciseId: string; blockId: string;
             setIndex: number; side?: Side; weight?: number; reps?: number;
             seconds?: number; meters?: number; done: boolean; at: number }
InBody     { id: string; date: string /* YYYY-MM-DD */; weight: number; smm?: number;
             bfm?: number; pbf?: number; bmi?: number; visceral?: number; bmr?: number;
             tbw?: number; ecwRatio?: number; protein?: number; minerals?: number;
             score?: number; lean: Segments; fat: Segments; note?: string }
Segments   { la?: number; ra?: number; trunk?: number; ll?: number; rl?: number }
Tape       { id: string; date: string; neck?, chest?, waist?, hips?, armL?, armR?,
             forearmL?, forearmR?, thighL?, thighR?, calfL?, calfR?: number }
Media      { id: string; exerciseId: string; blob: Blob; mime: string; createdAt: number }
Setting    { key: string; value: unknown }
```

Seeding: on first run (no programs), insert all exercises from the bundled catalog and
the default program. Catalog = curated subset of free-exercise-db (Unlicense) used by
the program + custom entries; images bundled under `public/exercises/<id>/{0,1}.jpg`
and precached.

## 6. Screens

| Route | Content |
|---|---|
| `/` Today | Next day card (A/B/C, exercise count, est. duration), Start/Resume, week streak x/3, return-phase or deload banner, backup reminder (>14 days) |
| `/session/:id` Workout | Grouped blocks by section; per exercise: demo (2-frame animation or user video), Arabic cues, last-time numbers, suggestion, set rows (weight/reps or seconds or meters; L/R rows for unilateral), check to complete, auto rest timer with sound, Screen Wake Lock while active, Finish |
| `/exercises` Library | Search, list; `/exercises/:id` details, attach/remove video from camera roll, history chart |
| `/program` Program editor | Days, reorder/add/remove blocks, sets/reps/rest, superset grouping, swap exercise |
| `/body` Body | InBody form + list, tape form + list, charts: weight, SMM, PBF, visceral, leg lean L vs R, arm/forearm/thigh tape L vs R |
| `/progress` Progress | e1RM/top-set chart per exercise, weekly sets per muscle, L/R comparison for unilateral exercises |
| `/settings` Settings | Export zip / import, request persistent storage status, reset |

Bottom tab bar: اليوم · البرنامج · الجسم · التقدم · الإعدادات.

## 7. Error handling & data safety

- `navigator.storage.persist()` requested on first workout; status shown in Settings.
- All DB writes are awaited; failures surface a toast, never silent.
- Import validates schema version and shape before clearing data; runs in one Dexie
  transaction (all-or-nothing).
- Active session survives reloads (state lives in IndexedDB, not memory).
- Backup reminder after 14 days without export.

## 8. Testing

- Unit (Vitest): rotation, progression (incl. unilateral, time-based, regression),
  return phase / deload week math, e1RM, asymmetry calc, backup serialize/validate.
- DB integration (Vitest + fake-indexeddb): seed, session lifecycle, import/export
  round trip.
- E2E (Playwright, Chromium, iPhone 13 viewport): first run seeds program → start
  Day A → log sets → finish → next day is B; add InBody entry → chart renders;
  offline reload after SW install serves the app.
- Not testable here: real iOS Safari install/quota behavior — verified by the user.

## 9. Deployment

`npm run build` → `dist/`. Cloudflare Pages project connected to the repo
(build command `npm run build`, output `dist`). User connects once from their
Cloudflare account. Every push to the production branch redeploys.
