import type { Task, TaskPriority } from '@/lib/habits/types'

/**
 * Orden y agrupación de tareas — lógica pura y testeada.
 *
 * Regla de negocio de Erick: en "Hoy" manda primero lo vencido/hoy y después
 * lo que se agendó para más adelante. Dentro de cada bloque la prioridad
 * decide (alta → media → baja) y, a igualdad, la hora.
 */

const PRIORITY_WEIGHT: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 }

export function priorityWeight(p: TaskPriority): number {
  return PRIORITY_WEIGHT[p] ?? 1
}

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
}

/** Categoría temporal de una tarea respecto de hoy. */
export type DueBucket = 'overdue' | 'today' | 'upcoming' | 'someday'

export function dueBucket(task: Task, today: string): DueBucket {
  if (!task.due_date) return 'someday'
  if (task.due_date < today) return 'overdue'
  if (task.due_date === today) return 'today'
  return 'upcoming'
}

export const BUCKET_LABEL: Record<DueBucket, string> = {
  overdue: 'Vencidas',
  today: 'Hoy',
  upcoming: 'Próximas',
  someday: 'Sin fecha',
}

/**
 * Comparador principal dentro de un mismo bucket:
 * prioridad primero, desempate por fecha y luego por hora.
 */
export function compareTasks(a: Task, b: Task): number {
  const pw = priorityWeight(a.priority) - priorityWeight(b.priority)
  if (pw !== 0) return pw

  // Ojo con nulls: una tarea con fecha va antes que una sin fecha en el mismo bucket
  const da = a.due_date ?? '9999'
  const db = b.due_date ?? '9999'
  if (da !== db) return da < db ? -1 : 1

  const ta = a.due_time ?? '23:59:59'
  const tb = b.due_time ?? '23:59:59'
  if (ta !== tb) return ta < tb ? -1 : 1

  return a.sort_order - b.sort_order
}

/** Divide las pendientes del día en secciones [vencidas, hoy, próximas, sin fecha]. */
export function buildTodaySections(
  tasks: Task[],
  today: string
): { bucket: DueBucket; tasks: Task[] }[] {
  const pending = tasks.filter((t) => t.status !== 'completed')
  const buckets: DueBucket[] = ['overdue', 'today', 'upcoming', 'someday']

  return buckets
    .map((bucket) => ({
      bucket,
      tasks: pending.filter((t) => dueBucket(t, today) === bucket).sort(compareTasks),
    }))
    .filter((s) => s.tasks.length > 0)
}

export type GroupMode = 'priority' | 'date' | 'list'

/** Agrupa pendientes (o completadas) según el modo elegido en la pantalla. */
export function groupTasks(
  tasks: Task[],
  mode: GroupMode,
  today: string,
  listsById?: Map<string, string>
): { key: string; label: string; order: number; tasks: Task[] }[] {
  const groups = new Map<string, { label: string; order: number; tasks: Task[] }>()

  const push = (key: string, label: string, order: number, t: Task) => {
    const g = groups.get(key) ?? { label, order, tasks: [] }
    g.tasks.push(t)
    groups.set(key, g)
  }

  if (mode === 'priority') {
    for (const t of tasks) push(t.priority, PRIORITY_LABEL[t.priority], priorityWeight(t.priority), t)
  } else if (mode === 'date') {
    for (const t of tasks) {
      const b = dueBucket(t, today)
      // Vencidas y hoy al frente, en ese orden conceptual
      const order = b === 'overdue' ? -1 : b === 'today' ? 0 : b === 'upcoming' ? 1 : 2
      const label =
        b === 'someday'
          ? 'Sin fecha'
          : b === 'overdue'
            ? `Vencida · ${t.due_date}`
            : (t.due_date ?? '')
      push(t.due_date ?? 'none', label, order, t)
    }
  } else {
    for (const t of tasks) {
      const name = (t.list_id && listsById?.get(t.list_id)) || 'General'
      push(t.list_id ?? 'general', name, 0, t)
    }
  }

  return [...groups.entries()]
    .map(([key, g]) => ({ key, label: g.label, order: g.order, tasks: [...g.tasks].sort(compareTasks) }))
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
}

/** Extrae tags válidos de texto libre separado por comas o espacios (#tag). */
export function parseTags(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[,\s]+/)
        .map((t) => t.replace(/^#/, '').trim().toLowerCase())
        .filter((t) => t.length > 0 && t.length <= 24)
    ),
  ].slice(0, 8)
}
