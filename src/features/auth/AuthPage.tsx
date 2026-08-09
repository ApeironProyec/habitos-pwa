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
  const [registered, setRegistered] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'register') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName || email.split('@')[0] } },
        })
        if (error) throw error
        // Con confirmación de email activada: si no hay sesión, avisar que revise el correo
        if (data.session) {
          navigate('/')
        } else {
          setRegistered(true)
        }
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

  async function handleGoogle() {
    setError(null)
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      })
      if (error) throw error
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error con Google')
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
    'w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-[15px] outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-violet-400 dark:focus:ring-violet-900'

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-700 text-2xl shadow-lg shadow-violet-700/30">
            ✅
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Hábitos</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Crea hábitos, cumple tu día</p>
        </div>

        <div className="mb-4 grid grid-cols-2 rounded-xl bg-zinc-200/70 p-1 text-sm font-medium dark:bg-zinc-800/70">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(null); setResetSent(false); setRegistered(false) }}
            className={cn('rounded-lg py-2 transition', mode === 'login' ? 'bg-white shadow-sm text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400')}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError(null); setResetSent(false); setRegistered(false) }}
            className={cn('rounded-lg py-2 transition', mode === 'register' ? 'bg-white shadow-sm text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400')}
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
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {registered && (
            <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
              ✅ Te enviamos un correo de confirmación. Revisa tu bandeja (y el spam) y luego inicia sesión.
            </p>
          )}
          {resetSent && <p className="text-sm text-emerald-600 dark:text-emerald-400">Revisa tu correo para restablecer la contraseña.</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-violet-700 py-3 text-[15px] font-semibold text-white shadow-lg shadow-violet-700/25 transition active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-500">
          <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
          o
          <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        </div>

        <button
          onClick={handleGoogle}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-zinc-300 bg-white py-3 text-[15px] font-semibold text-zinc-700 transition hover:bg-zinc-50 active:scale-[0.98] disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          <svg className="h-5 w-5" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/>
          </svg>
          Continuar con Google
        </button>

        {mode === 'login' && (
          <button
            type="button"
            onClick={handleReset}
            disabled={loading}
            className="mt-3 w-full text-center text-sm text-violet-700 disabled:opacity-50 dark:text-violet-400"
          >
            ¿Olvidaste tu contraseña?
          </button>
        )}
      </div>
    </div>
  )
}
