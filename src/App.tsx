import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/features/auth/AuthContext'
import { ThemeProvider } from '@/features/theme/ThemeProvider'
import AppLayout from '@/layouts/AppLayout'

// Code-splitting: cada pantalla se descarga solo cuando se visita.
const AuthPage = lazy(() => import('@/features/auth/AuthPage'))
const TodayPage = lazy(() => import('@/features/dashboard/TodayPage'))
const HabitsPage = lazy(() => import('@/features/habits/HabitsPage'))
const TasksPage = lazy(() => import('@/features/tasks/TasksPage'))
const StatisticsPage = lazy(() => import('@/features/statistics/StatisticsPage'))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'))

function Loading() {
  return <div className="flex min-h-dvh items-center justify-center text-sm text-[var(--text-secondary)]">Cargando…</div>
}

function Shell() {
  const { user, loading } = useAuth()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/auth" replace />
  return <AppLayout />
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route element={<Shell />}>
              <Route path="/" element={<TodayPage />} />
              <Route path="/habits" element={<HabitsPage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/stats" element={<StatisticsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </ThemeProvider>
  )
}
