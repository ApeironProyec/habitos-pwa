import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/features/auth/AuthContext'

export default function SettingsPage() {
  const { user } = useAuth()
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

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900">Ajustes</h1>
        <p className="text-sm text-zinc-500">Cuenta y preferencias</p>
      </header>

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-lg font-bold text-violet-700">
            {(user?.email ?? '?')[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-zinc-900">{user?.user_metadata?.display_name ?? user?.email}</p>
            <p className="truncate text-sm text-zinc-400">{user?.email}</p>
          </div>
        </div>
      </section>

      <section className="space-y-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
        <button
          onClick={sendReset}
          className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-left text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          Cambiar contraseña
        </button>
        {resetSent && <p className="px-1 text-sm text-emerald-600">Revisa tu correo para restablecerla.</p>}
        <button
          onClick={logout}
          disabled={loggingOut}
          className="w-full rounded-xl bg-red-50 px-4 py-3 text-left text-sm font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-60"
        >
          {loggingOut ? 'Saliendo…' : 'Cerrar sesión'}
        </button>
      </section>

      <p className="px-1 text-center text-xs text-zinc-400">
        Hábitos · PWA · v0.1.0
      </p>
    </div>
  )
}
