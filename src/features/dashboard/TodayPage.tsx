import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Check, X, RotateCcw } from 'lucide-react'
import { useHabits, useToday } from '@/features/habits/useHabits'
import { cn } from '@/lib/utils'

export default function TodayPage() {
  const { habits, loading: habitsLoading } = useHabits()
  const { occurrences, loading, mark } = useToday(habits, habitsLoading)

  const byHabit = useMemo(() => {
    const map = new Map<string, typeof occurrences>()
    for (const o of occurrences) {
      const list = map.get(o.habit_id) ?? []
      list.push(o)
      map.set(o.habit_id, list)
    }
    return map
  }, [occurrences])

  const grouped = useMemo(() => {
    return habits
      .filter((h) => h.is_active)
      .map((h) => {
        const occs = (byHabit.get(h.id) ?? []).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
        const done = occs.filter((o) => o.status === 'completed').length
        const skipped = occs.filter((o) => o.status === 'skipped').length
        const total = occs.length
        const pct = total === 0 ? 0 : Math.round((done / total) * 100)
        return { habit: h, occs, done, skipped, total, pct }
      })
  }, [habits, byHabit])

  const totalDone = grouped.reduce((s, g) => s + g.done, 0)
  const totalExpected = grouped.reduce((s, g) => s + g.total, 0)
  const dayPct = totalExpected === 0 ? 0 : Math.round((totalDone / totalExpected) * 100)

  const dateLabel = useMemo(() => {
    return new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  }, [])

  if (habitsLoading || loading) {
    return <div className="pt-16 text-center text-sm text-zinc-400 dark:text-zinc-500">Cargando tu día…</div>
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm capitalize text-zinc-500 dark:text-zinc-400">{dateLabel}</p>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Tu día</h1>
      </header>

      {/* Progreso del día */}
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-100 dark:bg-zinc-900 dark:ring-zinc-800">
        <div className="mb-2 flex items-end justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Progreso de hoy</p>
            <p className="mt-1 text-3xl font-bold text-zinc-900 dark:text-zinc-100">
              {dayPct}%
            </p>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {totalDone} / {totalExpected} completados
          </p>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className={cn('h-full rounded-full transition-all duration-500', dayPct === 100 ? 'bg-emerald-500' : 'bg-violet-600')}
            style={{ width: `${dayPct}%` }}
          />
        </div>
        {dayPct === 100 && totalExpected > 0 && (
          <p className="mt-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">🎉 ¡Día completado!</p>
        )}
      </section>

      {/* Hábitos del día */}
      <section className="space-y-3">
        {grouped.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Aún no tienes hábitos.</p>
            <Link
              to="/habits"
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow"
            >
              <Plus className="h-4 w-4" /> Crear mi primer hábito
            </Link>
          </div>
        )}

        {grouped.map(({ habit, occs, done, total, pct }) => (
          <article key={habit.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-100 dark:bg-zinc-900 dark:ring-zinc-800">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-base"
                  style={{ backgroundColor: habit.color ?? '#ede9fe' }}
                >
                  {habit.icon ?? '🎯'}
                </span>
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">{habit.name}</h3>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">
                    {done}/{total} · {pct}%
                  </p>
                </div>
              </div>
              {total > 0 && pct === 100 ? (
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">Listo ✓</span>
              ) : (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">Pendiente</span>
              )}
            </div>

            {occs.length > 0 && (
              <ul className="mt-1 space-y-1.5">
                {occs.map((o) => {
                  const time = o.scheduled_at.slice(11, 16)
                  return (
                    <li key={o.id} className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2 dark:bg-zinc-800/60">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            'flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold',
                            o.status === 'completed'
                              ? 'border-emerald-500 bg-emerald-500 text-white'
                              : o.status === 'skipped'
                                ? 'border-zinc-300 bg-zinc-200 text-zinc-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-400'
                                : 'border-zinc-300 bg-white text-zinc-400 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-500'
                          )}
                        >
                          {o.status === 'completed' ? <Check className="h-4 w-4" /> : o.status === 'skipped' ? <X className="h-3.5 w-3.5" /> : time}
                        </span>
                        <span className={cn('text-sm', o.status === 'completed' ? 'text-zinc-400 line-through dark:text-zinc-500' : 'text-zinc-700 dark:text-zinc-300')}>
                          {o.status === 'completed' ? 'Completado' : o.status === 'skipped' ? 'Omitido' : time}
                        </span>
                      </div>
                      <div className="flex gap-1.5">
                        {o.status !== 'completed' && (
                          <button
                            onClick={() => mark(o.id, 'completed')}
                            className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition active:scale-95"
                          >
                            Hecho
                          </button>
                        )}
                        {o.status === 'pending' && (
                          <button
                            onClick={() => mark(o.id, 'skipped')}
                            className="rounded-lg bg-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition active:scale-95 dark:bg-zinc-700 dark:text-zinc-300"
                          >
                            Omitir
                          </button>
                        )}
                        {o.status !== 'pending' && (
                          <button
                            onClick={() => mark(o.id, 'pending')}
                            className="rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs font-medium text-zinc-500 transition active:scale-95 dark:bg-zinc-800 dark:text-zinc-400"
                            title="Deshacer"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </article>
        ))}
      </section>
    </div>
  )
}
