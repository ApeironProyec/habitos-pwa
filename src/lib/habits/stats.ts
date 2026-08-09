import type { Habit, Occurrence } from './types'
import { appliesOn, scheduledTimesForDate } from './frequency'

/** Subconjunto de Habit que necesitan los cálculos. */
export type HabitLite = Pick<
  Habit,
  'id' | 'name' | 'icon' | 'frequency_type' | 'frequency_config' | 'start_date' | 'end_date'
>

/** Ocurrencias esperadas (scheduled) para un hábito en un rango de fechas [from, to] (YYYY-MM-DD, local). */
export function expectedOccurrences(
  habit: HabitLite,
  from: string,
  to: string
): string[] {
  const out: string[] = []
  const cursor = new Date(from + 'T12:00:00')
  const end = new Date(to + 'T12:00:00')
  while (cursor <= end) {
    const d = toYMD(cursor)
    out.push(...scheduledTimesForDate(habit, d))
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

function toYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Índice: scheduled_at → occurrence (para lookups rápidos). */
export function indexByScheduled(occurrences: Occurrence[]): Map<string, Occurrence> {
  const map = new Map<string, Occurrence>()
  for (const o of occurrences) map.set(o.scheduled_at, o)
  return map
}

/** Porcentaje de cumplimiento en un rango (0-100). Requiere lista de hábitos + sus ocurrencias. */
export function completionRate(
  habits: HabitLite[],
  occurrencesByHabit: Map<string, Occurrence[]>,
  from: string,
  to: string
): number | null {
  let expected = 0
  let done = 0
  for (const h of habits) {
    const occs = occurrencesByHabit.get(h.id) ?? []
    const occMap = indexByScheduled(occs)
    for (const sched of expectedOccurrences(h, from, to)) {
      expected++
      if (occMap.get(sched)?.status === 'completed') done++
    }
  }
  if (expected === 0) return null
  return Math.round((done / expected) * 100)
}

/** Racha actual (días consecutivos con 100% de cumplimiento, terminando hoy o ayer). */
export function currentStreak(
  habits: HabitLite[],
  occurrencesByHabit: Map<string, Occurrence[]>,
  today: string
): number {
  let streak = 0
  const cursor = new Date(today + 'T12:00:00')

  // si hoy aún no se completó, la racha cuenta desde ayer
  const todayRate = dayCompleted(habits, occurrencesByHabit, today)
  if (!todayRate) cursor.setDate(cursor.getDate() - 1)

  while (true) {
    const d = toYMD(cursor)
    const completed = dayCompleted(habits, occurrencesByHabit, d)
    if (!completed) break
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

/** Mejor racha histórica (recorriendo desde start_date hasta hoy). */
export function bestStreak(
  habits: HabitLite[],
  occurrencesByHabit: Map<string, Occurrence[]>,
  today: string,
  lookbackDays = 365
): number {
  const start = new Date(today + 'T12:00:00')
  start.setDate(start.getDate() - lookbackDays)
  let best = 0
  let current = 0
  const cursor = new Date(start)
  const end = new Date(today + 'T12:00:00')
  while (cursor <= end) {
    const d = toYMD(cursor)
    if (dayCompleted(habits, occurrencesByHabit, d)) {
      current++
      best = Math.max(best, current)
    } else {
      current = 0
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return best
}

/** ¿Un día específico está 100% completado (todas las ocurrencias esperadas hechas)? */
export function dayCompleted(
  habits: HabitLite[],
  occurrencesByHabit: Map<string, Occurrence[]>,
  date: string
): boolean {
  let expected = 0
  let done = 0
  for (const h of habits) {
    if (!appliesOn(h, date)) continue
    const occs = occurrencesByHabit.get(h.id) ?? []
    const occMap = indexByScheduled(occs)
    for (const sched of scheduledTimesForDate(h, date)) {
      expected++
      if (occMap.get(sched)?.status === 'completed') done++
    }
  }
  return expected > 0 && done === expected
}

/** Totales por día para un rango: { date: { expected, done } }. */
export function dailyTotals(
  habits: HabitLite[],
  occurrencesByHabit: Map<string, Occurrence[]>,
  from: string,
  to: string
): Map<string, { expected: number; done: number }> {
  const out = new Map<string, { expected: number; done: number }>()
  const cursor = new Date(from + 'T12:00:00')
  const end = new Date(to + 'T12:00:00')
  while (cursor <= end) {
    const d = toYMD(cursor)
    let expected = 0
    let done = 0
    for (const h of habits) {
      if (!appliesOn(h, d)) continue
      const occs = occurrencesByHabit.get(h.id) ?? []
      const occMap = indexByScheduled(occs)
      for (const sched of scheduledTimesForDate(h, d)) {
        expected++
        if (occMap.get(sched)?.status === 'completed') done++
      }
    }
    out.set(d, { expected, done })
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

/** Cumplimiento por hábito: { habit_id: { expected, done, pct } } para el rango. */
export function perHabitStats(
  habits: HabitLite[],
  occurrencesByHabit: Map<string, Occurrence[]>,
  from: string,
  to: string
) {
  return habits.map((h) => {
    const occs = occurrencesByHabit.get(h.id) ?? []
    const occMap = indexByScheduled(occs)
    let expected = 0
    let done = 0
    for (const sched of expectedOccurrences(h, from, to)) {
      expected++
      if (occMap.get(sched)?.status === 'completed') done++
    }
    return {
      habit: h,
      expected,
      done,
      pct: expected === 0 ? 0 : Math.round((done / expected) * 100),
    }
  })
}
