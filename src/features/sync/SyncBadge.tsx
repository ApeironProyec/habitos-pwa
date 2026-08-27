import { CloudOff, RefreshCw, Check, AlertCircle } from 'lucide-react'
import { useSync } from '@/features/sync/useSync'
import { cn } from '@/lib/utils'

/**
 * Indicador de estado de sincronización.
 *
 * En una app offline-first el usuario necesita saber si lo que ve ya está a
 * salvo en el servidor. Sin esto, "guardé sin internet" se siente como
 * "perdí mi cambio". Se oculta cuando todo está sincronizado y no hay nada
 * que reportar: el estado normal no merece ruido visual.
 */
export function SyncBadge() {
  const { status, pending, syncNow } = useSync()

  const hidden = status === 'idle' && pending === 0
  if (hidden) return null

  const config = {
    offline: {
      icon: CloudOff,
      label: pending > 0 ? `Sin conexión · ${pending} por subir` : 'Sin conexión',
      cls: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
      spin: false,
    },
    syncing: {
      icon: RefreshCw,
      label: 'Sincronizando…',
      cls: 'text-violet-600 dark:text-violet-400 bg-violet-500/10',
      spin: true,
    },
    error: {
      icon: AlertCircle,
      label: 'Error al sincronizar',
      cls: 'text-red-600 dark:text-red-400 bg-red-500/10',
      spin: false,
    },
    idle: {
      icon: Check,
      label: pending > 0 ? `${pending} cambio${pending === 1 ? '' : 's'} por subir` : 'Al día',
      cls: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
      spin: false,
    },
  }[status]

  const Icon = config.icon

  return (
    <button
      onClick={syncNow}
      disabled={status === 'syncing'}
      className={cn(
        'fade-in tap flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold',
        config.cls
      )}
      title={status === 'error' ? 'Toca para reintentar' : config.label}
      aria-live="polite"
    >
      <Icon className={cn('h-3.5 w-3.5', config.spin && 'spin-slow')} aria-hidden="true" />
      <span>{config.label}</span>
    </button>
  )
}
