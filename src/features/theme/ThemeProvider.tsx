import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type Theme = 'light' | 'dark' | 'system'

interface ThemeState {
  theme: Theme
  resolved: 'light' | 'dark'
  setTheme: (t: Theme) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeState>({
  theme: 'system',
  resolved: 'light',
  setTheme: () => {},
  toggle: () => {},
})

function resolveSystem(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('habitos-theme') as Theme | null
    return saved ?? 'system'
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
    localStorage.setItem('habitos-theme', theme)
  }, [theme, resolved])

  function setTheme(t: Theme) {
    setThemeState(t)
  }

  function toggle() {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
