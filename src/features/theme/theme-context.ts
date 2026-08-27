import { createContext } from 'react'

export type Theme = 'light' | 'dark' | 'system'

export interface ThemeState {
  theme: Theme
  resolved: 'light' | 'dark'
  setTheme: (t: Theme) => void
  toggle: () => void
}

/** Contexto de tema. Módulo separado del provider por el fast refresh. */
export const ThemeContext = createContext<ThemeState>({
  theme: 'system',
  resolved: 'light',
  setTheme: () => {},
  toggle: () => {},
})
