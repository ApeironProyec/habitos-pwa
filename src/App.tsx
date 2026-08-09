import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/features/auth/AuthContext'
import AppLayout from '@/layouts/AppLayout'
import TodayPage from '@/features/dashboard/TodayPage'
import HabitsPage from '@/features/habits/HabitsPage'
import StatisticsPage from '@/features/statistics/StatisticsPage'
import SettingsPage from '@/features/settings/SettingsPage'
import AuthPage from '@/features/auth/AuthPage'

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-zinc-500">Cargando…</div>
    )
  }
  if (!user) return <Navigate to="/auth" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route
          path="/"
          element={
            <Protected>
              <AppLayout />
            </Protected>
          }
        >
          <Route index element={<TodayPage />} />
          <Route path="habits" element={<HabitsPage />} />
          <Route path="stats" element={<StatisticsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
