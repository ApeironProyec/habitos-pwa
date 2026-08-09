import { NavLink, Outlet } from 'react-router-dom'
import { Home, ListChecks, BarChart3, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const nav = [
  { to: '/', label: 'Hoy', icon: Home, end: true },
  { to: '/habits', label: 'Hábitos', icon: ListChecks },
  { to: '/stats', label: 'Estadísticas', icon: BarChart3 },
  { to: '/settings', label: 'Ajustes', icon: Settings },
]

export default function AppLayout() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <main className="flex-1 px-4 pb-24 pt-4">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto grid max-w-lg grid-cols-4">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors',
                  isActive ? 'text-violet-700' : 'text-zinc-400'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn('h-5 w-5', isActive && 'text-violet-700')} />
                  <span>{label}</span>
                  {isActive && <span className="h-0.5 w-8 rounded-full bg-violet-700" />}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
