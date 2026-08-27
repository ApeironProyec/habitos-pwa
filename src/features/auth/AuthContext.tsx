import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { AuthContext, type AuthState } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, session: null, loading: true })

  useEffect(() => {
    let mounted = true

    // getSession lee de localStorage: sin conexión el usuario sigue dentro
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return
        setState({ user: data.session?.user ?? null, session: data.session ?? null, loading: false })
      })
      .catch(() => {
        // Sin red y sin sesión guardada: no dejar la app colgada en "cargando"
        if (mounted) setState({ user: null, session: null, loading: false })
      })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setState({ user: session?.user ?? null, session: session ?? null, loading: false })
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}
