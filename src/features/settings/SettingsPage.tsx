import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Moon, Sun, Monitor, RefreshCw, CloudOff, Check, Database } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/features/auth/useAuth'
import { useTheme } from '@/features/theme/useTheme'
import { useSync } from '@/features/sync/useSync'
import { ConfirmDialog } from '@/components/Modal'
import { wipeLocal } from '@/lib/db/idb'
import { resetCursors } from '@/lib/db/sync'
import { cn } from '@/lib/utils'

export default function SettingsPage() {
  const { user } = useAuth()
  const { theme, setTheme } = useTheme()
  const { status, pending, lastSyncAt, syncNow } = useSync()
  const navigate = useNavigate()
  const [loggingOut, setLoggingOut] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [confirmWipe, setConfirmWipe] = useState(false)

  async function logout() {
    setLoggingOut(true)
    try {
      // Limpiar lo local antes de salir: si no, el siguiente usuario de este
      // dispositivo vería datos que no son suyos hasta el primer sync.
      await wipeLocal()
      await supabase.auth.signOut()
      navigate('/auth', { replace: true })
    } finally {
      setLoggingOut(false)
    }
  }

  /** Descarta la caché local y vuelve a bajar todo. Salida de emergencia si algo se desincroniza. */
  async function rebuildLocal() {
    setConfirmWipe(false)
    await wipeLocal()
    await resetCursors()
    syncNow()
    navigate('/', { replace: true })
  }

  async function sendReset() {
    if (!user?.email) return
    setResetSent(false)
    await supabase.auth.resetPasswordForEmail(user.email)
    setResetSent(true)
  }

  const options: { value: 'light' | 'dark' | 'system'; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Claro', icon: Sun },
    { value: 'dark', label: 'Oscuro', icon: Moon },
    { value: 'system', label: 'Sistema', icon: Monitor },
  ]

  const syncLabel = {
    idle: pending > 0 ? `${pending} cambio${pending === 1 ? '' : 's'} por subir` : 'Todo sincronizado',
    syncing: 'Sincronizando…',
    offline: 'Sin conexión',
    error: 'Error al sincronizar',
  }[status]

  const SyncIcon = status === 'offline' ? CloudOff : status === 'idle' && pending === 0 ? Check : RefreshCw

  return (
    <div className="space-y-5">
      <header className="fade-up">
        <h1 className="text-[28px] font-bold tracking-tight text-[var(--text-primary)]">Ajustes</h1>
        <p className="text-sm text-[var(--text-secondary)]">Cuenta y preferencias</p>
      </header>

      <section className="glass fade-up stagger p-4" style={{ '--i': 0 } as React.CSSProperties}>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-lg font-bold text-violet-600 dark:text-violet-400">
            {(user?.email ?? '?')[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-[var(--text-primary)]">
              {(user?.user_metadata?.display_name as string | undefined) ?? user?.email}
            </p>
            <p className="truncate text-sm text-[var(--text-secondary)]">{user?.email}</p>
          </div>
        </div>
      </section>

      {/* Estado de sincronización: en offline-first el usuario necesita saber si sus datos están a salvo */}
      <section className="glass fade-up stagger p-4" style={{ '--i': 1 } as React.CSSProperties}>
        <p className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Sincronización</p>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <SyncIcon
              className={cn(
                'h-5 w-5 shrink-0',
                status === 'offline'
                  ? 'text-amber-500'
                  : status === 'error'
                    ? 'text-red-500'
                    : pending === 0
                      ? 'text-emerald-500'
                      : 'text-violet-500',
                status === 'syncing' && 'spin-slow'
              )}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="truncate text-[15px] text-[var(--text-primary)]">{syncLabel}</p>
              {lastSyncAt && (
                <p className="text-xs text-[var(--text-secondary)]">
                  Última vez:{' '}
                  {new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(
                    new Date(lastSyncAt)
                  )}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={syncNow}
            disabled={status === 'syncing' || status === 'offline'}
            className="tap shrink-0 rounded-xl bg-black/5 px-3.5 py-2 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-40 dark:bg-white/10"
          >
            Sincronizar
          </button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">
          La app guarda todo en tu dispositivo y lo sube cuando hay internet. Puedes usarla sin conexión sin
          perder nada.
        </p>
      </section>

      <section className="glass fade-up stagger p-4" style={{ '--i': 2 } as React.CSSProperties}>
        <p className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Apariencia</p>
        <div className="grid grid-cols-3 gap-2">
          {options.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              aria-pressed={theme === value}
              className={cn(
                'tap flex flex-col items-center gap-1.5 rounded-xl border py-3 text-sm font-medium',
                theme === value
                  ? 'border-violet-500 bg-violet-500/15 text-violet-700 dark:text-violet-300'
                  : 'border-[var(--card-border)] text-[var(--text-secondary)]'
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="glass fade-up stagger space-y-2 p-4" style={{ '--i': 3 } as React.CSSProperties}>
        <button
          onClick={sendReset}
          className="tap w-full rounded-xl border border-[var(--card-border)] px-4 py-3 text-left text-sm font-medium text-[var(--text-primary)]"
        >
          Cambiar contraseña
        </button>
        {resetSent && (
          <p className="fade-in px-1 text-sm text-emerald-600 dark:text-emerald-400">
            Revisa tu correo para restablecerla.
          </p>
        )}

        <button
          onClick={() => setConfirmWipe(true)}
          className="tap flex w-full items-center gap-2 rounded-xl border border-[var(--card-border)] px-4 py-3 text-left text-sm font-medium text-[var(--text-primary)]"
        >
          <Database className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden="true" />
          Reconstruir datos locales
        </button>

        <button
          onClick={() => setConfirmLogout(true)}
          disabled={loggingOut}
          className="tap w-full rounded-xl bg-red-500/10 px-4 py-3 text-left text-sm font-semibold text-red-600 disabled:opacity-60 dark:text-red-400"
        >
          {loggingOut ? 'Saliendo…' : 'Cerrar sesión'}
        </button>
      </section>

      <p className="px-1 text-center text-xs text-[var(--text-secondary)]">Hábitos · PWA · v0.3.0</p>

      {confirmLogout && (
        <ConfirmDialog
          title="Cerrar sesión"
          message={
            pending > 0
              ? `Tienes ${pending} cambio${pending === 1 ? '' : 's'} sin subir. Si cierras sesión ahora se perderán. ¿Continuar?`
              : 'Se borrarán los datos guardados en este dispositivo. Volverán a descargarse al iniciar sesión.'
          }
          confirmLabel="Cerrar sesión"
          onConfirm={() => {
            setConfirmLogout(false)
            void logout()
          }}
          onCancel={() => setConfirmLogout(false)}
        />
      )}

      {confirmWipe && (
        <ConfirmDialog
          title="Reconstruir datos locales"
          message={
            pending > 0
              ? `Hay ${pending} cambio${pending === 1 ? '' : 's'} sin subir que se perderán. Se descargará todo de nuevo desde el servidor.`
              : 'Se borra la copia local y se descarga todo otra vez desde el servidor. Útil si algo se ve desincronizado.'
          }
          confirmLabel="Reconstruir"
          onConfirm={rebuildLocal}
          onCancel={() => setConfirmWipe(false)}
        />
      )}
    </div>
  )
}
