import { useMemo, useState } from 'react'
import { useHabits } from '@/features/habits/useHabits'
import { fetchOccurrences } from '@/lib/habits/occurrences'
import { todayStr, dateInTimezone } from '@/lib/habits/frequency'
import { completionRate, currentStreak, bestStreak, dailyTotals, perHabitStats } from '@/lib/habits/stats'
import type { Occurrence } from '@/lib/habits/types'
import { cn } from '@/lib/utils'

export default function StatisticsPage() {
  const { habits, loading: habitsLoading } = useHabits()
  const [range, setRange] = useState<'week' | 'month'>('week')
  const [data, setData] = useState<{ days: Map<string, { expected: number; done: number }>; pct: number | null; streak: number; best: number; perHabit: ReturnType<typeof perHabitStats> } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const today = useMemo(() => todayStr(), [])
  const profile = useAuthProfile()

  useMemo(() => {
    if (habitsLoading || habits.length === 0) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const to = today
        const from = shiftDate(today, range === 'week' ? -6 : -29)
        const occs = await fetchOccurrences(
          habits.map((h) => h.id),
          from,
          to
        )
        const byHabit = new Map<string, Occurrence[]>()
        for (const o of occs) {
          const list = byHabit.get(o.habit_id) ?? []
          list.push(o)
          byHabit.set(o.habit_id, list)
        }
        const active = habits.filter((h) => h.is_active)
        const days = dailyTotals(active, byHabit, from, to)
        const pct = completionRate(active, byHabit, from, to)
        const streak = currentStreak(active, byHabit, today)
        const best = bestStreak(active, byHabit, today)
        const perHabit = perHabitStats(active, byHabit, from, to)
        if (!cancelled) setData({ days, pct, streak, best, perHabit })
        setError(null)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error calculando estadísticas')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habits, habitsLoading, range, today, profile])

  const dayLabels = useMemo(() => {
    if (!data) return []
    return [...data.days.entries()]
  }, [data])

  if (habitsLoading || loading) return <div className="pt-16 text-center text-sm text-zinc-400 dark:text-zinc-500 dark:text-zinc-400">Calculando…</div>

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 dark:text-zinc-100">Estadísticas</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Tu constancia en números</p>
      </header>

      <div className="grid grid-cols-2 rounded-xl bg-zinc-200/70 dark:bg-zinc-800/70 p-1 text-sm font-medium">
        {(['week', 'month'] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={cn('rounded-lg py-2 capitalize transition', range === r ? 'bg-white shadow-sm dark:bg-zinc-900 dark:ring-zinc-800 text-zinc-900' : 'text-zinc-500')}
          >
            {r === 'week' ? 'Semana' : 'Mes'}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {data && (
        <>
          {/* Tarjetas resumen */}
          <section className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-100 dark:ring-zinc-800">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500 dark:text-zinc-400">Cumplimiento</p>
              <p className="mt-1 text-3xl font-bold text-zinc-900 dark:text-zinc-100 dark:text-zinc-100">{data.pct ?? 0}%</p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-100 dark:ring-zinc-800">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500 dark:text-zinc-400">Racha actual</p>
              <p className="mt-1 text-3xl font-bold text-violet-700">🔥 {data.streak} días</p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-100 dark:ring-zinc-800">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500 dark:text-zinc-400">Mejor racha</p>
              <p className="mt-1 text-3xl font-bold text-zinc-900 dark:text-zinc-100 dark:text-zinc-100">{data.best} días</p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-100 dark:ring-zinc-800">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500 dark:text-zinc-400">Hábitos activos</p>
              <p className="mt-1 text-3xl font-bold text-zinc-900 dark:text-zinc-100 dark:text-zinc-100">{habits.filter((h) => h.is_active).length}</p>
            </div>
          </section>

          {/* Gráfico de barras por día */}
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-100 dark:ring-zinc-800">
            <p className="mb-3 text-sm font-semibold text-zinc-700">Evolución diaria</p>
            <div className="flex h-32 items-end gap-1">
              {dayLabels.map(([d, { expected, done }]) => {
                const pct = expected === 0 ? 0 : (done / expected) * 100
                return (
                  <div key={d} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex h-24 w-full items-end overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className={cn('w-full rounded-md transition-all duration-500', pct === 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-violet-500' : 'bg-zinc-200')}
                        style={{ height: `${Math.max(pct, 3)}%` }}
                      />
                    </div>
                    <span className="text-[9px] font-medium text-zinc-400 dark:text-zinc-500 dark:text-zinc-400">{d.slice(8, 10)}</span>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Por hábito */}
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-100 dark:ring-zinc-800">
            <p className="mb-3 text-sm font-semibold text-zinc-700">Por hábito</p>
            {data.perHabit.length === 0 ? (
              <p className="text-sm text-zinc-400 dark:text-zinc-500 dark:text-zinc-400">Sin hábitos activos en este período.</p>
            ) : (
              <ul className="space-y-3">
                {data.perHabit.map(({ habit, done, expected, pct }) => (
                  <li key={habit.id}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-zinc-700">
                        {habit.icon ?? '🎯'} {habit.name}
                      </span>
                      <span className="text-zinc-400 dark:text-zinc-500 dark:text-zinc-400">
                        {done}/{expected} · <b className={cn(pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-red-500')}>{pct}%</b>
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className={cn('h-full rounded-full', pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-400')}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return dateInTimezone(d)
}

function useAuthProfile() {
  // Fuerza recálculo si cambia el usuario; perfil simple
  return null
}
