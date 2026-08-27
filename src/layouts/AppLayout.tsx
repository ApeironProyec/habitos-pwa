import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Home, ListChecks, CheckSquare, BarChart3, Settings } from 'lucide-react'
import { SyncBadge } from '@/features/sync/SyncBadge'
import { cn } from '@/lib/utils'

const nav = [
  { to: '/', label: 'Hoy', icon: Home, end: true },
  { to: '/habits', label: 'Hábitos', icon: ListChecks },
  { to: '/tasks', label: 'Tareas', icon: CheckSquare },
  { to: '/stats', label: 'Stats', icon: BarChart3 },
  { to: '/settings', label: 'Ajustes', icon: Settings },
]

export default function AppLayout() {
  const { pathname } = useLocation()

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      {/* El indicador de sync flota arriba: visible sin robar espacio al contenido */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-20 flex justify-center pt-3">
        <div className="pointer-events-auto">
          <SyncBadge />
        </div>
      </div>

      {/*
        `key={pathname}` remonta el contenido en cada navegación para que la
        animación de entrada se reproduzca. Es barato: las pantallas ya leen
        de IndexedDB, no de la red.
      */}
      <main key={pathname} className="fade-in safe-top flex-1 px-4 pb-28 pt-4">
        <Outlet />
      </main>

      <nav
        className="safe-bottom fixed inset-x-0 bottom-0 z-10 border-t border-[var(--card-border)] bg-[var(--app-bg)]/90 backdrop-blur-xl"
        aria-label="Navegación principal"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'tap relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium',
                  isActive ? 'text-violet-600 dark:text-violet-400' : 'text-[var(--text-secondary)]'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn('t-transform h-5 w-5', isActive && 'scale-110')}
                    aria-hidden="true"
                  />
                  <span>{label}</span>
                  <span
                    className={cn(
                      't-fast absolute bottom-1 h-0.5 rounded-full bg-violet-600 dark:bg-violet-400',
                      isActive ? 'w-8 opacity-100' : 'w-0 opacity-0'
                    )}
                    aria-hidden="true"
                  />
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
