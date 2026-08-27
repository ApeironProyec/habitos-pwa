import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '@/features/auth/useAuth'
import { SyncContext } from './sync-context'
import { getSyncState, onSyncStateChange, setSyncState, type SyncState } from '@/lib/db/events'
import { sync, startSync, resetCursors, localOwner, setLocalOwner } from '@/lib/db/sync'
import { pendingCount } from '@/lib/db/outbox'
import { wipeLocal } from '@/lib/db/idb'
import { onDataChanged } from '@/lib/db/events'


export function SyncProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const [state, setState] = useState<SyncState>(getSyncState)

  useEffect(() => onSyncStateChange(setState), [])

  useEffect(() => {
    if (loading) return

    let cancelled = false

    ;(async () => {
      if (!user) return

      // Cambio de cuenta en el mismo dispositivo: los datos locales son de
      // otro usuario y no deben mezclarse ni quedar visibles.
      const owner = await localOwner()
      if (owner && owner !== user.id) {
        await wipeLocal()
        await resetCursors()
      }
      if (cancelled) return
      await setLocalOwner(user.id)

      setSyncState({ pending: await pendingCount() })
      startSync()
    })()

    return () => {
      cancelled = true
    }
  }, [user, loading])

  /**
   * Push inmediato tras cada mutación local (con debounce de 1.5s).
   *
   * Antes las escrituras solo subían en el ciclo de 60s o al cambiar de
   * pestaña: el hábito quedaba minutos en el outbox aunque hubiera red.
   * El debounce agrupa ráfagas (marcar varios hábitos seguidos = 1 sync).
   */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!user) return
    return onDataChanged(() => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => void sync(), 1500)
    })
  }, [user])

  return (
    <SyncContext.Provider value={{ ...state, syncNow: () => void sync() }}>
      {children}
    </SyncContext.Provider>
  )
}
