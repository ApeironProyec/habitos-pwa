import { useMemo, useState } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  Play,
  CheckCircle2,
  Circle,
  Tag as TagIcon,
  Clock,
  Flag,
} from 'lucide-react'
import { useTasks, useTaskLists } from './useTasks'
import { Timer } from './Timer'
import { useAuth } from '@/features/auth/useAuth'
import { Modal } from '@/components/Modal'
import { SkeletonList, EmptyState } from '@/components/Skeleton'
import * as repo from '@/lib/db/repo'
import { todayStr } from '@/lib/habits/frequency'
import {
  compareTasks,
  groupTasks,
  parseTags,
  PRIORITY_LABEL,
  dueBucket,
  type GroupMode,
} from '@/lib/tasks/sort'
import type { Task, TaskPriority, TaskList } from '@/lib/habits/types'
import { cn } from '@/lib/utils'

const PRIO_STYLES: Record<TaskPriority, string> = {
  high: 'bg-red-500/15 text-red-600 dark:text-red-400',
  medium: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  low: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
}

export default function TasksPage() {
  const { tasks, loading, error, create, remove, setStatus } = useTasks()
  const { lists } = useTaskLists()
  const today = todayStr()

  // ---------- estado UI ----------
  const [newTitle, setNewTitle] = useState('')
  /** Creación en una línea con prioridad por default; "Detallada" abre el modal completo. */
  const [quickModalOpen, setQuickModalOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [activeTimer, setActiveTimer] = useState<{ taskId: string; minutes: number } | null>(null)
  /** Duración del foco. Fija en 30: los presets eran ruido sin pomodoro global. */
  const [timerMinutes] = useState(30)
  const [groupMode, setGroupMode] = useState<GroupMode>('priority')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [listFilter, setListFilter] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)

  const listsById = useMemo(() => new Map(lists.map((l) => [l.id, l.name])), [lists])

  const allTags = useMemo(() => {
    const s = new Set<string>()
    for (const t of tasks) for (const tag of t.tags ?? []) s.add(tag)
    return [...s].sort()
  }, [tasks])

  /** Filtros aplicados antes de agrupar. */
  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (t.deleted_at) return false
      if (t.status === 'completed' && !showCompleted) return false
      if (tagFilter && !(t.tags ?? []).includes(tagFilter)) return false
      if (listFilter && (t.list_id ?? '') !== listFilter) return false
      return true
    })
  }, [tasks, showCompleted, tagFilter, listFilter])

  const pending = useMemo(() => filtered.filter((t) => t.status !== 'completed'), [filtered])
  const completed = useMemo(() => filtered.filter((t) => t.status === 'completed'), [filtered])

  const groups = useMemo(
    () => groupTasks(pending, groupMode, today, listsById),
    [pending, groupMode, today, listsById]
  )

  async function addQuick(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    await create({
      title: newTitle.trim(),
      description: null,
      status: 'pending',
      due_date: null,
      due_time: null,
      priority: 'medium',
      tags: [],
      list_id: listFilter && listFilter !== 'general' ? listFilter : null,
      reminder_date: null,
      reminder_time: null,
      estimated_minutes: null,
    })
    setNewTitle('')
  }

  const inputCls =
    'w-full rounded-xl border border-[var(--card-border)] bg-black/[0.03] px-3.5 py-2.5 text-[15px] text-[var(--text-primary)] outline-none t-fast focus:border-violet-500 focus:ring-2 focus:ring-violet-500/25 dark:bg-white/[0.06]'
  const chipCls = (active: boolean) =>
    cn(
      'tap rounded-full px-3 py-1.5 text-xs font-semibold',
      active ? 'bg-violet-600 text-white' : 'bg-black/5 text-[var(--text-secondary)] dark:bg-white/10'
    )

  return (
    <div className="space-y-4">
      <header className="fade-up flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-[var(--text-primary)]">Tareas</h1>
          <p className="text-sm text-[var(--text-secondary)]">{pending.length} pendientes</p>
        </div>
        <button
          onClick={() => setQuickModalOpen(true)}
          className="tap-strong flex items-center gap-1.5 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-700/25"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Detallada
        </button>
      </header>

      {error && (
        <p role="alert" className="fade-in rounded-xl bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {/* Creación rápida en línea */}
      <form onSubmit={addQuick} className="fade-up flex gap-2">
        <input
          className={inputCls}
          placeholder="Tarea rápida… (Enter)"
          aria-label="Nueva tarea rápida"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <button
          type="submit"
          disabled={!newTitle.trim()}
          className="tap-strong shrink-0 rounded-xl bg-violet-700 px-4 py-2.5 text-white shadow disabled:opacity-40"
          aria-label="Agregar tarea"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>

      {/* Modo de agrupación + filtros */}
      <div className="space-y-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {(
            [
              ['priority', 'Prioridad'],
              ['date', 'Fecha'],
              ['list', 'Lista'],
            ] as [GroupMode, string][]
          ).map(([m, label]) => (
            <button key={m} onClick={() => setGroupMode(m)} className={chipCls(groupMode === m)}>
              {label}
            </button>
          ))}
        </div>
        {allTags.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button onClick={() => setTagFilter(null)} className={chipCls(!tagFilter)}>
              Todas
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                className={cn(chipCls(tagFilter === tag), 'gap-1 inline-flex items-center')}
              >
                <TagIcon className="h-3 w-3" aria-hidden="true" /> {tag}
              </button>
            ))}
          </div>
        )}
        {lists.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button onClick={() => setListFilter(null)} className={chipCls(!listFilter)}>
              Todas las listas
            </button>
            {lists.map((l) => (
              <button
                key={l.id}
                onClick={() => setListFilter(listFilter === l.id ? null : l.id)}
                className={cn('tap inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold',
                  listFilter === l.id ? 'bg-violet-600 text-white' : 'bg-black/5 text-[var(--text-secondary)] dark:bg-white/10')}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color ?? '#8b5cf6' }} />
                {l.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <SkeletonList count={3} />
      ) : (
        <>
          {/* Grupos según modo */}
          {groups.length === 0 && pending.length === 0 && (
            <EmptyState title={completed.length > 0 ? 'Solo quedan completadas.' : 'Sin tareas pendientes.'} hint="Agrega una arriba o crea una detallada." />
          )}

          {groups.map((g) => (
            <section key={g.key}>
              <h2 className="mb-2 mt-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                {groupMode === 'priority' && g.key !== 'medium' && (
                  <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {g.label}
                <span className="font-normal normal-case opacity-60">({g.tasks.length})</span>
              </h2>
              <ul className="space-y-2">
                {g.tasks.map((t, i) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    index={i}
                    listsById={listsById}
                    onStart={() => setActiveTimer({ taskId: t.id, minutes: timerMinutes })}
                    onComplete={() => setStatus(t.id, 'completed')}
                    onUncomplete={() => setStatus(t.id, 'pending')}
                    onEdit={() => setEditing(t)}
                    onDelete={() => remove(t.id)}
                  />
                ))}
              </ul>
            </section>
          ))}

          {completed.length > 0 && (
            <section>
              <button
                onClick={() => setShowCompleted((v) => !v)}
                className="mb-2 mt-6 flex w-full items-center gap-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
              >
                Completadas ({completed.length})
                <span className="t-transform">{showCompleted ? '▾' : '▸'}</span>
              </button>
              {showCompleted && (
                <ul className="space-y-2">
                  {[...completed].sort(compareTasks).map((t, i) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      index={i}
                      listsById={listsById}
                      onStart={() => {}}
                      onComplete={() => setStatus(t.id, 'completed')}
                      onUncomplete={() => setStatus(t.id, 'pending')}
                      onEdit={() => setEditing(t)}
                      onDelete={() => remove(t.id)}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      {activeTimer && (
        <Timer
          initialMinutes={timerMinutes}
          label={`Foco · ${timerMinutes} min`}
          onClose={() => setActiveTimer(null)}
        />
      )}

      {editing && (
        <TaskFormModal
          task={editing}
          lists={lists}
          knownTags={allTags}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      )}

      {quickModalOpen && (
        <TaskFormModal
          task={null}
          lists={lists}
          knownTags={allTags}
          initialListId={listFilter && listFilter !== 'general' ? listFilter : undefined}
          onClose={() => setQuickModalOpen(false)}
          onSaved={() => setQuickModalOpen(false)}
        />
      )}
    </div>
  )
}

// ============================================================
// Fila de tarea
// ============================================================

function TaskRow({
  task,
  index,
  listsById,
  onStart,
  onComplete,
  onUncomplete,
  onEdit,
  onDelete,
}: {
  task: Task
  index: number
  listsById: Map<string, string>
  onStart: () => void
  onComplete: () => void
  onUncomplete: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const done = task.status === 'completed'
  const bucket = dueBucket(task, todayStr())

  return (
    <li
      className={cn(
        'glass fade-up stagger p-3.5',
        done && 'opacity-60'
      )}
      style={{ '--i': index } as React.CSSProperties}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={done ? onUncomplete : onComplete}
          className="tap mt-0.5 shrink-0 text-[var(--text-secondary)] hover:text-emerald-500"
          aria-label={done ? `Reabrir ${task.title}` : `Completar ${task.title}`}
        >
          {done ? (
            <CheckCircle2 className="pop h-6 w-6 text-emerald-500" aria-hidden="true" />
          ) : (
            <Circle className="h-6 w-6" aria-hidden="true" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'font-medium leading-snug text-[var(--text-primary)]',
              done && 'line-through text-[var(--text-secondary)]'
            )}
          >
            {task.title}
          </p>

          {(task.description || (task.tags?.length ?? 0) > 0 || task.due_date || task.list_id) && (
            <div className="mt-1.5 space-y-1">
              {task.description && (
                <p className="line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {task.description}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase', PRIO_STYLES[task.priority])}>
                  {PRIORITY_LABEL[task.priority]}
                </span>
                {task.due_date && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
                      bucket === 'overdue'
                        ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                        : bucket === 'today'
                          ? 'bg-violet-500/15 text-violet-600 dark:text-violet-300'
                          : 'bg-black/5 text-[var(--text-secondary)] dark:bg-white/10'
                    )}
                  >
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    {bucket === 'overdue' && 'Vencida · '}
                    {bucket === 'today' && 'Hoy · '}
                    {task.due_date.slice(5)}
                    {task.due_time ? ` ${task.due_time.slice(0, 5)}` : ''}
                  </span>
                )}
                {task.reminder_date && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-400">
                    🔔 {task.reminder_date.slice(5)}
                    {task.reminder_time ? ` ${task.reminder_time.slice(0, 5)}` : ''}
                  </span>
                )}
                {task.list_id && listsById.get(task.list_id) && (
                  <span className="rounded-md bg-black/5 px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)] dark:bg-white/10">
                    {listsById.get(task.list_id)}
                  </span>
                )}
                {(task.tags ?? []).map((tag) => (
                  <span key={tag} className="rounded-md bg-black/5 px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)] dark:bg-white/10">
                    #{tag}
                  </span>
                ))}
                {task.spent_minutes > 0 && (
                  <span className="text-[10px] tabular-nums text-[var(--text-secondary)]">
                    · {task.spent_minutes} min
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-0.5">
          {!done && (
            <button
              onClick={onStart}
              className="tap rounded-lg p-2 text-[var(--text-secondary)] hover:bg-black/5 hover:text-violet-600 dark:hover:bg-white/10"
              aria-label={`Iniciar foco para ${task.title}`}
              title="Iniciar temporizador de foco"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          <button
            onClick={onEdit}
            className="tap rounded-lg p-2 text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/10"
            aria-label={`Editar ${task.title}`}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            onClick={onDelete}
            className="tap rounded-lg p-2 text-[var(--text-secondary)] hover:bg-red-500/10 hover:text-red-600"
            aria-label={`Eliminar ${task.title}`}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </li>
  )
}

// ============================================================
// Modal de tarea detallada (crear/editar)
// ============================================================

function TaskFormModal({
  task,
  lists,
  knownTags,
  initialListId,
  onClose,
  onSaved,
}: {
  task: Task | null
  lists: TaskList[]
  knownTags: string[]
  initialListId?: string
  onClose: () => void
  onSaved: () => void
}) {
  const { user } = useAuth()
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium')
  const [dueDate, setDueDate] = useState(task?.due_date ?? '')
  const [dueTime, setDueTime] = useState(task?.due_time?.slice(0, 5) ?? '')
  const [reminderDate, setReminderDate] = useState(task?.reminder_date ?? '')
  const [reminderTime, setReminderTime] = useState(task?.reminder_time?.slice(0, 5) ?? '')
  const [tagsInput, setTagsInput] = useState((task?.tags ?? []).join(', '))
  const [listId, setListId] = useState<string>(task?.list_id ?? initialListId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return setError('El título es obligatorio')
    if (!user) return setError('Sin sesión activa')
    if (reminderDate && !/^\\d{4}-\\d{2}-\\d{2}$/.test(reminderDate)) return setError('Fecha de recordatorio inválida')

    setSaving(true)
    try {
      const input = {
        title: title.trim(),
        description: description.trim() || null,
        status: task?.status ?? ('pending' as const),
        due_date: dueDate || null,
        due_time: dueTime ? `${dueTime}:00` : null,
        priority,
        tags: parseTags(tagsInput),
        list_id: listId || null,
        reminder_date: reminderDate || null,
        reminder_time: reminderTime ? `${reminderTime}:00` : null,
        estimated_minutes: task?.estimated_minutes ?? null,
      }

      if (task) await repo.updateTask(task.id, input)
      else await repo.createTask(input, user.id)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    'w-full rounded-xl border border-[var(--card-border)] bg-black/[0.03] px-3.5 py-2.5 text-[15px] text-[var(--text-primary)] outline-none t-fast focus:border-violet-500 focus:ring-2 focus:ring-violet-500/25 dark:bg-white/[0.06]'
  const labelCls = 'mb-1.5 block text-sm font-medium text-[var(--text-primary)]'

  return (
    <Modal
      title={task ? 'Editar tarea' : 'Nueva tarea detallada'}
      onClose={onClose}
      footer={
        <button
          type="submit"
          form="task-form"
          disabled={saving}
          className="tap-strong w-full rounded-xl bg-violet-700 py-3 text-[15px] font-semibold text-white shadow-lg shadow-violet-700/25 disabled:opacity-60"
        >
          {saving ? 'Guardando…' : task ? 'Guardar cambios' : 'Crear tarea'}
        </button>
      }
    >
      <form id="task-form" onSubmit={save} className="space-y-4 pb-2">
        <div>
          <label className={labelCls} htmlFor="task-title">Título *</label>
          <input id="task-title" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>

        <div>
          <label className={labelCls} htmlFor="task-desc">Descripción</label>
          <textarea
            id="task-desc"
            className={cn(inputCls, 'min-h-[72px] resize-y')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detalles, enlaces, contexto…"
          />
        </div>

        <fieldset>
          <legend className={labelCls}>Prioridad</legend>
          <div className="grid grid-cols-3 gap-2">
            {(['high', 'medium', 'low'] as TaskPriority[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                aria-pressed={priority === p}
                className={cn(
                  'tap rounded-xl border px-3 py-2.5 text-sm font-semibold capitalize',
                  priority === p
                    ? p === 'high'
                      ? 'border-red-500 bg-red-500/15 text-red-600 dark:text-red-400'
                      : p === 'medium'
                        ? 'border-amber-500 bg-amber-500/15 text-amber-600 dark:text-amber-400'
                        : 'border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'border-[var(--card-border)] text-[var(--text-secondary)]'
                )}
              >
                {PRIORITY_LABEL[p]}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="task-due">Para cuándo</label>
            <input id="task-due" type="date" className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="task-duetime">Hora (opcional)</label>
            <input id="task-duetime" type="time" className={inputCls} value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="task-rend">Recordatorio</label>
            <input id="task-rend" type="date" className={inputCls} value={reminderDate} onChange={(e) => setReminderDate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="task-rent">Hora del recordatorio</label>
            <input id="task-rent" type="time" className={inputCls} value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} />
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="task-tags">Etiquetas</label>
          <input
            id="task-tags"
            className={inputCls}
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="casa, estudio, urgente…"
          />
          {knownTags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {knownTags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTagsInput((prev) => (prev ? `${prev}, ${t}` : t))}
                  className="tap rounded-md bg-black/5 px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] dark:bg-white/10"
                >
                  #{t}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className={labelCls} htmlFor="task-list">Lista</label>
          <select id="task-list" className={inputCls} value={listId} onChange={(e) => setListId(e.target.value)}>
            <option value="">General</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        {error && (
          <p role="alert" className="fade-in rounded-xl bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
