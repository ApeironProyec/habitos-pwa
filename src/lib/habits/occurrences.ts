import { supabase } from '@/lib/supabase/client'
import type { Habit, Occurrence } from './types'
import { todayStr } from './frequency'

/** Trae las ocurrencias de un día específico (o de un rango). */
export async function fetchOccurrences(habitIds: string[], from: string, to: string): Promise<Occurrence[]> {
  if (habitIds.length === 0) return []
  const { data, error } = await supabase
    .from('habit_occurrences')
    .select('*')
    .in('habit_id', habitIds)
    .gte('scheduled_at', `${from}T00:00:00`)
    .lte('scheduled_at', `${to}T23:59:59`)
  if (error) throw error
  return data as Occurrence[]
}

/** Garantiza que existan las ocurrencias esperadas para hoy y devuelve la lista. */
export async function ensureTodayOccurrences(habits: Parameters<typeof seedOccurrences>[0]): Promise<Occurrence[]> {
  const today = todayStr()
  const habitIds = habits.map((h) => h.id)
  if (habitIds.length === 0) return []
  await seedOccurrences(habits, today)
  return fetchOccurrences(habitIds, today, today)
}

/** Crea las ocurrencias faltantes (upsert silencioso) para una fecha. */
export async function seedOccurrences(
  habits: Pick<Habit, 'id' | 'user_id' | 'frequency_type' | 'frequency_config' | 'start_date' | 'end_date'>[],
  date: string
): Promise<void> {
  const { scheduledTimesForDate } = await import('./frequency')
  const rows: { habit_id: string; user_id: string; scheduled_at: string }[] = []
  for (const h of habits) {
    for (const sched of scheduledTimesForDate(h as never, date)) {
      rows.push({ habit_id: h.id, user_id: h.user_id, scheduled_at: sched })
    }
  }
  if (rows.length === 0) return
  // upsert ignorando duplicados (unique habit_id+scheduled_at)
  await supabase.from('habit_occurrences').upsert(rows, { onConflict: 'habit_id,scheduled_at', ignoreDuplicates: true })
}

export async function setOccurrenceStatus(id: string, status: 'completed' | 'skipped' | 'pending'): Promise<void> {
  const patch: Partial<Occurrence> = { status }
  if (status === 'completed') patch.completed_at = new Date().toISOString()
  else patch.completed_at = null
  const { error } = await supabase.from('habit_occurrences').update(patch).eq('id', id)
  if (error) throw error
}
