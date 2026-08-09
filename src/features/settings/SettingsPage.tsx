import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Moon, Sun, Monitor } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/features/auth/AuthContext'
import { useTheme } from '@/features/theme/ThemeProvider'
import { cn } from '@/lib/utils'

export default function SettingsPage() {
  const { user } = useAuth()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const [loggingOut, setLoggingOut] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  async function logout() {
    setLoggingOut(true)
    await supabase.auth.signOut()
    navigate('/auth')
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

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Ajustes</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Cuenta y preferencias</p>
      </header>

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-100 dark:bg-zinc-900 dark:ring-zinc-800">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-lg font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-400">
            {(user?.email ?? '?')[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-zinc-900 dark:text-zinc-100">
              {user?.user_metadata?.display_name ?? user?.email}
            </p>
            <p className="truncate text-sm text-zinc-400 dark:text-zinc-500">{user?.email}</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-100 dark:bg-zinc-900 dark:ring-zinc-800">
        <p className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200">Apariencia</p>
        <div className="grid grid-cols-3 gap-2">
          {options.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-xl border py-3 text-sm font-medium transition',
                theme === value
                  ? 'border-violet-600 bg-violet-50 text-violet-800 dark:border-violet-400 dark:bg-violet-950/50 dark:text-violet-300'
                  : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800'
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-100 dark:bg-zinc-900 dark:ring-zinc-800">
        <button
          onClick={sendReset}
          className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-left text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Cambiar contraseña
        </button>
        {resetSent && <p className="px-1 text-sm text-emerald-600 dark:text-emerald-400">Revisa tu correo para restablecerla.</p>}
        <button
          onClick={logout}
          disabled={loggingOut}
          className="w-full rounded-xl bg-red-50 px-4 py-3 text-left text-sm font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-60 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/70"
        >
          {loggingOut ? 'Saliendo…' : 'Cerrar sesión'}
        </button>
      </section>

      <p className="px-1 text-center text-xs text-zinc-400 dark:text-zinc-600">Hábitos · PWA · v0.2.0</p>
    </div>
  )
}
