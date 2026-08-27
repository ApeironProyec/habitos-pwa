import { createContext } from 'react'
import type { SyncState } from '@/lib/db/events'

export interface SyncContextValue extends SyncState {
  syncNow: () => void
}

/** Contexto de sincronización. Módulo separado del provider por el fast refresh. */
export const SyncContext = createContext<SyncContextValue>({
  ...({ status: 'idle', pending: 0, lastSyncAt: null, error: null } as SyncState),
  syncNow: () => {},
})
