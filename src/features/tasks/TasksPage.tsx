import { useState } from 'react'
import { Plus, Pencil, Trash2, Play, Timer as TimerIcon, CheckCircle2, Circle } from 'lucide-react'
import { useTasks } from './useTasks'
import { Timer } from './Timer'
import { Modal } from '@/components/Modal'
import { SkeletonList, EmptyState } from '@/components/Skeleton'
import type { Task } from '@/lib/habits/types'
import { cn } from '@/lib/utils'

const TIMER_PRESETS = [15, 25, 30, 45, 60]

export default function TasksPage() {
  const { tasks, loading, error, create, update, remove, setStatus, addSpentMinutes } = useTasks()
  const [newTitle, setNewTitle] = useState('')
  const [editing, setEditing] = useState<Task | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editDue, setEditDue] = useState('')
  const [editEstimate, setEditEstimate] = useState('')
  const [activeTimer, setActiveTimer] = useState<{ taskId: string; minutes: number } | null>(null)
  /** Duración elegida. Antes existía en el estado pero startTask ignoraba su valor. */
  const [timerMinutes, setTimerMinutes] = useState(30)
  const [pomodoroOpen, setPomodoroOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const pending = tasks.filter((t) => t.status !== 'completed')
  const completed = tasks.filter((t) => t.status === 'completed')

  async function addTask(e: React.FormEvent) {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title || busy) return
    setBusy(true)
    try {
      await create({
        title,
        description: null,
        status: 'pending',
        due_date: null,
        due_time: null,
        estimated_minutes: null,
      })
      setNewTitle('')
    } finally {
      setBusy(false)
    }
  }

  function openEdit(task: Task) {
    setEditing(task)
    setEditTitle(task.title)
    setEditDesc(task.description ?? '')
    setEditDue(task.due_date ?? '')
    setEditEstimate(task.estimated_minutes != null ? String(task.estimated_minutes) : '')
  }

  async function saveEdit() {
    if (!editing) return
    const title = editTitle.trim()
    if (!title) return
    const estimate = editEstimate.trim() ? Number(editEstimate) : null
    await update(editing.id, {
      title,
      description: editDesc.trim() || null,
      due_date: editDue || null,
      estimated_minutes: estimate != null && estimate > 0 ? Math.round(estimate) : null,
    })
    setEditing(null)
  }

  function startTask(task: Task) {
    // Usa el estimado de la tarea si lo tiene; si no, la duración elegida
    const minutes = task.estimated_minutes && task.estimated_minutes > 0 ? task.estimated_minutes : timerMinutes
    setActiveTimer({ taskId: task.id, minutes })
    if (task.status === 'pending') void update(task.id, { status: 'in_progress' })
  }

  const inputCls =
    'w-full rounded-xl border border-[var(--card-border)] bg-black/[0.03] px-3.5 py-2.5 text-[15px] text-[var(--text-primary)] outline-none t-fast focus:border-violet-500 focus:ring-2 focus:ring-violet-500/25 dark:bg-white/[0.06]'

  function TaskRow({ task, index }: { task: Task; index: number }) {
    const isActive = activeTimer?.taskId === task.id
    return (
      <li
        className={cn(
          'glass fade-up stagger t-fast p-3.5',
          task.status === 'in_progress' && 'ring-2 ring-violet-500/40'
        )}
        style={{ '--i': index } as React.CSSProperties}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => setStatus(task.id, task.status === 'completed' ? 'pending' : 'completed')}
            className="tap shrink-0 text-[var(--text-secondary)] hover:text-emerald-500"
            aria-label={task.status === 'completed' ? `Desmarcar ${task.title}` : `Completar ${task.title}`}
          >
            {task.status === 'completed' ? (
              <CheckCircle2 className="pop h-6 w-6 text-emerald-500" aria-hidden="true" />
            ) : (
              <Circle className="h-6 w-6" aria-hidden="true" />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <p
              className={cn(
                'truncate font-medium text-[var(--text-primary)]',
                task.status === 'completed' && 'text-[var(--text-secondary)] line-through'
              )}
            >
              {task.title}
            </p>
            <p className="truncate text-xs text-[var(--text-secondary)]">
              {task.status === 'in_progress' && (
                <span className="font-semibold text-violet-600 dark:text-violet-400">En curso · </span>
              )}
              {task.spent_minutes > 0 && `${task.spent_minutes} min invertidos`}
              {task.estimated_minutes ? `${task.spent_minutes > 0 ? ' · ' : ''}est. ${task.estimated_minutes} min` : ''}
              {task.due_date ? ` · vence ${task.due_date}` : ''}
              {!task.spent_minutes && !task.estimated_minutes && !task.due_date && 'Sin detalles'}
            </p>
          </div>

          <div className="flex shrink-0 gap-1">
            <button
              onClick={() => startTask(task)}
              disabled={task.status === 'completed'}
              className="tap rounded-lg bg-violet-600 p-2 text-white disabled:opacity-40"
              aria-label={`Iniciar temporizador para ${task.title}`}
            >
              <Play className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              onClick={() => openEdit(task)}
              className="tap rounded-lg p-2 text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/10"
              aria-label={`Editar ${task.title}`}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              onClick={() => remove(task.id)}
              className="tap rounded-lg p-2 text-[var(--text-secondary)] hover:bg-red-500/10 hover:text-red-600"
              aria-label={`Eliminar ${task.title}`}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {isActive && activeTimer && (
          <div className="mt-3">
            <Timer
              key={`${activeTimer.taskId}-${activeTimer.minutes}`}
              initialMinutes={activeTimer.minutes}
              label={task.title}
              onComplete={async (elapsed) => {
                await addSpentMinutes(activeTimer.taskId, elapsed)
                setActiveTimer(null)
              }}
              onClose={() => setActiveTimer(null)}
            />
          </div>
        )}
      </li>
    )
  }

  return (
    <div className="space-y-5">
      <header className="fade-up flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-[var(--text-primary)]">Tareas</h1>
          <p className="text-sm text-[var(--text-secondary)]">{pending.length} pendientes</p>
        </div>
        <button
          onClick={() => setPomodoroOpen((v) => !v)}
          aria-pressed={pomodoroOpen}
          className="tap-strong flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-600/25"
        >
          <TimerIcon className="h-4 w-4" aria-hidden="true" /> Pomodoro
        </button>
      </header>

      {pomodoroOpen && (
        <Timer
          initialMinutes={25}
          label="Pomodoro — 25 min de foco"
          onClose={() => setPomodoroOpen(false)}
        />
      )}

      <form onSubmit={addTask} className="fade-up flex gap-2">
        <input
          className={inputCls}
          placeholder="Agregar tarea… (ej. Barrer)"
          aria-label="Nueva tarea"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <button
          type="submit"
          disabled={busy || !newTitle.trim()}
          className="tap-strong shrink-0 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow disabled:opacity-40"
          aria-label="Agregar tarea"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>

      {!activeTimer && (
        <div className="glass fade-up flex items-center justify-between p-3">
          <span className="text-sm font-medium text-[var(--text-secondary)]">Duración del temporizador</span>
          <div className="flex gap-1.5">
            {TIMER_PRESETS.map((m) => (
              <button
                key={m}
                onClick={() => setTimerMinutes(m)}
                aria-pressed={timerMinutes === m}
                className={cn(
                  'tap rounded-lg px-3 py-1.5 text-sm font-semibold',
                  timerMinutes === m
                    ? 'bg-violet-600 text-white'
                    : 'bg-black/5 text-[var(--text-secondary)] dark:bg-white/10'
                )}
              >
                {m}′
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="fade-in rounded-xl bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <SkeletonList count={3} />
      ) : (
        <>
          {pending.length === 0 && (
            <EmptyState title="Sin tareas pendientes." hint="Agrega la primera arriba." />
          )}
          <ul className="space-y-2.5">
            {pending.map((t, i) => (
              <TaskRow key={t.id} task={t} index={i} />
            ))}
          </ul>

          {completed.length > 0 && (
            <section>
              <p className="mb-2 mt-6 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Completadas ({completed.length})
              </p>
              <ul className="space-y-2">
                {completed.map((t, i) => (
                  <TaskRow key={t.id} task={t} index={i} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {editing && (
        <Modal
          title="Editar tarea"
          onClose={() => setEditing(null)}
          footer={
            <button
              onClick={saveEdit}
              className="tap-strong w-full rounded-xl bg-violet-700 py-3 text-[15px] font-semibold text-white shadow"
            >
              Guardar
            </button>
          }
        >
          <div className="space-y-3 pb-2">
            <input
              className={inputCls}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Título"
              aria-label="Título"
            />
            <input
              className={inputCls}
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="Descripción (opcional)"
              aria-label="Descripción"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]" htmlFor="task-due">
                  Vence
                </label>
                <input
                  id="task-due"
                  className={inputCls}
                  type="date"
                  value={editDue}
                  onChange={(e) => setEditDue(e.target.value)}
                />
              </div>
              <div>
                {/* estimated_minutes estaba en el esquema pero no había forma de escribirlo */}
                <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]" htmlFor="task-est">
                  Estimado (min)
                </label>
                <input
                  id="task-est"
                  className={inputCls}
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={editEstimate}
                  onChange={(e) => setEditEstimate(e.target.value)}
                  placeholder="30"
                />
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
