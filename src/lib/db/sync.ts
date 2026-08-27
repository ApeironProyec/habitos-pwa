/**
 * Motor de sincronización.
 *
 * Ciclo: push (drenar outbox) → pull (traer cambios remotos) → notificar UI.
 *
 * Resolución de conflictos: last-write-wins por `updated_at`. Es lo correcto
 * para esta app — un solo usuario en varios dispositivos, sin edición
 * concurrente real. La excepción son los minutos trabajados, que se envían
 * como delta y se suman en el servidor con un RPC atómico en vez de
 * sobrescribir el total.
 *
 * Nunca lanza hacia arriba: si falla, la mutación se queda en el outbox con
 * su contador de intentos y se reintenta después. La app sigue usable.
 */

import { supabase } from '@/lib/supabase/client'
import { STORE, idbPutMany, metaGet, metaSet, idbGet, idbPut } from './idb'
import {
  MAX_ATTEMPTS,
  markFailed,
  pendingCount,
  pendingEntries,
  removeEntries,
  type OutboxEntry,
} from './outbox'
import { emitDataChanged, setSyncState } from './events'
import type { Habit, Occurrence, Task } from '@/lib/habits/types'

const CURSOR_KEY = {
  habits: 'cursor:habits',
  habit_occurrences: 'cursor:habit_occurrences',
  tasks: 'cursor:tasks',
} as const

/** Fecha muy anterior a cualquier dato: primer pull trae todo. */
const EPOCH = '1970-01-01T00:00:00.000Z'

let syncing = false
let queuedRun = false

/** ¿Hay red? `navigator.onLine` da falsos positivos, pero los negativos son fiables. */
export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

/**
 * Ejecuta un ciclo completo. Reentrante: si ya hay uno corriendo, encola
 * exactamente una repetición al final en lugar de solaparse.
 */
