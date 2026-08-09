import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Habit, Occurrence } from '@/lib/habits/types'
import { ensureTodayOccurrences, setOccurrenceStatus } from '@/lib/habits/occurrences'

export function useHabits() {
  const [habits, setHabits] = useState<Habit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase.from('habits').select('*').order('created_at', { ascending: true })
      if (error) throw error
      setHabits((data as Habit[]) ?? [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando hábitos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return { habits, loading, error, reload }
}

export function useToday(habits: Habit[], loadingHabits: boolean) {
  const [occurrences, setOccurrences] = useState<Occurrence[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (loadingHabits || habits.length === 0) {
      setOccurrences([])
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const occs = await ensureTodayOccurrences(habits)
      setOccurrences(occs)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando el día')
    } finally {
      setLoading(false)
    }
  }, [habits, loadingHabits])

  useEffect(() => {
    reload()
  }, [reload])

  const mark = useCallback(
    async (id: string, status: 'completed' | 'skipped' | 'pending') => {
      await setOccurrenceStatus(id, status)
      setOccurrences((prev) => prev.map((o) => (o.id === id ? { ...o, status, completed_at: status === 'completed' ? new Date().toISOString() : null } : o)))
    },
    []
  )

  return { occurrences, loading, error, reload, mark }
}
