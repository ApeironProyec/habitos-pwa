import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ThemeContext, type Theme } from './theme-context'

function resolveSystem(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const STORAGE_KEY = 'habitos-theme'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'system'
    } catch {
      return 'system'
    }
  })
  const [system, setSystem] = useState<'light' | 'dark'>(resolveSystem)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => setSystem(resolveSystem())
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const resolved = theme === 'system' ? system : theme

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark')
    // Alinea la barra de estado del sistema con el tema en la PWA instalada
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#000000' : '#f5f5f7')
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* modo privado sin storage */
    }
  }, [theme, resolved])

  const setTheme = useCallback((t: Theme) => setThemeState(t), [])
  const toggle = useCallback(() => setThemeState((p) => (p === 'dark' ? 'light' : 'dark')), [])

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}
