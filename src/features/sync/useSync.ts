import { useContext } from 'react'
import { SyncContext } from './sync-context'

/** Estado de sincronización. Separado del provider por el fast refresh de React. */
export function useSync() {
  return useContext(SyncContext)
}
