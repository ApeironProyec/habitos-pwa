import { useEffect, useMemo, useState } from 'react'
import { Flame, TrendingUp, Activity } from 'lucide-react'
import { useHabits } from '@/features/habits/useHabits'
import { fetchOccurrences } from '@/lib/habits/occurrences'
import { todayStr, shiftDate } from '@/lib/habits/frequency'
import { completionRate, currentStreak, bestStreak, dailyTotals, perHabitStats } from '@/lib/habits/stats'
import type { Occurrence } from '@/lib/habits/types'
import { cn } from '@/lib/utils'

type StatsData = {
  days: Record<string, { expected: number; done: number }>
  pct: number | null
  streak: number
  best: number
  perHabit: ReturnType<typeof perHabitStats>
}

export default function StatisticsPage() {
  const { habits, loading: habitsLoading } = useHabits()
  const [range, setRange] = useState<'week' | 'month'>('month')
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(false)

  const today = useMemo(() => todayStr(), [])

  useEffect(() => {
    if (habitsLoading) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const to = today
        const from = shiftDate(today, range === 'week' ? -6 : -29)
        const active = habits.filter((h) => h.is_active)
        const occs = await fetchOccurrences(
          active.map((h) => h.id),
          from,
          to
        )
        if (cancelled) return
        const byHabit = new Map<string, Occurrence[]>()
        for (const o of occs) {
          const arr = byHabit.get(o.habit_id) ?? []
          arr.push(o)
          byHabit.set(o.habit_id, arr)
        }
        const daysObj: Record<string, { expected: number; done: number }> = {}
        for (const [k, v] of dailyTotals(active, byHabit, from, to)) daysObj[k] = v
        setData({
          days: daysObj,
          pct: completionRate(active, byHabit, from, to),
          streak: currentStreak(active, byHabit, to),
          best: bestStreak(active, byHabit, to),
          perHabit: perHabitStats(active, byHabit, from, to),
        })
      } catch {
        /* estadísticas no bloquean la app */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [habits, habitsLoading, range, today])

  if (habitsLoading || loading || !data) {
    return <div className="pt-16 text-center text-sm text-[var(--text-secondary)]">Calculando…</div>
  }

  const labels = Object.keys(data.days)
  const dates = labels.map((d) => Number(d.slice(8, 10)))

  return (
    <div className="space-y-5 pb-6">
      <header>
        <h1 className="text-[28px] font-bold tracking-tight text-[var(--text-primary)]">Estadísticas</h1>
        <p className="text-sm text-[var(--text-secondary)]">Tu constancia en números</p>
      </header>

      {/* Selector Semana/Mes */}
      <div className="flex w-fit rounded-full bg-black/5 p-1 backdrop-blur dark:bg-white/10">
        {(['week', 'month'] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={cn(
              'rounded-full px-5 py-1.5 text-sm font-medium transition-all tap',
              range === r
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-white dark:text-black'
                : 'text-[var(--text-secondary)]'
            )}
          >
            {r === 'week' ? 'Semana' : 'Mes'}
          </button>
        ))}
      </div>

      {/* Grid métricas 2x2 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass fade-up p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Cumplimiento</p>
          <p className="mt-1.5 text-3xl font-bold tabular-nums text-[var(--text-primary)]">{data.pct}%</p>
        </div>
        <div className="glass fade-up p-4" style={{ animationDelay: '40ms' }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Racha actual</p>
          <p className="mt-1.5 flex items-center gap-1.5 text-3xl font-bold tabular-nums text-violet-600 dark:text-violet-400">
            <Flame className="h-6 w-6 text-orange-500" /> {data.streak}
          </p>
          <p className="text-xs text-[var(--text-secondary)]">días</p>
        </div>
        <div className="glass fade-up p-4" style={{ animationDelay: '80ms' }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Mejor racha</p>
          <p className="mt-1.5 text-3xl font-bold tabular-nums text-[var(--text-primary)]">{data.best}</p>
          <p className="text-xs text-[var(--text-secondary)]">días</p>
        </div>
        <div className="glass fade-up p-4" style={{ animationDelay: '120ms' }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Hábitos activos</p>
          <p className="mt-1.5 text-3xl font-bold tabular-nums text-[var(--text-primary)]">{habits.filter((h) => h.is_active).length}</p>
        </div>
      </div>

      {/* Evolución diaria */}
      <section className="glass fade-up p-4" style={{ animationDelay: '160ms' }}>
        <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-[var(--text-primary)]">
          <Activity className="h-4 w-4 text-violet-500" /> Evolución diaria
        </h2>
        <div className="flex h-28 items-end justify-between gap-1.5">
          {labels.map((d, i) => {
            const day = data.days[d]
            const h = day.expected === 0 ? 2 : Math.max(8, Math.round((day.done / day.expected) * 100))
            const full = day.expected > 0 && day.done >= day.expected
            return (
              <div key={d} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex h-24 w-full items-end">
                  <div
                    className={cn(
                      'w-full rounded-md transition-all duration-500',
                      full ? 'bg-emerald-500/90' : h <= 2 ? 'bg-[var(--text-secondary)]/20' : 'bg-violet-500/80'
                    )}
                    style={{ height: `${h}%` }}
                  />
                </div>
                <span className="text-[10px] tabular-nums text-[var(--text-secondary)]">{dates[i]}</span>
              </div>
            )
          })}
        </div>
      </section>

      {/* Por hábito */}
      <section className="glass fade-up space-y-3 p-4" style={{ animationDelay: '200ms' }}>
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text-primary)]">
          <TrendingUp className="h-4 w-4 text-violet-500" /> Por hábito
        </h2>
        {data.perHabit.length === 0 && (
          <p className="py-2 text-sm text-[var(--text-secondary)]">Sin hábitos activos en este período.</p>
        )}
        {data.perHabit.map(({ habit, expected, done, pct }) => (
          <div key={habit.id} className="flex items-center gap-3 py-1">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
              style={{ backgroundColor: (habit.color ?? '#2d2a3d') + '55' }}
            >
              {habit.icon ?? '🎯'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <p className="truncate text-[15px] font-medium text-[var(--text-primary)]">{habit.name}</p>
                <p className="shrink-0 text-xs tabular-nums text-[var(--text-secondary)]">
                  {done}/{expected} · <span className={cn('font-semibold', pct === 0 ? 'text-red-500' : 'text-emerald-500')}>{pct}%</span>
                </p>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                <div
                  className={cn('h-full rounded-full transition-all duration-500', pct === 0 ? 'bg-red-500/80' : 'bg-violet-500')}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
