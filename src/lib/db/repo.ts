/**
 * Repositorio local: única puerta de escritura de la app.
 *
 * Patrón local-first. Cada mutación:
 *   1. escribe en IndexedDB (la UI lee de ahí, así que el cambio se ve al instante)
 *   2. encola la operación en el outbox
 *   3. dispara un intento de sync que puede fallar sin consecuencias
 *
 * Ninguna pantalla llama a Supabase directamente. Eso es lo que permite que
 * la app entera funcione sin conexión sin ramas `if (online)` por todos lados.
 */

import { STORE, idbGetAll, idbGet, idbPut, idbPutMany, idbGetAllByIndex } from './idb'
import { enqueue, newId, nowISO } from './outbox'
import { emitDataChanged } from './events'
import type { Habit, HabitInput, Occurrence, OccurrenceStatus, Task, TaskInput } from '@/lib/habits/types'
import { normalizeTime, slotsForDate, deviceTimezone } from '@/lib/habits/frequency'

// ============================================================
// Lecturas — siempre locales, siempre instantáneas
// ============================================================

/** Hábitos vivos (no borrados), en orden de creación. */
export async function listHabits(): Promise<Habit[]> {
  const all = await idbGetAll<Habit>(STORE.habits)
  return all
    .filter((h) => !h.deleted_at)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export async function listTasks(): Promise<Task[]> {
  const all = await idbGetAll<Task>(STORE.tasks)
  return all
    .filter((t) => !t.deleted_at)
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
}

/** Ocurrencias de un rango de fechas (inclusive). */
export async function listOccurrences(from: string, to: string): Promise<Occurrence[]> {
  const rows = await idbGetAllByIndex<Occurrence>(
    STORE.occurrences,
    'scheduled_date',
    IDBKeyRange.bound(from, to)
  )
  return rows.filter((o) => !o.deleted_at)
}

export async function listOccurrencesForDate(date: string): Promise<Occurrence[]> {
  return listOccurrences(date, date)
}

// ============================================================
// Hábitos
// ============================================================

export async function createHabit(input: HabitInput, userId: string): Promise<Habit> {
  const ts = nowISO()
  const habit: Habit = {
    ...input,
    id: newId(),
    user_id: userId,
    timezone: deviceTimezone(),
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  }
  await idbPut(STORE.habits, habit)
  await enqueue('habits', habit.id, 'insert', serializeHabit(habit))
  emitDataChanged('habits')
  return habit
}

export async function updateHabit(id: string, patch: Partial<HabitInput>): Promise<void> {
  const current = await idbGet<Habit>(STORE.habits, id)
  if (!current) throw new Error('Hábito no encontrado')

  const next: Habit = { ...current, ...patch, updated_at: nowISO() }
  await idbPut(STORE.habits, next)
  await enqueue('habits', id, 'update', {
    ...serializePartialHabit(patch),
    updated_at: next.updated_at,
  })

  // Cambiar la frecuencia invalida los slots ya generados de hoy en adelante
  if (patch.frequency_type || patch.frequency_config || patch.start_date || patch.end_date) {
    await pruneStaleOccurrences(next)
  }
  emitDataChanged('habits')
}

export async function deleteHabit(id: string): Promise<void> {
  const current = await idbGet<Habit>(STORE.habits, id)
  if (!current) return
  const ts = nowISO()

  await idbPut(STORE.habits, { ...current, deleted_at: ts, updated_at: ts })
  await enqueue('habits', id, 'delete')

  // Arrastrar las ocurrencias: el FK on delete cascade solo actúa en el servidor
  const occs = await idbGetAllByIndex<Occurrence>(STORE.occurrences, 'habit_id', id)
  const alive = occs.filter((o) => !o.deleted_at)
  if (alive.length) {
    await idbPutMany(
      STORE.occurrences,
      alive.map((o) => ({ ...o, deleted_at: ts, updated_at: ts }))
    )
  }
  emitDataChanged('habits')
  emitDataChanged('occurrences')
}

export async function setHabitActive(id: string, isActive: boolean): Promise<void> {
  await updateHabit(id, { is_active: isActive })
}

// ============================================================
// Ocurrencias
// ============================================================

/**
 * Crea las ocurrencias faltantes de un día para los hábitos activos.
 *
 * Antes esto corría en cada montaje de la pantalla y hacía un upsert a
 * Supabase sin comprobar nada; además incluía hábitos pausados, que seguían
 * acumulando filas. Ahora: solo activos, solo lo que falta, todo local.
 */
export async function ensureOccurrences(
  habits: Habit[],
  date: string,
  userId: string
): Promise<Occurrence[]> {
  const active = habits.filter((h) => h.is_active && !h.deleted_at)
  const existing = await listOccurrencesForDate(date)

  const seen = new Set(
    existing.map((o) => `${o.habit_id}|${normalizeTime(o.scheduled_time)}`)
  )

  const created: Occurrence[] = []
  const ts = nowISO()

  for (const habit of active) {
    for (const slot of slotsForDate(habit, date)) {
      const key = `${habit.id}|${slot.time}`
      if (seen.has(key)) continue
      seen.add(key)

      const occ: Occurrence = {
        id: newId(),
        user_id: userId,
        habit_id: habit.id,
        scheduled_date: slot.date,
        scheduled_time: slot.time,
        status: 'pending',
        completed_at: null,
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
      }
      created.push(occ)
    }
  }

  if (created.length) {
    await idbPutMany(STORE.occurrences, created)
    for (const occ of created) {
      await enqueue('habit_occurrences', occ.id, 'insert', serializeOccurrence(occ))
    }
    emitDataChanged('occurrences')
  }

  return [...existing, ...created].sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time))
}

