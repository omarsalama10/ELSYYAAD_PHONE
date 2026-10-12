# Phase 3 — Nutrition

Date: 2026-10-13 · Offline, deterministic, no server. Values are approximate and labeled so.

## Profile & targets
- Profile (setting `nutritionProfile`): sex, birth year, height cm, activity factor (default 1.4:
  desk job + 3 gym days), goal, protein g/kg (default 2.0), fat g/kg (default 0.8), daily budget EGP,
  supplements list, water target ml.
- Goals → kcal offset vs TDEE: cut −400 · recomp +0 · lean bulk +250 (default) · bulk +450.
- BMR priority: latest InBody BMR → Katch-McArdle (370 + 21.6 × FFM, FFM = weight − BFM) →
  Mifflin-St Jeor (10w + 6.25h − 5a ± sex). TDEE = BMR × activity.
- Macros: protein = g/kg × weight; fat = max(g/kg × weight, 25% kcal / 9); carbs = remainder ≥ 0.

## Adaptive calories
- Daily weigh-ins (`weights` table, also fed by InBody weights). Trend = EMA (α = 0.15) over days.
- Window = last 21 days. Needs ≥ 14 days span, ≥ 10 days with food logged, ≥ 6 weigh-ins.
  TDEE_obs = mean logged intake − (Δtrend × 7700 / days). Blended estimate =
  formula × (1 − c) + observed × c, c = min(1, loggedDays / 21).
- Suggested target = blended TDEE + goal offset, rounded to 50. Shown with the reason; user taps
  "طبّق" to adopt (stored as `kcalOverride`).

## Weekly report
- Avg intake (7d), estimated TDEE, surplus, trend change %/week.
- Verdict for bulk goals: ideal +0.25–0.5% bodyweight/week; < 0.1% → eat more (+150);
  > 0.75% → too fast (−150). For recomp: ±0.1%. For cut: −0.5–1%.

## Logging
- Food DB: ~70 common Egyptian/general foods per 100 g (kcal, P, C, F) with a default serving;
  user custom foods (`foods` table) incl. optional price per serving.
- `meals` entries: date, meal (فطار/غدا/عشا/سناكس), foodId or quick-add (name, kcal, P), grams.
- `days`: water ml and supplements taken.
- Budget: spent = Σ entry price; cheapest protein per EGP among priced foods; suggestions to fill
  remaining protein within remaining budget.

## UI
- Tabs: الرئيسية · التمارين · التغذية · التقدم · الجسم (settings via home header gear).
- `/nutrition`: date switcher, kcal ring + macro bars, weigh-in, meals, water, supplements,
  weekly report + adaptive suggestion, budget card. `/nutrition/setup`: profile & goals.
- Home: compact nutrition summary.

## Data
Dexie v3: `foods: id`, `meals: id, date`, `days: id`, `weights: id`. Backup v3 adds them
(older backups import with empty tables).