export async function sync(): Promise<void> {
  if (syncing) {
    queuedRun = true
    return
  }

  if (!isOnline()) {
    setSyncState({ status: 'offline', pending: await pendingCount() })
    return
  }

  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user?.id
  if (!userId) {
    setSyncState({ status: 'idle', pending: await pendingCount() })
    return
  }

  syncing = true
  setSyncState({ status: 'syncing', error: null })

  try {
    await pushOutbox()
    await pullChanges(userId)
    setSyncState({
      status: 'idle',
      pending: await pendingCount(),
      lastSyncAt: new Date().toISOString(),
      error: null,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error de sincronización'
    setSyncState({
      status: isOnline() ? 'error' : 'offline',
      pending: await pendingCount(),
      error: msg,
    })
  } finally {
    syncing = false
    if (queuedRun) {
      queuedRun = false
      void sync()
    }
  }
}

// ============================================================
// PUSH — subir mutaciones locales
// ============================================================

async function pushOutbox(): Promise<void> {
  const entries = await pendingEntries()
  if (entries.length === 0) return

  const done: number[] = []

  for (const entry of entries) {
    if (entry.attempts >= MAX_ATTEMPTS) {
      // Mutación envenenada: la descartamos para no bloquear la cola entera.
      // El pull siguiente devolverá el estado real del servidor.
      done.push(entry.seq!)
      continue
    }

    try {
      await pushEntry(entry)
      done.push(entry.seq!)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await markFailed(entry, msg)
      // Sin red: cortar el bucle, no quemar intentos de toda la cola
      if (!isOnline()) break
    }
  }

  if (done.length) await removeEntries(done)
}

/**
 * El outbox almacena payloads como `Record<string, unknown>` porque es una
 * cola genérica sobre tres tablas distintas. Los helpers de postgrest-js
 * exigen el tipo exacto de fila, así que la conversión se concentra acá:
 * un solo punto, en lugar de castings repartidos por todo el archivo.
 *
 * La forma del payload sí está garantizada: la construyen las funciones
 * `serialize*` de repo.ts a partir de tipos concretos.
 */
type AnyRow = never

function asRow(payload: Record<string, unknown>): AnyRow {
  return payload as unknown as AnyRow
}

async function pushEntry(entry: OutboxEntry): Promise<void> {
  const { table, row_id, op, payload } = entry

  if (op === 'delete') {
    // Soft delete: el registro sigue existiendo para que otros dispositivos
    // se enteren de que se borró.
    const { error } = await supabase
      .from(table)
      .update(asRow({ deleted_at: new Date().toISOString() }))
      .eq('id', row_id)
    if (error) throw new Error(error.message)
    return
  }

  // Los minutos viajan como delta, no como total
  const { __minutes_delta, ...rest } = payload as Record<string, unknown> & {
    __minutes_delta?: number
  }

  if (typeof __minutes_delta === 'number' && __minutes_delta > 0) {
    const { error } = await supabase.rpc('add_task_minutes', {
      p_task_id: row_id,
      p_minutes: __minutes_delta,
    })
    if (error) throw new Error(error.message)
  }

  if (op === 'insert') {
    // upsert en vez de insert: si un intento anterior llegó al servidor pero
    // la respuesta se perdió, reintentar no debe fallar con clave duplicada
    const { error } = await supabase
      .from(table)
      .upsert(asRow({ ...rest, id: row_id }), { onConflict: 'id' })
    if (error) throw new Error(error.message)
    return
  }

  // update
  if (Object.keys(rest).length === 0) return
  const { error } = await supabase.from(table).update(asRow(rest)).eq('id', row_id)
  if (error) throw new Error(error.message)
}

// ============================================================
// PULL — traer cambios remotos desde el último cursor
// ============================================================

async function pullChanges(userId: string): Promise<void> {
  const [habits, occurrences, tasks] = await Promise.all([
    pullTable<Habit>('habits', userId),
    pullTable<Occurrence>('habit_occurrences', userId),
    pullTable<Task>('tasks', userId),
  ])

  if (habits.length) {
    await mergeRows(STORE.habits, habits)
    emitDataChanged('habits')
  }
  if (occurrences.length) {
    await mergeRows(STORE.occurrences, occurrences)
    emitDataChanged('occurrences')
  }
  if (tasks.length) {
    await mergeRows(STORE.tasks, tasks)
    emitDataChanged('tasks')
  }
}

const PAGE_SIZE = 500

async function pullTable<T extends { id: string; updated_at: string }>(
  table: keyof typeof CURSOR_KEY,
  userId: string
): Promise<T[]> {
  const cursor = (await metaGet<string>(CURSOR_KEY[table])) ?? EPOCH
  const rows: T[] = []
  let from = cursor

  // Paginado por updated_at para no traer todo de golpe en el primer sync
  for (let page = 0; page < 20; page++) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .gt('updated_at', from)
      .order('updated_at', { ascending: true })
      .limit(PAGE_SIZE)

    if (error) throw new Error(`pull ${table}: ${error.message}`)
    const batch = (data ?? []) as unknown as T[]
    if (batch.length === 0) break

    rows.push(...batch)
    from = batch[batch.length - 1].updated_at
    if (batch.length < PAGE_SIZE) break
  }

  if (rows.length) await metaSet(CURSOR_KEY[table], from)
  return rows
}

/**
 * Funde filas remotas con las locales.
 *
 * Si la fila local tiene un `updated_at` más nuevo, gana: es un cambio local
 * que todavía no subió y no queremos pisarlo con una versión vieja del
 * servidor. En cualquier otro caso manda el servidor.
 */
async function mergeRows<T extends { id: string; updated_at: string }>(
  store: typeof STORE.habits | typeof STORE.occurrences | typeof STORE.tasks,
  remote: T[]
): Promise<void> {
  const toWrite: T[] = []

  for (const row of remote) {
    const local = await idbGet<T>(store, row.id)
    if (!local || local.updated_at <= row.updated_at) {
      toWrite.push(normalizeRow(row))
    }
  }

  if (toWrite.length) await idbPutMany(store, toWrite)
}

/** Postgres devuelve `time` como 'HH:mm:ss'; garantizamos el formato. */
function normalizeRow<T extends Record<string, unknown>>(row: T): T {
  if (typeof row.scheduled_time === 'string') {
    const parts = row.scheduled_time.split(':')
    return {
      ...row,
      scheduled_time: `${(parts[0] ?? '00').padStart(2, '0')}:${(parts[1] ?? '00').padStart(2, '0')}:${(parts[2] ?? '00').padStart(2, '0')}`,
    }
  }
  return row
}

// ============================================================
// Arranque y disparadores
// ============================================================

let started = false
let intervalId: ReturnType<typeof setInterval> | null = null

/** Engancha los disparadores de sync. Idempotente. */
export function startSync(): void {
  if (started) return
  started = true

  const trigger = () => void sync()

  window.addEventListener('online', () => {
    setSyncState({ status: 'idle' })
    trigger()
  })

  window.addEventListener('offline', () => {
    setSyncState({ status: 'offline' })
  })

  // Al volver a la app: puede haber cambios de otro dispositivo
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') trigger()
  })

  // Red de seguridad para sesiones largas con la app abierta
  intervalId = setInterval(() => {
    if (document.visibilityState === 'visible') trigger()
  }, 60_000)

  trigger()
}

export function stopSync(): void {
  if (intervalId) clearInterval(intervalId)
  intervalId = null
  started = false
}

/** Reinicia los cursores: fuerza que el próximo pull traiga todo. */
export async function resetCursors(): Promise<void> {
  await Promise.all([
    metaSet(CURSOR_KEY.habits, EPOCH),
    metaSet(CURSOR_KEY.habit_occurrences, EPOCH),
    metaSet(CURSOR_KEY.tasks, EPOCH),
  ])
}

/** Marca de qué usuario son los datos locales, para detectar cambio de cuenta. */
export async function localOwner(): Promise<string | undefined> {
  return metaGet<string>('owner')
}

export async function setLocalOwner(userId: string): Promise<void> {
  await idbPut(STORE.meta, { key: 'owner', value: userId })
}