export async function setOccurrenceStatus(id: string, status: OccurrenceStatus): Promise<void> {
  const current = await idbGet<Occurrence>(STORE.occurrences, id)
  if (!current) throw new Error('Ocurrencia no encontrada')

  const ts = nowISO()
  const completedAt = status === 'completed' ? ts : null
  await idbPut(STORE.occurrences, {
    ...current,
    status,
    completed_at: completedAt,
    updated_at: ts,
  })
  await enqueue('habit_occurrences', id, 'update', {
    status,
    completed_at: completedAt,
    updated_at: ts,
  })
  emitDataChanged('occurrences')
}

/**
 * Borra ocurrencias pendientes futuras que ya no encajan con la frecuencia.
 * Solo toca pendientes: lo ya completado es historial y no se reescribe.
 */
async function pruneStaleOccurrences(habit: Habit): Promise<void> {
  const occs = await idbGetAllByIndex<Occurrence>(STORE.occurrences, 'habit_id', habit.id)
  const today = new Date().toISOString().slice(0, 10)
  const ts = nowISO()
  const stale: Occurrence[] = []

  for (const occ of occs) {
    if (occ.deleted_at || occ.status !== 'pending') continue
    if (occ.scheduled_date < today) continue

    const valid = slotsForDate(habit, occ.scheduled_date).some(
      (s) => s.time === normalizeTime(occ.scheduled_time)
    )
    if (!valid) stale.push({ ...occ, deleted_at: ts, updated_at: ts })
  }

  if (stale.length) {
    await idbPutMany(STORE.occurrences, stale)
    for (const occ of stale) await enqueue('habit_occurrences', occ.id, 'delete')
    emitDataChanged('occurrences')
  }
}

// ============================================================
// Tareas
// ============================================================

export async function createTask(input: TaskInput, userId: string): Promise<Task> {
  const ts = nowISO()
  const task: Task = {
    ...input,
    id: newId(),
    user_id: userId,
    spent_minutes: input.spent_minutes ?? 0,
    sort_order: Date.now(),
    completed_at: input.status === 'completed' ? ts : null,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  }
  await idbPut(STORE.tasks, task)
  await enqueue('tasks', task.id, 'insert', serializeTask(task))
  emitDataChanged('tasks')
  return task
}

