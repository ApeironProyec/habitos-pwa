import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/features/auth/AuthContext'
import type { Task, TaskInput } from '@/lib/habits/types'

export function useTasks() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      setTasks((data as Task[]) ?? [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando tareas')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const create = useCallback(async (input: TaskInput) => {
    if (!user) throw new Error('Sin sesión')
    const { data, error } = await supabase
      .from('tasks')
      .insert({ ...input, user_id: user.id, sort_order: Date.now() })
      .select()
      .single()
    if (error) throw error
    await reload()
    return data as Task
  }, [reload, user])

  const update = useCallback(async (id: string, patch: Partial<Task>) => {
    const { error } = await supabase.from('tasks').update(patch).eq('id', id)
    if (error) throw error
    await reload()
  }, [reload])

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) throw error
    await reload()
  }, [reload])

  const setStatus = useCallback(
    async (id: string, status: Task['status']) => {
      const patch: Partial<Task> = { status }
      if (status === 'completed') patch.completed_at = new Date().toISOString()
      else patch.completed_at = null
      await update(id, patch)
    },
    [update]
  )

  const addSpentMinutes = useCallback(
    async (id: string, minutes: number) => {
      const t = tasks.find((x) => x.id === id)
      if (!t) return
      await update(id, { spent_minutes: t.spent_minutes + minutes })
    },
    [tasks, update]
  )

  return { tasks, loading, error, reload, create, update, remove, setStatus, addSpentMinutes }
}
