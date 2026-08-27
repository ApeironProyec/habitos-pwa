import { useEffect, useMemo, useState } from 'react'
import { Flame, TrendingUp, Activity, AlertCircle } from 'lucide-react'
import { useHabits } from '@/features/habits/useHabits'
import { useTasks } from '@/features/tasks/useTasks'
import { SkeletonStats, EmptyState } from '@/components/Skeleton'
import { onDataChanged } from '@/lib/db/events'
import { listOccurrences } from '@/lib/db/repo'
import { todayStr, shiftDate } from '@/lib/habits/frequency'
import {
  buildStatusIndex,
  completionRate,
  currentStreak,
  bestStreak,
  dailyTotals,
  perHabitStats,
} from '@/lib/habits/stats'
import { dueBucket } from '@/lib/tasks/sort'
import { cn } from '@/lib/utils'

type StatsData = {
  days: [string, { expected: number; done: number }][]
  pct: number | null
  streak: number
  best: number
  perHabit: ReturnType<typeof perHabitStats>
}

export default function StatisticsPage() {
  const { habits, loading: habitsLoading } = useHabits()
  const { tasks } = useTasks()
  const [range, setRange] = useState<'week' | 'month'>('month')
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  /** Antes el catch estaba vacío: al fallar, la pantalla se quedaba en "Calculando…" para siempre. */
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const today = useMemo(() => todayStr(), [])

  useEffect(() => onDataChanged(() => setTick((t) => t + 1)), [])

  useEffect(() => {
    if (habitsLoading) return
    let cancelled = false
    setLoading(true)

    ;(async () => {
      try {
        const to = today
        const from = shiftDate(today, range === 'week' ? -6 : -29)
        const active = habits.filter((h) => h.is_active)

        const occs = await listOccurrences(from, to)
        if (cancelled) return

        // El índice se construye UNA vez y se reutiliza en los cinco cálculos
        const index = buildStatusIndex(occs)

        setData({
          days: [...dailyTotals(active, index, from, to)],
          pct: completionRate(active, index, from, to),
          streak: currentStreak(active, index, to),
          // Para la mejor racha se mira un año completo, no solo el rango visible
          best: bestStreak(active, index, to, 365),
          perHabit: perHabitStats(active, index, from, to),
        })
        setError(null)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudieron calcular las estadísticas')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [habits, habitsLoading, range, today, tick])

  if (habitsLoading || (loading && !data)) {
    return (
      <div className="space-y-5">
        <div className="skeleton h-8 w-44" />
        <SkeletonStats />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-5">
        <header className="fade-up">
          <h1 className="text-[28px] font-bold tracking-tight text-[var(--text-primary)]">Estadísticas</h1>
        </header>
        <div className="glass fade-up flex flex-col items-center gap-3 p-6 text-center">
          <AlertCircle className="h-8 w-8 text-red-500" aria-hidden="true" />
          <p className="text-sm text-[var(--text-secondary)]">{error}</p>
          <button
            onClick={() => setTick((t) => t + 1)}
            className="tap-strong rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const activeCount = habits.filter((h) => h.is_active).length
  const maxExpected = Math.max(1, ...data.days.map(([, v]) => v.expected))

  // ----- métricas de tareas (todo lo que existe contribuye a stats) -----
  const taskPending = tasks.filter((t) => t.status !== 'completed' && !t.deleted_at)
  const taskDoneAll = tasks.filter((t) => t.status === 'completed' && !t.deleted_at)
  const taskOverdue = taskPending.filter((t) => dueBucket(t, today) === 'overdue').length
  const taskToday = taskPending.filter((t) => dueBucket(t, today) === 'today').length
  const taskCompletion =
    tasks.length === 0 ? null : Math.round((taskDoneAll.length / (taskDoneAll.length + taskPending.length)) * 100)
  const taskMinutes = tasks.reduce((s, t) => s + (t.spent_minutes ?? 0), 0)

  return (
    <div className="space-y-5 pb-6">
      <header className="fade-up">
        <h1 className="text-[28px] font-bold tracking-tight text-[var(--text-primary)]">Estadísticas</h1>
        <p className="text-sm text-[var(--text-secondary)]">Tu constancia en números</p>
      </header>

      <div className="fade-up flex w-fit rounded-full bg-black/5 p-1 dark:bg-white/10">
        {(['week', 'month'] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            aria-pressed={range === r}
            className={cn(
              'tap rounded-full px-5 py-1.5 text-sm font-medium',
              range === r
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-white dark:text-black'
                : 'text-[var(--text-secondary)]'
            )}
          >
            {r === 'week' ? 'Semana' : 'Mes'}
          </button>
        ))}
      </div>

      {activeCount === 0 ? (
        <EmptyState title="Sin hábitos activos." hint="Activa o crea un hábito para ver estadísticas." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Cumplimiento" value={data.pct === null ? '—' : `${data.pct}%`} i={0} />
            <Metric
              label="Racha actual"
              value={String(data.streak)}
              sub="días"
              i={1}
              icon={<Flame className="h-6 w-6 text-orange-500" aria-hidden="true" />}
              accent
            />
            <Metric label="Mejor racha" value={String(data.best)} sub="días" i={2} />
            <Metric label="Hábitos activos" value={String(activeCount)} i={3} />
          </div>

          {/* Tareas */}
          <div className="grid grid-cols-2 gap-3">
            <Metric
              label="Tareas para hoy"
              value={String(taskToday)}
              sub={taskOverdue > 0 ? `+${taskOverdue} vencidas` : 'al día'}
              i={4}
              accent={taskToday + taskOverdue > 0}
            />
            <Metric
              label="Tareas completadas"
              value={String(taskDoneAll.length)}
              sub={taskCompletion === null ? undefined : `${taskCompletion}% histórico`}
              i={5}
            />
            {taskMinutes > 0 && (
              <div className="glass fade-up stagger col-span-2 p-4" style={{ '--i': 6 } as React.CSSProperties}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Tiempo enfocado en tareas</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-[var(--text-primary)]">
                  {taskMinutes >= 60 ? `${Math.floor(taskMinutes / 60)} h ${taskMinutes % 60} min` : `${taskMinutes} min`}
                </p>
              </div>
            )}
          </div>

          <section className="glass fade-up stagger p-4" style={{ '--i': 4 } as React.CSSProperties}>
            <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-[var(--text-primary)]">
              <Activity className="h-4 w-4 text-violet-500" aria-hidden="true" /> Evolución diaria
            </h2>
            {/*
              FIX bug móvil: 30 barras + labels en ~360px se aplastaban y el
              número de día desbordaba su columna. Ahora: carril con scroll
              horizontal suave y ancho mínimo por barra; si el ancho alcanza,
              se distribuyen igual que antes.
            */}
            <div className="-mx-1 overflow-x-auto px-1 pb-1" style={{ scrollbarWidth: 'none' }}>
              <div
                className="flex h-28 min-w-full items-end justify-between"
                style={{ gap: 'clamp(1px, 0.5vw, 6px)', minWidth: `${data.days.length * 18}px` }}
              >
                {data.days.map(([date, day], i) => {
                  // Altura proporcional al día más cargado, no al 100% teórico:
                  // así se ve la diferencia entre "poco esperado" y "no cumplido"
                  const ratio = day.expected === 0 ? 0 : day.done / day.expected
                  const scale = day.expected === 0 ? 0.02 : Math.max(0.08, ratio * (day.expected / maxExpected))
                  const full = day.expected > 0 && day.done >= day.expected
                  return (
                    <div key={date} className="flex w-[14px] shrink-0 grow flex-col items-center gap-1.5">
                      <div className="flex h-24 w-full items-end" title={`${date}: ${day.done}/${day.expected}`}>
                        <div
                          className={cn(
                            'bar-fill w-full rounded-md',
                            full
                              ? 'bg-emerald-500/90'
                              : day.expected === 0
                                ? 'bg-[var(--text-secondary)]/20'
                                : 'bg-violet-500/80'
                          )}
                          style={{
                            height: '100%',
                            transform: `scaleY(${scale})`,
                            transformOrigin: 'bottom',
                            transitionDelay: `${i * 8}ms`,
                          }}
                        />
                      </div>
                      <span className="text-center text-[9px] leading-none tabular-nums text-[var(--text-secondary)]">
                        {Number(date.slice(8, 10))}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          <section className="glass fade-up stagger space-y-3 p-4" style={{ '--i': 5 } as React.CSSProperties}>
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text-primary)]">
              <TrendingUp className="h-4 w-4 text-violet-500" aria-hidden="true" /> Por hábito
            </h2>
            {data.perHabit.length === 0 && (
              <p className="py-2 text-sm text-[var(--text-secondary)]">Sin hábitos activos en este período.</p>
            )}
            {data.perHabit.map(({ habit, expected, done, pct }) => (
              <div key={habit.id} className="flex items-center gap-3 py-1">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
                  style={{ backgroundColor: (habit.color ?? '#6d28d9') + '33' }}
                  aria-hidden="true"
                >
                  {habit.icon ?? '🎯'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <p className="truncate text-[15px] font-medium text-[var(--text-primary)]">{habit.name}</p>
                    <p className="shrink-0 text-xs tabular-nums text-[var(--text-secondary)]">
                      {done}/{expected} ·{' '}
                      <span
                        className={cn(
                          'font-semibold',
                          pct === 0 ? 'text-red-500' : pct >= 80 ? 'text-emerald-500' : 'text-amber-500'
                        )}
                      >
                        {pct}%
                      </span>
                    </p>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                    <div
                      className={cn(
                        'bar-fill h-full rounded-full',
                        pct === 0 ? 'bg-red-500/80' : pct >= 80 ? 'bg-emerald-500' : 'bg-violet-500'
                      )}
                      style={{ width: '100%', transform: `scaleX(${pct / 100})` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  )
}

function Metric({
  label,
  value,
  sub,
  icon,
  accent,
  i,
}: {
  label: string
  value: string
  sub?: string
  icon?: React.ReactNode
  accent?: boolean
  i: number
}) {
  return (
    <div className="glass fade-up stagger p-4" style={{ '--i': i } as React.CSSProperties}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">{label}</p>
      <p
        className={cn(
          'mt-1.5 flex items-center gap-1.5 text-3xl font-bold tabular-nums',
          accent ? 'text-violet-600 dark:text-violet-400' : 'text-[var(--text-primary)]'
        )}
      >
        {icon}
        {value}
      </p>
      {sub && <p className="text-xs text-[var(--text-secondary)]">{sub}</p>}
      {sub && <p className="text-xs text-[var(--text-secondary)]">{sub}</p>}
    </div>
  )
}
