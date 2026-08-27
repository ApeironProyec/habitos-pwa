import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/features/auth/useAuth'
import { onDataChanged } from '@/lib/db/events'
import * as repo from '@/lib/db/repo'
import { todayStr } from '@/lib/habits/frequency'
import type { Habit, Occurrence, OccurrenceStatus } from '@/lib/habits/types'

/**
 * Los datos se leen de IndexedDB, no de la red: la primera pintura es
 * inmediata y funciona sin conexión. El motor de sync emite eventos cuando
 * llegan cambios remotos y estos hooks se refrescan solos, así que ya no hace
 * falta refetchear en cada navegación.
 */
export function useHabits() {
  const [habits, setHabits] = useState<Habit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const rows = await repo.listHabits()
      setHabits(rows)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando hábitos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    return onDataChanged((scope) => {
      if (scope === 'habits') void reload()
    })
  }, [reload])

  return { habits, loading, error, reload }
}

/**
 * Ocurrencias de hoy. Genera los slots que falten (solo de hábitos activos)
 * y expone `mark` con actualización optimista.
 */
export function useToday(habits: Habit[], loadingHabits: boolean) {
  const { user } = useAuth()
  const [occurrences, setOccurrences] = useState<Occurrence[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const today = useRef(todayStr()).current

  const reload = useCallback(async () => {
    if (loadingHabits) return
    if (!user) {
      setOccurrences([])
      setLoading(false)
      return
    }
    try {
      const occs = await repo.ensureOccurrences(habits, today, user.id)
      setOccurrences(occs)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando el día')
    } finally {
      setLoading(false)
    }
  }, [habits, loadingHabits, today, user])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    return onDataChanged((scope) => {
      if (scope !== 'occurrences') return
      // Releer sin regenerar: evita un bucle con ensureOccurrences
      void repo.listOccurrencesForDate(today).then((rows) => {
        setOccurrences(rows.sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time)))
      })
    })
  }, [today])

  const mark = useCallback(
    async (id: string, status: OccurrenceStatus) => {
      // Optimista: la UI responde antes de que IndexedDB confirme
      setOccurrences((prev) =>
        prev.map((o) =>
          o.id === id
            ? { ...o, status, completed_at: status === 'completed' ? new Date().toISOString() : null }
            : o
        )
      )
      try {
        await repo.setOccurrenceStatus(id, status)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo guardar')
        await reload()
      }
    },
    [reload]
  )

  return { occurrences, loading, error, reload, mark }
}
