# Phase 1 — Coach & Analytics

Date: 2026-10-13 · Builds on `2026-10-12-gym-tracker-design.md`. Offline, deterministic, no server.

## Features

1. **RPE per set** — optional 6–10 chips under a completed set (`SetLog.rpe`).
2. **Personal records** — per exercise: best e1RM (loaded reps), heaviest weight, best value
   (reps / seconds / meters for unloaded). Completing a set that beats all prior completed
   sets shows a 🏆 toast. PR board on Progress and a PR card on exercise detail.
3. **Readiness check-in** — once per day from Home: sleep hours, sleep quality, stress,
   soreness, fatigue (1–5) and a pain flag + note. Score 0–100:
   `30% sleep hours + 15% sleep quality + 15% stress⁻¹ + 20% soreness⁻¹ + 20% fatigue⁻¹`.
   Levels: ≥75 push · 50–74 normal · 35–49 hold (no weight increases) · <35 reduce
   (−10% load, advise light day). Pain always adds "don't load the painful area" advice.
   Session shows the advice and applies it to suggestions, each with a `note` saying why.
4. **Decision engine (plateau analysis)** — per exercise, ≥4 sessions: plateau when no new
   best in the last 3 sessions; regressing when the last 2 sessions each dropped and the
   last is <95% of best. Recommendation order: high RPE (avg ≥9) → deload 10% for a week;
   low readiness (avg <50) → fix recovery first; else → change rep range or swap to an
   alternative for the same primary muscle (named). Progressing shows % gain over 4 sessions.
5. **Muscle map** — front/back body SVG, regions shaded (single-hue sequential scale) by
   this week's sets per muscle: 0, 1–5, 6–9, 10–14, 15+. Tap a region for the count;
   a table lists the same numbers (no color-only reading).
6. **History editing** — `/history` lists finished sessions; `/history/:id` edits weight,
   value and RPE of each set, deletes sets or the session. Exercises can be renamed
   (Arabic name); renames survive catalog refresh via a `nameOverrides` setting.
7. **Achievements** — milestones (sessions 1/10/25/50/100, PRs 1/10/50, first InBody,
   check-in streak 7), weekly-3 streak (consecutive Sat-based weeks with ≥3 sessions),
   and this week's challenges (3 sessions, 5 check-ins). Never prompts training through pain.

## Data

- Dexie v2 adds `checkins: 'id'` (id = YYYY-MM-DD). `CheckIn { id, sleepHours, sleepQuality,
  stress, soreness, fatigue, pain, painNote?, at }`.
- Backup v2 adds `checkins`; v1 backups still import (checkins = []).

## Modules (pure, unit-tested)

`domain/readiness.ts`, `domain/records.ts`, `domain/plateau.ts`, `domain/achievements.ts`.
