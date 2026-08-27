import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

export interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
}

/**
 * Contexto de sesión. En un módulo aparte del provider para que el fast
 * refresh trate AuthContext.tsx como archivo puramente de componentes.
 */
export const AuthContext = createContext<AuthState>({ user: null, session: null, loading: true })
