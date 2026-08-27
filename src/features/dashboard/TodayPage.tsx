import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Check, X, RotateCcw, Circle } from 'lucide-react'
import { useHabits, useToday } from '@/features/habits/useHabits'
import { useTasks } from '@/features/tasks/useTasks'
import { SkeletonList, EmptyState } from '@/components/Skeleton'
import * as repo from '@/lib/db/repo'
import { displayTime, nowTime } from '@/lib/habits/frequency'
import {
  buildTodaySections,
  BUCKET_LABEL,
  PRIORITY_LABEL,
  type DueBucket,
} from '@/lib/tasks/sort'
import type { TaskPriority } from '@/lib/habits/types'
import { cn } from '@/lib/utils'

const PRIO_DOT: Record<TaskPriority, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-emerald-500',
}

const SECTION_ICON: Record<DueBucket, string> = {
  overdue: '⚠️',
  today: '📌',
  upcoming: '🗓️',
  someday: '📥',
}

export default function TodayPage() {
  const { habits, loading: habitsLoading } = useHabits()
  const { occurrences, loading, error, mark } = useToday(habits, habitsLoading)
  const { tasks } = useTasks()

  const todayDate = useMemo(() => new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()), [])
  const currentTime = useMemo(() => nowTime(), [])

  /**
   * Secciones de tareas: vencidas → hoy → próximas → sin fecha.
   * Erick pidió explícitamente: priorizar lo de hoy y después lo demás
   * según cuándo se agendó; dentro de cada sección manda la prioridad.
   */
  const taskSections = useMemo(() => buildTodaySections(tasks, toDateStr()), [tasks])

  const habitsGrouped = useMemo(() => {
    const byHabit = new Map<string, typeof occurrences>()
    for (const o of occurrences) {
      const list = byHabit.get(o.habit_id) ?? []
      list.push(o)
      byHabit.set(o.habit_id, list)
    }
    return habits
      .filter((h) => h.is_active)
      .map((h) => {
        const occs = (byHabit.get(h.id) ?? []).sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time))
        const done = occs.filter((o) => o.status === 'completed').length
        const total = occs.length
        return { habit: h, occs, done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) }
      })
      .filter((g) => g.total > 0)
  }, [habits, occurrences])

  const habitDone = habitsGrouped.reduce((s, g) => s + g.done, 0)
  const habitTotal = habitsGrouped.reduce((s, g) => s + g.total, 0)
  const taskTodayCount = taskSections.find((s) => s.bucket === 'today')?.tasks.length ?? 0
  const taskOverdueCount = taskSections.find((s) => s.bucket === 'overdue')?.tasks.length ?? 0

  const hasContent = habitsGrouped.length > 0 || taskSections.length > 0

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
        <p className="text-sm capitalize text-[var(--text-secondary)]">{todayDate}</p>
        <h1 className="text-[28px] font-bold tracking-tight text-[var(--text-primary)]">Tu día</h1>
      </header>

      {/* Resumen: hábitos + tareas urgente */}
      {(taskOverdueCount > 0 || taskTodayCount > 0) && (
        <div className="fade-up flex gap-2">
          {taskOverdueCount > 0 && (
            <Link to="/tasks" className="tap flex-1 rounded-xl bg-red-500/10 p-3 text-center">
              <p className="text-xl font-bold tabular-nums text-red-600 dark:text-red-400">{taskOverdueCount}</p>
              <p className="text-[11px] font-medium text-red-600 dark:text-red-400">vencidas</p>
            </Link>
          )}
          {taskTodayCount > 0 && (
            <Link to="/tasks" className="tap flex-1 rounded-xl bg-violet-500/10 p-3 text-center">
              <p className="text-xl font-bold tabular-nums text-violet-600 dark:text-violet-400">{taskTodayCount}</p>
              <p className="text-[11px] font-medium text-violet-600 dark:text-violet-400">para hoy</p>
            </Link>
          )}
        </div>
      )}

      {error && (
        <p className="fade-in rounded-xl bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* ===== TAREAS ===== */}
      {taskSections.length > 0 && (
        <section className="space-y-3">
          {taskSections.map((section) => (
            <div key={section.bucket} className="fade-up stagger">
              <h2
                className={cn(
                  'mb-1.5 text-xs font-semibold uppercase tracking-wider',
                  section.bucket === 'overdue' ? 'text-red-500' : 'text-[var(--text-secondary)]'
                )}
              >
                {SECTION_ICON[section.bucket]} {BUCKET_LABEL[section.bucket]} · {section.tasks.length}
              </h2>
              <ul className="space-y-1.5">
                {section.tasks.slice(0, 5).map((t) => (
                  <li key={t.id} className="glass flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5">
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', PRIO_DOT[t.priority])} title={`Prioridad ${PRIORITY_LABEL[t.priority]}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">{t.title}</p>
                      <p className="text-[11px] tabular-nums text-[var(--text-secondary)]">
                        {PRIORITY_LABEL[t.priority]}
                        {t.due_date && t.due_date !== toDateStr() && ` · ${t.due_date.slice(5)}`}
                        {t.due_time && ` · ${displayTime(t.due_time)}`}
                      </p>
                    </div>
                    <CompleteDot taskId={t.id} onToggle={() => void repo.setTaskStatus(t.id, t.status === 'completed' ? 'pending' : 'completed')} />
                  </li>
                ))}
                {section.tasks.length > 5 && (
                  <li>
                    <Link to="/tasks" className="block px-2 py-1.5 text-xs font-medium text-violet-600 dark:text-violet-400">
                      Ver todas ({section.tasks.length}) →
                    </Link>
                  </li>
                )}
              </ul>
            </div>
          ))}
        </section>
      )}

      {/* ===== HÁBITOS ===== */}
      {habitsGrouped.length > 0 && (
        <>
          <h2 className="fade-up text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            🎯 Hábitos de hoy
          </h2>

          {/* Progreso del día (hábitos) */}
          <section className="glass fade-up stagger p-4" style={{ '--i': 1 } as React.CSSProperties}>
            <div className="mb-2 flex items-end justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Progreso de hábitos</p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-[var(--text-primary)]">
                  {habitTotal === 0 ? 0 : Math.round((habitDone / habitTotal) * 100)}%
                </p>
              </div>
              <p className="text-sm text-[var(--text-secondary)]">{habitDone} / {habitTotal}</p>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div
                className={cn('bar-fill h-full rounded-full', habitTotal > 0 && habitDone === habitTotal ? 'bg-emerald-500' : 'bg-violet-600')}
                style={{ transform: `scaleX(${habitTotal === 0 ? 0 : habitDone / habitTotal})`, width: '100%' }}
              />
            </div>
            {habitTotal > 0 && habitDone === habitTotal && (
              <p className="fade-in mt-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">🎉 ¡Día completo!</p>
            )}
          </section>

          {habitsGrouped.map(({ habit, occs, done, total, pct }, idx) => (
            <article key={habit.id} className="glass fade-up stagger p-4" style={{ '--i': idx + 2 } as React.CSSProperties}>
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
                    <p className="text-xs text-[var(--text-secondary)]">{done}/{total} · {pct}%</p>
                  </div>
                </div>
                {pct === 100 ? (
                  <span className="scale-in shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">Listo ✓</span>
                ) : (
                  <span className="shrink-0 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">Pendiente</span>
                )}
              </div>

              <ul className="mt-1 space-y-1.5">
                {occs.map((o) => {
                  const time = displayTime(o.scheduled_time)
                  const isNow =
                    o.status === 'pending' &&
                    o.scheduled_time <= currentTime &&
                    !occs.some((x) => x.status === 'pending' && x.scheduled_time <= currentTime && x.scheduled_time > o.scheduled_time)

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
                          {o.status === 'completed' ? <Check className="pop h-4 w-4" /> : o.status === 'skipped' ? <X className="h-3.5 w-3.5" /> : time.slice(0, 2)}
                        </span>
                        <span className={cn('text-sm tabular-nums', o.status === 'completed' ? 'text-[var(--text-secondary)] line-through' : 'text-[var(--text-primary)]')}>
                          {time}
                          {o.status === 'skipped' && ' · omitido'}
                          {isNow && <span className="ml-1.5 text-[11px] font-semibold text-violet-500">ahora</span>}
                        </span>
                      </div>

                      <div className="flex gap-1.5">
                        {o.status !== 'completed' && (
                          <button onClick={() => mark(o.id, 'completed')} className="tap rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white" aria-label={`Marcar ${habit.name} de las ${time} como hecho`}>
                            Hecho
                          </button>
                        )}
                        {o.status === 'pending' && (
                          <button onClick={() => mark(o.id, 'skipped')} className="tap rounded-lg bg-black/5 px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] dark:bg-white/10" aria-label={`Omitir ${habit.name} de las ${time}`}>
                            Omitir
                          </button>
                        )}
                        {o.status !== 'pending' && (
                          <button onClick={() => mark(o.id, 'pending')} className="tap rounded-lg bg-black/5 p-1.5 text-[var(--text-secondary)] dark:bg-white/10" aria-label={`Deshacer ${habit.name} de las ${time}`}>
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
        </>
      )}

      {!hasContent && (
        <EmptyState
          title="Nada programado para hoy."
          hint="Crea tu primer hábito o agrega tareas para empezar."
          action={
            <Link to="/habits" className="tap-strong inline-flex items-center gap-1.5 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-700/25">
              <Plus className="h-4 w-4" aria-hidden="true" /> Crear hábito
            </Link>
          }
        />
      )}
    </div>
  )
}

/** Checkbox circular compacto para las tareas del resumen. */
function CompleteDot({ onToggle }: { taskId?: string; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="tap shrink-0 rounded-full p-1 text-[var(--text-secondary)] hover:bg-emerald-500/10 hover:text-emerald-500"
      aria-label="Completar tarea"
    >
      <Circle className="h-5 w-5" aria-hidden="true" />
    </button>
  )
}

function toDateStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
