import { useContext } from 'react'
import { ThemeContext } from './theme-context'
import type { ThemeState } from './theme-context'

/** Hook de tema. Separado del provider por el fast refresh de React. */
export function useTheme(): ThemeState {
  return useContext(ThemeContext)
}
