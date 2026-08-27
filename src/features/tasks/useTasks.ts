import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/features/auth/useAuth'
import { onDataChanged } from '@/lib/db/events'
import * as repo from '@/lib/db/repo'
import type { Task, TaskInput } from '@/lib/habits/types'

export function useTasks() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setTasks(await repo.listTasks())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando tareas')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    return onDataChanged((scope) => {
      if (scope === 'tasks') void reload()
    })
  }, [reload])

  const create = useCallback(
    async (input: TaskInput) => {
      if (!user) throw new Error('Sin sesión')
      return repo.createTask(input, user.id)
    },
    [user]
  )

  const update = useCallback(async (id: string, patch: Partial<Task>) => {
    await repo.updateTask(id, patch)
  }, [])

  const remove = useCallback(async (id: string) => {
    await repo.deleteTask(id)
  }, [])

  const setStatus = useCallback(async (id: string, status: Task['status']) => {
    await repo.setTaskStatus(id, status)
  }, [])

  /** Acumula minutos como delta atómico, sin condición de carrera. */
  const addSpentMinutes = useCallback(async (id: string, minutes: number) => {
    await repo.addTaskMinutes(id, minutes)
  }, [])

  return { tasks, loading, error, reload, create, update, remove, setStatus, addSpentMinutes }
}
