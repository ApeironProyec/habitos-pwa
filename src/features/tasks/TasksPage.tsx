import { useState } from 'react'
import { Plus, Pencil, Trash2, Play, Timer as TimerIcon, CheckCircle2, Circle } from 'lucide-react'
import { useTasks } from './useTasks'
import { Timer } from './Timer'
import type { Task } from '@/lib/habits/types'
import { cn } from '@/lib/utils'

export default function TasksPage() {
  const { tasks, loading, error, create, update, remove, setStatus, addSpentMinutes } = useTasks()
  const [newTitle, setNewTitle] = useState('')
  const [editing, setEditing] = useState<Task | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editDue, setEditDue] = useState('')
  const [activeTimer, setActiveTimer] = useState<{ task: Task; minutes: number } | null>(null)
  const [timerMinutes, setTimerMinutes] = useState(30)
  const [pomodoroOpen, setPomodoroOpen] = useState(false)

  const pending = tasks.filter((t) => t.status !== 'completed')
  const completed = tasks.filter((t) => t.status === 'completed')

  async function addTask(e: React.FormEvent) {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    await create({ title, description: null, status: 'pending', due_date: null, due_time: null, estimated_minutes: null })
    setNewTitle('')
  }

  async function saveEdit() {
    if (!editing) return
    const title = editTitle.trim()
    if (!title) return
    await update(editing.id, {
      title,
      description: editDesc.trim() || null,
      due_date: editDue || null,
    })
    setEditing(null)
  }

  function startTask(task: Task) {
    setActiveTimer({ task, minutes: 30 })
    // marca como en progreso
    if (task.status === 'pending') update(task.id, { status: 'in_progress' })
  }

  function TaskRow({ task }: { task: Task }) {
    const isActive = activeTimer?.task.id === task.id
    return (
      <li
        className={cn(
          'group rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-zinc-100 transition dark:bg-zinc-900 dark:ring-zinc-800',
          task.status === 'in_progress' && 'ring-2 ring-violet-400 dark:ring-violet-500'
        )}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => setStatus(task.id, task.status === 'completed' ? 'pending' : 'completed')}
            className="shrink-0 text-zinc-300 transition hover:text-emerald-500 dark:text-zinc-600"
            title={task.status === 'completed' ? 'Desmarcar' : 'Completar'}
          >
            {task.status === 'completed' ? (
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            ) : (
              <Circle className="h-6 w-6" />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <p
              className={cn(
                'truncate font-medium text-zinc-800 dark:text-zinc-100',
                task.status === 'completed' && 'text-zinc-400 line-through dark:text-zinc-500'
              )}
            >
              {task.title}
            </p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              {task.status === 'in_progress' && <span className="font-semibold text-violet-600 dark:text-violet-400">En curso · </span>}
              {task.spent_minutes > 0 && `${task.spent_minutes} min invertidos`}
              {task.estimated_minutes ? ` · estimado ${task.estimated_minutes} min` : ''}
              {task.due_date ? ` · vence ${task.due_date}` : ''}
            </p>
          </div>

          <div className="flex shrink-0 gap-1">
            <button
              onClick={() => startTask(task)}
              disabled={task.status === 'completed'}
              className="rounded-lg bg-violet-600 p-2 text-white transition hover:bg-violet-700 active:scale-95 disabled:opacity-40"
              title="Iniciar con temporizador (30 min)"
            >
              <Play className="h-4 w-4" />
            </button>
            <button
              onClick={() => { setEditing(task); setEditTitle(task.title); setEditDesc(task.description ?? ''); setEditDue(task.due_date ?? '') }}
              className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => remove(task.id)}
              className="rounded-lg p-2 text-zinc-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {isActive && activeTimer && (
          <div className="mt-3">
            <Timer
              key={activeTimer.task.id + '-' + activeTimer.minutes}
              initialMinutes={activeTimer.minutes}
              label={activeTimer.task.title}
              onComplete={async () => {
                await addSpentMinutes(activeTimer.task.id, activeTimer.minutes)
                setActiveTimer(null)
              }}
              onClose={() => setActiveTimer(null)}
            />
          </div>
        )}
      </li>
    )
  }

  const inputCls =
    'w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-[15px] outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-violet-400 dark:focus:ring-violet-900'

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Tareas</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{pending.length} pendientes</p>
        </div>
        <button
          onClick={() => setPomodoroOpen(true)}
          className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-600/25 transition active:scale-95"
        >
          <TimerIcon className="h-4 w-4" /> Pomodoro
        </button>
      </header>

      {/* Pomodoro global */}
      {pomodoroOpen && (
        <Timer
          initialMinutes={25}
          label="Pomodoro — 25 min de foco"
          onComplete={() => {
            setTimeout(() => setPomodoroOpen(false), 4000)
          }}
          onClose={() => setPomodoroOpen(false)}
        />
      )}

      {/* Nueva tarea rápida */}
      <form onSubmit={addTask} className="flex gap-2">
        <input
          className={inputCls}
          placeholder="Agregar tarea… (ej. Barrer)"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <button
          type="submit"
          className="shrink-0 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow transition active:scale-95"
        >
          <Plus className="h-4 w-4" />
        </button>
      </form>

      {/* Selector de minutos del timer */}
      {!activeTimer && (
        <div className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-sm ring-1 ring-zinc-100 dark:bg-zinc-900 dark:ring-zinc-800">
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">Duración del temporizador</span>
          <div className="flex gap-1.5">
            {[15, 30, 45, 60].map((m) => (
              <button
                key={m}
                onClick={() => setTimerMinutes(m)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-semibold transition',
                  timerMinutes === m
                    ? 'bg-violet-600 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                )}
              >
                {m}′
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {loading ? (
        <p className="pt-8 text-center text-sm text-zinc-400">Cargando…</p>
      ) : (
        <>
          {pending.length === 0 && !loading && (
            <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              Sin tareas. Agrega la primera arriba.
            </p>
          )}
          <ul className="space-y-2.5">
            {pending.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </ul>

          {completed.length > 0 && (
            <section>
              <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                Completadas ({completed.length})
              </p>
              <ul className="space-y-2">
                {completed.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {/* Modal editar */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setEditing(null)}>
          <div
            className="w-full max-w-md rounded-t-3xl bg-zinc-50 p-5 pb-8 sm:rounded-3xl dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-bold text-zinc-900 dark:text-zinc-100">Editar tarea</h2>
            <div className="space-y-3">
              <input className={inputCls} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Título" autoFocus />
              <input className={inputCls} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Descripción (opcional)" />
              <input className={inputCls} type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} />
              <button
                onClick={saveEdit}
                className="w-full rounded-xl bg-violet-700 py-3 text-[15px] font-semibold text-white shadow transition active:scale-[0.98]"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