export async function updateTask(id: string, patch: Partial<Task>): Promise<void> {
  const current = await idbGet<Task>(STORE.tasks, id)
  if (!current) throw new Error('Tarea no encontrada')

  const next: Task = { ...current, ...patch, updated_at: nowISO() }
  await idbPut(STORE.tasks, next)

  const { id: _id, user_id: _u, created_at: _c, deleted_at: _d, ...rest } = { ...patch } as Task
  await enqueue('tasks', id, 'update', { ...rest, updated_at: next.updated_at })
  emitDataChanged('tasks')
}

export async function deleteTask(id: string): Promise<void> {
  const current = await idbGet<Task>(STORE.tasks, id)
  if (!current) return
  const ts = nowISO()
  await idbPut(STORE.tasks, { ...current, deleted_at: ts, updated_at: ts })
  await enqueue('tasks', id, 'delete')
  emitDataChanged('tasks')
}

export async function setTaskStatus(id: string, status: Task['status']): Promise<void> {
  await updateTask(id, {
    status,
    completed_at: status === 'completed' ? nowISO() : null,
  })
}

/**
 * Suma minutos trabajados.
 *
 * El delta se acumula en el outbox en lugar de enviar el total: si dos
 * temporizadores terminan casi juntos, o si se acumulan minutos sin conexión,
 * los incrementos se suman en vez de pisarse. El sync lo aplica con el RPC
 * atómico `add_task_minutes`.
 */
export async function addTaskMinutes(id: string, minutes: number): Promise<void> {
  if (minutes <= 0) return
  const current = await idbGet<Task>(STORE.tasks, id)
  if (!current) return

  const ts = nowISO()
  await idbPut(STORE.tasks, {
    ...current,
    spent_minutes: current.spent_minutes + minutes,
    updated_at: ts,
  })
  await enqueue('tasks', id, 'update', { __minutes_delta: minutes, updated_at: ts })
  emitDataChanged('tasks')
}

// ============================================================
// Serialización hacia el servidor
// (quita campos que Postgres gestiona y normaliza el JSONB)
// ============================================================

function serializeHabit(h: Habit): Record<string, unknown> {
  return {
    id: h.id,
    user_id: h.user_id,
    name: h.name,
    description: h.description,
    category: h.category,
    icon: h.icon,
    color: h.color,
    frequency_type: h.frequency_type,
    frequency_config: h.frequency_config as unknown as Record<string, unknown>,
    target_type: h.target_type,
    target_value: h.target_value,
    unit: h.unit,
    start_date: h.start_date,
    end_date: h.end_date,
    is_active: h.is_active,
    timezone: h.timezone,
    created_at: h.created_at,
    updated_at: h.updated_at,
  }
}

function serializePartialHabit(p: Partial<HabitInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(p)) {
    if (v !== undefined) out[k] = v
  }
  return out
}

function serializeOccurrence(o: Occurrence): Record<string, unknown> {
  return {
    id: o.id,
    user_id: o.user_id,
    habit_id: o.habit_id,
    scheduled_date: o.scheduled_date,
    scheduled_time: o.scheduled_time,
    status: o.status,
    completed_at: o.completed_at,
    created_at: o.created_at,
    updated_at: o.updated_at,
  }
}

function serializeTask(t: Task): Record<string, unknown> {
  return {
    id: t.id,
    user_id: t.user_id,
    title: t.title,
    description: t.description,
    status: t.status,
    due_date: t.due_date,
    due_time: t.due_time,
    estimated_minutes: t.estimated_minutes,
    spent_minutes: t.spent_minutes,
    sort_order: t.sort_order,
    completed_at: t.completed_at,
    created_at: t.created_at,
    updated_at: t.updated_at,
  }
}
