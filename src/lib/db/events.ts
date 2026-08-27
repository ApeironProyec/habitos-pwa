/**
 * Bus de eventos local.
 *
 * Cuando el repo o el sync tocan datos, las pantallas montadas deben
 * refrescar. Sin esto haría falta refetchear en cada navegación (que era
 * el comportamiento anterior: `useHabits` corría de nuevo en cada montaje).
 */

export type DataScope = 'habits' | 'occurrences' | 'tasks' | 'taskLists'

type Listener = (scope: DataScope) => void

const listeners = new Set<Listener>()

export function onDataChanged(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function emitDataChanged(scope: DataScope): void {
  for (const fn of listeners) {
    try {
      fn(scope)
    } catch {
      /* un listener roto no debe tumbar a los demás */
    }
  }
}

// ---------- Estado del sync (para el indicador de la UI) ----------

export interface SyncState {
  status: 'idle' | 'syncing' | 'offline' | 'error'
  pending: number
  lastSyncAt: string | null
  error: string | null
}

let syncState: SyncState = {
  status: navigator.onLine === false ? 'offline' : 'idle',
  pending: 0,
  lastSyncAt: null,
  error: null,
}

const syncListeners = new Set<(s: SyncState) => void>()

export function getSyncState(): SyncState {
  return syncState
}

export function onSyncStateChange(fn: (s: SyncState) => void): () => void {
  syncListeners.add(fn)
  return () => syncListeners.delete(fn)
}

export function setSyncState(patch: Partial<SyncState>): void {
  syncState = { ...syncState, ...patch }
  for (const fn of syncListeners) {
    try {
      fn(syncState)
    } catch {
      /* ignorar */
    }
  }
}
