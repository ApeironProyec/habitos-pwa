import type { Habit, Occurrence } from './types'
import { appliesOn, dateRange, normalizeTime, slotsForDate, timesOfDay } from './frequency'

/** Subconjunto de Habit que necesitan los cálculos. */
export type HabitLite = Pick<
  Habit,
  'id' | 'name' | 'icon' | 'color' | 'frequency_type' | 'frequency_config' | 'start_date' | 'end_date'
>

/**
 * Índice de slots completados: 'habitId|fecha|hora' → estado.
 *
 * Se construye UNA vez por cálculo. La versión anterior lo reconstruía dentro
 * del bucle de días: `bestStreak` con 365 días y 10 hábitos creaba 3.650 Maps
 * por render de la pantalla de estadísticas.
 */
export type StatusIndex = Map<string, Occurrence['status']>

export function buildStatusIndex(occurrences: Occurrence[]): StatusIndex {
  const map: StatusIndex = new Map()
  for (const o of occurrences) {
    if (o.deleted_at) continue
    map.set(`${o.habit_id}|${o.scheduled_date}|${normalizeTime(o.scheduled_time)}`, o.status)
  }
  return map
}

function isDone(index: StatusIndex, habitId: string, date: string, time: string): boolean {
  return index.get(`${habitId}|${date}|${time}`) === 'completed'
}

/** Cuenta esperadas y completadas de un día concreto. */
function dayTotals(
  habits: HabitLite[],
  index: StatusIndex,
  date: string
): { expected: number; done: number } {
  let expected = 0
  let done = 0
  for (const h of habits) {
    if (!appliesOn(h, date)) continue
    for (const slot of slotsForDate(h, date)) {
      expected++
      if (isDone(index, h.id, date, slot.time)) done++
    }
  }
  return { expected, done }
}

/** Porcentaje de cumplimiento en un rango (0-100). `null` si nada era esperado. */
export function completionRate(
  habits: HabitLite[],
  index: StatusIndex,
  from: string,
  to: string
): number | null {
  let expected = 0
  let done = 0
  for (const date of dateRange(from, to)) {
    const t = dayTotals(habits, index, date)
    expected += t.expected
    done += t.done
  }
  if (expected === 0) return null
  return Math.round((done / expected) * 100)
}

/** ¿El día está completo? Falso si no había nada que hacer. */
export function dayCompleted(habits: HabitLite[], index: StatusIndex, date: string): boolean {
  const { expected, done } = dayTotals(habits, index, date)
  return expected > 0 && done === expected
}

/**
 * Racha actual: días consecutivos al 100% terminando hoy o ayer.
 *
 * Los días sin nada programado (ej. un hábito solo de lunes y miércoles) no
 * rompen la racha: se saltan. Antes cualquier día vacío la cortaba, lo que
 * hacía imposible mantener racha con hábitos semanales.
 */
export function currentStreak(habits: HabitLite[], index: StatusIndex, today: string): number {
  let streak = 0
  let cursor = today

  if (!dayCompleted(habits, index, today)) {
    const t = dayTotals(habits, index, today)
    // Si hoy hay pendientes, la racha se mide hasta ayer
    if (t.expected > 0) cursor = shift(today, -1)
  }

  // Tope de seguridad: 2 años
  for (let guard = 0; guard < 730; guard++) {
    const { expected } = dayTotals(habits, index, cursor)
    if (expected === 0) {
      cursor = shift(cursor, -1)
      continue
    }
    if (!dayCompleted(habits, index, cursor)) break
    streak++
    cursor = shift(cursor, -1)
  }
  return streak
}

/** Mejor racha del período (misma regla: los días vacíos no cortan). */
export function bestStreak(
  habits: HabitLite[],
  index: StatusIndex,
  today: string,
  lookbackDays = 365
): number {
  let best = 0
  let current = 0
  for (const date of dateRange(shift(today, -lookbackDays), today)) {
    const { expected, done } = dayTotals(habits, index, date)
    if (expected === 0) continue
    if (done === expected) {
      current++
      best = Math.max(best, current)
    } else {
      current = 0
    }
  }
  return best
}

/** Totales por día para un rango. */
export function dailyTotals(
  habits: HabitLite[],
  index: StatusIndex,
  from: string,
  to: string
): Map<string, { expected: number; done: number }> {
  const out = new Map<string, { expected: number; done: number }>()
  for (const date of dateRange(from, to)) {
    out.set(date, dayTotals(habits, index, date))
  }
  return out
}

/** Cumplimiento por hábito en el rango. */
export function perHabitStats(
  habits: HabitLite[],
  index: StatusIndex,
  from: string,
  to: string
) {
  const dates = dateRange(from, to)
  return habits.map((h) => {
    let expected = 0
    let done = 0
    for (const date of dates) {
      if (!appliesOn(h, date)) continue
      for (const slot of slotsForDate(h, date)) {
        expected++
        if (isDone(index, h.id, date, slot.time)) done++
      }
    }
    return {
      habit: h,
      expected,
      done,
      pct: expected === 0 ? 0 : Math.round((done / expected) * 100),
    }
  })
}

/** Slots esperados de un hábito en un rango (para tests y proyecciones). */
export function expectedSlots(habit: HabitLite, from: string, to: string): string[] {
  const out: string[] = []
  for (const date of dateRange(from, to)) {
    for (const slot of slotsForDate(habit, date)) {
      out.push(`${date}T${slot.time}`)
    }
  }
  return out
}

/** Cuántas ocurrencias se esperan por día, sin importar la fecha. */
export function slotsPerDay(habit: HabitLite): number {
  return timesOfDay(habit).length
}

function shift(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10)
}
