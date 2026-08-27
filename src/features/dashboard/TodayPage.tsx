import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Check, X, RotateCcw } from 'lucide-react'
import { useHabits, useToday } from '@/features/habits/useHabits'
import { SkeletonList, EmptyState } from '@/components/Skeleton'
import { displayTime, nowTime } from '@/lib/habits/frequency'
import { cn } from '@/lib/utils'

export default function TodayPage() {
  const { habits, loading: habitsLoading } = useHabits()
  const { occurrences, loading, error, mark } = useToday(habits, habitsLoading)

  const grouped = useMemo(() => {
    const byHabit = new Map<string, typeof occurrences>()
    for (const o of occurrences) {
      const list = byHabit.get(o.habit_id) ?? []
      list.push(o)
      byHabit.set(o.habit_id, list)
    }

    return habits
      .filter((h) => h.is_active)
      .map((h) => {
        const occs = (byHabit.get(h.id) ?? []).sort((a, b) =>
          a.scheduled_time.localeCompare(b.scheduled_time)
        )
        const done = occs.filter((o) => o.status === 'completed').length
        const total = occs.length
        return { habit: h, occs, done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) }
      })
      .filter((g) => g.total > 0)
  }, [habits, occurrences])

  const totalDone = grouped.reduce((s, g) => s + g.done, 0)
  const totalExpected = grouped.reduce((s, g) => s + g.total, 0)
  const dayPct = totalExpected === 0 ? 0 : Math.round((totalDone / totalExpected) * 100)

  const dateLabel = useMemo(
    () => new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()),
    []
  )

  /** Hora actual, para señalar el slot que toca ahora. */
  const currentTime = useMemo(() => nowTime(), [])

  if (habitsLoading || loading) {
    return (
      <div className="space-y-5">
        <div className="skeleton h-8 w-40" />
        <SkeletonList count={3} />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <header className="fade-up">
        <p className="text-sm capitalize text-[var(--text-secondary)]">{dateLabel}</p>
        <h1 className="text-[28px] font-bold tracking-tight text-[var(--text-primary)]">Tu día</h1>
      </header>

      {error && (
        <p className="fade-in rounded-xl bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {/* Progreso del día */}
      <section className="glass fade-up stagger p-4" style={{ '--i': 1 } as React.CSSProperties}>
        <div className="mb-2 flex items-end justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Progreso de hoy
            </p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-[var(--text-primary)]">{dayPct}%</p>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            {totalDone} / {totalExpected} completados
          </p>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
          <div
            className={cn('bar-fill h-full rounded-full', dayPct === 100 ? 'bg-emerald-500' : 'bg-violet-600')}
            style={{ transform: `scaleX(${dayPct / 100})`, width: '100%' }}
          />
        </div>
        {dayPct === 100 && totalExpected > 0 && (
          <p className="fade-in mt-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            🎉 ¡Día completado!
          </p>
        )}
      </section>

      {/* Hábitos del día */}
      <section className="space-y-3">
        {grouped.length === 0 && (
          <EmptyState
            title={habits.length === 0 ? 'Aún no tienes hábitos.' : 'Hoy no toca ningún hábito.'}
            hint={
              habits.length === 0
                ? 'Crea el primero y aparecerá acá cada día.'
                : 'Revisa la frecuencia de tus hábitos si esperabas algo hoy.'
            }
            action={
              <Link
                to="/habits"
                className="tap-strong inline-flex items-center gap-1.5 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-700/25"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {habits.length === 0 ? 'Crear mi primer hábito' : 'Ver mis hábitos'}
              </Link>
            }
          />
        )}

        {grouped.map(({ habit, occs, done, total, pct }, idx) => (
          <article
            key={habit.id}
            className="glass fade-up stagger p-4"
            style={{ '--i': idx + 2 } as React.CSSProperties}
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base"
                  style={{ backgroundColor: (habit.color ?? '#6d28d9') + '33' }}
                  aria-hidden="true"
                >
                  {habit.icon ?? '🎯'}
                </span>
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-[var(--text-primary)]">{habit.name}</h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {done}/{total} · {pct}%
                  </p>
                </div>
              </div>
              {pct === 100 ? (
                <span className="scale-in shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  Listo ✓
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                  Pendiente
                </span>
              )}
            </div>

            <ul className="mt-1 space-y-1.5">
              {occs.map((o) => {
                const time = displayTime(o.scheduled_time)
                // El slot vigente es el último cuya hora ya pasó
                const isNow =
                  o.status === 'pending' &&
                  o.scheduled_time <= currentTime &&
                  !occs.some(
                    (x) =>
                      x.status === 'pending' &&
                      x.scheduled_time <= currentTime &&
                      x.scheduled_time > o.scheduled_time
                  )

                return (
                  <li
                    key={o.id}
                    className={cn(
                      't-fast flex items-center justify-between rounded-xl px-3 py-2',
                      isNow ? 'bg-violet-500/10 ring-1 ring-violet-500/30' : 'bg-black/[0.03] dark:bg-white/[0.04]'
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          't-fast flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-bold tabular-nums',
                          o.status === 'completed'
                            ? 'border-emerald-500 bg-emerald-500 text-white'
                            : o.status === 'skipped'
                              ? 'border-transparent bg-black/10 text-[var(--text-secondary)] dark:bg-white/10'
                              : 'border-[var(--card-border)] text-[var(--text-secondary)]'
                        )}
                        aria-hidden="true"
                      >
                        {o.status === 'completed' ? (
                          <Check className="pop h-4 w-4" />
                        ) : o.status === 'skipped' ? (
                          <X className="h-3.5 w-3.5" />
                        ) : (
                          time.slice(0, 2)
                        )}
                      </span>
                      <span
                        className={cn(
                          'text-sm tabular-nums',
                          o.status === 'completed'
                            ? 'text-[var(--text-secondary)] line-through'
                            : 'text-[var(--text-primary)]'
                        )}
                      >
                        {time}
                        {o.status === 'skipped' && ' · omitido'}
                        {isNow && <span className="ml-1.5 text-[11px] font-semibold text-violet-500">ahora</span>}
                      </span>
                    </div>

                    <div className="flex gap-1.5">
                      {o.status !== 'completed' && (
                        <button
                          onClick={() => mark(o.id, 'completed')}
                          className="tap rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white"
                          aria-label={`Marcar ${habit.name} de las ${time} como hecho`}
                        >
                          Hecho
                        </button>
                      )}
                      {o.status === 'pending' && (
                        <button
                          onClick={() => mark(o.id, 'skipped')}
                          className="tap rounded-lg bg-black/5 px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] dark:bg-white/10"
                          aria-label={`Omitir ${habit.name} de las ${time}`}
                        >
                          Omitir
                        </button>
                      )}
                      {o.status !== 'pending' && (
                        <button
                          onClick={() => mark(o.id, 'pending')}
                          className="tap rounded-lg bg-black/5 p-1.5 text-[var(--text-secondary)] dark:bg-white/10"
                          aria-label={`Deshacer ${habit.name} de las ${time}`}
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </article>
        ))}
      </section>
    </div>
  )
}
