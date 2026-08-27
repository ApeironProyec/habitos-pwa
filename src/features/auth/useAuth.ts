import { useContext } from 'react'
import { AuthContext } from './auth-context'
import type { AuthState } from './auth-context'

/**
 * Hook de sesión.
 *
 * Vive aparte del provider porque un archivo que exporta componentes y hooks
 * a la vez rompe el fast refresh de React.
 */
export function useAuth(): AuthState {
  return useContext(AuthContext)
}
