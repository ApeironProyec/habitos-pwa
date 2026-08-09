import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'register') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName || email.split('@')[0] } },
        })
        if (error) throw error
        // El trigger handle_new_user crea el profile; navegamos directo
        navigate('/')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        navigate('/')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de autenticación')
    } finally {
      setLoading(false)
    }
  }

  async function handleReset() {
    setError(null)
    setResetSent(false)
    if (!email) {
      setError('Ingresa tu correo primero')
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email)
      if (error) throw error
      setResetSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar recuperación')
    } finally {
      setLoading(false)
    }
  }

  const inputCls =
    'w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-[15px] outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200'

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-700 text-2xl shadow-lg shadow-violet-700/30">
            ✅
          </div>
          <h1 className="text-2xl font-bold text-zinc-900">Hábitos</h1>
          <p className="mt-1 text-sm text-zinc-500">Crea hábitos, cumple tu día</p>
        </div>

        <div className="mb-4 grid grid-cols-2 rounded-xl bg-zinc-200/70 p-1 text-sm font-medium">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(null); setResetSent(false) }}
            className={cn('rounded-lg py-2 transition', mode === 'login' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500')}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError(null); setResetSent(false) }}
            className={cn('rounded-lg py-2 transition', mode === 'register' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500')}
          >
            Registrarme
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'register' && (
            <input
              className={inputCls}
              placeholder="Nombre (opcional)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          )}
          <input
            className={inputCls}
            type="email"
            required
            placeholder="Correo electrónico"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className={inputCls}
            type="password"
            required
            minLength={6}
            placeholder="Contraseña (mín. 6)"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          {resetSent && <p className="text-sm text-emerald-600">Revisa tu correo para restablecer la contraseña.</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-violet-700 py-3 text-[15px] font-semibold text-white shadow-lg shadow-violet-700/25 transition active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </button>
        </form>

        {mode === 'login' && (
          <button
            type="button"
            onClick={handleReset}
            disabled={loading}
            className="mt-3 w-full text-center text-sm text-violet-700 disabled:opacity-50"
          >
            ¿Olvidaste tu contraseña?
          </button>
        )}
      </div>
    </div>
  )
}
