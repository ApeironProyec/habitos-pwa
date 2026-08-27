/**
 * Outbox: cola durable de mutaciones locales pendientes de subir.
 *
 * Toda escritura de la app va primero a IndexedDB (lectura instantánea,
 * funciona sin red) y además deja una entrada acá. El motor de sync la
 * drena en orden cuando hay conexión.
 *
 * Decisiones de diseño:
 * - Los IDs son UUID v4 generados en el cliente. El servidor los acepta tal
 *   cual, así que una fila creada offline conserva su id al subir y no hay
 *   que reconciliar referencias.
 * - `seq` es autoincremental: garantiza orden causal (crear antes de editar).
 * - Los updates sobre una fila que aún no subió se colapsan en la mutación
 *   pendiente. Marcar un hábito 5 veces offline sube UNA operación, no 5.
 * - Los borrados son soft (`deleted_at`) para que se propaguen entre
 *   dispositivos; un delete de una fila no sincronizada limpia la cola.
 */

import { STORE, idbAdd, idbGetAll, idbDeleteMany, idbPut, idbGetAllByIndex } from './idb'

export type OutboxOp = 'insert' | 'update' | 'delete'
export type SyncTable = 'habits' | 'habit_occurrences' | 'tasks' | 'task_lists'

export interface OutboxEntry {
  seq?: number
  table: SyncTable
  row_id: string
  op: OutboxOp
  /** Payload completo para insert; parcial para update. Vacío para delete. */
  payload: Record<string, unknown>
  created_at: string
  /** Intentos fallidos; alimenta el backoff y evita bucles infinitos. */
  attempts: number
  last_error?: string
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback para WebViews viejas sin randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function nowISO(): string {
  return new Date().toISOString()
}

/**
 * Registra una mutación, colapsándola con las pendientes de la misma fila.
 *
 * Tabla de colapso:
 *   insert + update → insert con payload fusionado
 *   insert + delete → se elimina todo (la fila nunca existió para el servidor)
 *   update + update → update con payload fusionado
 *   * + delete      → delete (los updates previos son irrelevantes)
 */
export async function enqueue(
  table: SyncTable,
  rowId: string,
  op: OutboxOp,
  payload: Record<string, unknown> = {}
): Promise<void> {
  const pending = await idbGetAllByIndex<OutboxEntry>(STORE.outbox, 'entity', [table, rowId])

  if (pending.length === 0) {
    await idbAdd<OutboxEntry>(STORE.outbox, {
      table,
      row_id: rowId,
      op,
      payload,
      created_at: nowISO(),
      attempts: 0,
    })
    return
  }

  const seqs = pending.map((p) => p.seq!).filter((s): s is number => typeof s === 'number')
  const hasInsert = pending.some((p) => p.op === 'insert')
  const merged = pending.reduce<Record<string, unknown>>((acc, p) => ({ ...acc, ...p.payload }), {})

  if (op === 'delete') {
    await idbDeleteMany(STORE.outbox, seqs)
    // Si nunca llegó al servidor, no hay nada que borrar allá
    if (hasInsert) return
    await idbAdd<OutboxEntry>(STORE.outbox, {
      table,
      row_id: rowId,
      op: 'delete',
      payload: {},
      created_at: nowISO(),
      attempts: 0,
    })
    return
  }

  // insert u update: colapsar en una sola entrada
  const keepSeq = Math.min(...seqs)
  const toDrop = seqs.filter((s) => s !== keepSeq)
  if (toDrop.length) await idbDeleteMany(STORE.outbox, toDrop)

  await idbPut<OutboxEntry>(STORE.outbox, {
    seq: keepSeq,
    table,
    row_id: rowId,
    op: hasInsert ? 'insert' : op,
    payload: { ...merged, ...payload },
    created_at: pending[0].created_at,
    attempts: 0,
  })
}

/** Entradas pendientes en orden causal. */
export async function pendingEntries(): Promise<OutboxEntry[]> {
  const all = await idbGetAll<OutboxEntry>(STORE.outbox)
  return all.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
}

export async function pendingCount(): Promise<number> {
  return (await idbGetAll<OutboxEntry>(STORE.outbox)).length
}

export async function removeEntries(seqs: number[]): Promise<void> {
  await idbDeleteMany(STORE.outbox, seqs)
}

/** Marca un fallo para aplicar backoff sin perder la mutación. */
export async function markFailed(entry: OutboxEntry, error: string): Promise<void> {
  if (entry.seq === undefined) return
  await idbPut<OutboxEntry>(STORE.outbox, {
    ...entry,
    attempts: entry.attempts + 1,
    last_error: error.slice(0, 300),
  })
}

/** Límite de reintentos antes de considerar una mutación envenenada. */
export const MAX_ATTEMPTS = 6
