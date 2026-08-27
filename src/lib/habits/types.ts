export type FrequencyType = 'daily' | 'weekly' | 'interval' | 'multiple_daily'

export type TargetType = 'count' | 'duration_minutes' | 'repetitions'

/** Configuración específica por tipo de frecuencia (JSONB en DB) */
export interface FrequencyConfig {
  /** daily / multiple_daily: cuántas veces al día (default 1) */
  times_per_day?: number
  /** interval: cada cuántas horas (ej. 6, 8, 12) */
  interval_hours?: number
  /** weekly: días de la semana (0=domingo ... 6=sábado) */
  days_of_week?: number[]
  /** Hora del primer bloque del día ('HH:mm') */
  start_time?: string
  /** multiple_daily: horas fijas explícitas (ej. ['08:00','14:00','20:00']) */
  times?: string[]
}

/** Campos comunes a todo lo que se sincroniza. */
export interface SyncFields {
  created_at: string
  updated_at: string
  /** Soft delete: necesario para propagar borrados entre dispositivos. */
  deleted_at: string | null
}

export interface Habit extends SyncFields {
  id: string
  user_id: string
  name: string
  description: string | null
  category: string | null
  icon: string | null
  color: string | null
  frequency_type: FrequencyType
  frequency_config: FrequencyConfig
  target_type: TargetType | null
  target_value: number | null
  unit: string | null
  start_date: string
  end_date: string | null
  is_active: boolean
  /** Zona en la que se definió el hábito (hora de pared). */
  timezone: string
}

export type OccurrenceStatus = 'pending' | 'completed' | 'skipped'

export interface Occurrence extends SyncFields {
  id: string
  user_id: string
  habit_id: string
  /** 'YYYY-MM-DD' local. */
  scheduled_date: string
  /** 'HH:mm:ss' local. */
  scheduled_time: string
  status: OccurrenceStatus
  completed_at: string | null
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed'

/** Prioridad de una tarea. El orden de ejecución la pondera en este sentido. */
export type TaskPriority = 'low' | 'medium' | 'high'

export const TASK_PRIORITIES: TaskPriority[] = ['high', 'medium', 'low']

export interface Task extends SyncFields {
  id: string
  user_id: string
  title: string
  description: string | null
  status: TaskStatus
  /** Fecha objetivo de la tarea ('YYYY-MM-DD', local). */
  due_date: string | null
  due_time: string | null
  /** Prioridad. Default medium para filas viejas y nuevas sin elegir. */
  priority: TaskPriority
  /** Etiquetas libres, en minúsculas. */
  tags: string[]
  /** Lista a la que pertenece (FK lógica a task_lists). */
  list_id: string | null
  /** Recordatorio: fecha local + hora local (igual que ocurrencias). */
  reminder_date: string | null
  reminder_time: string | null
  estimated_minutes: number | null
  spent_minutes: number
  sort_order: number
  completed_at: string | null
}

export type TaskInput = Pick<
  Task,
  | 'title'
  | 'description'
  | 'status'
  | 'due_date'
  | 'due_time'
  | 'priority'
  | 'tags'
  | 'list_id'
  | 'reminder_date'
  | 'reminder_time'
  | 'estimated_minutes'
>

export interface TaskList extends SyncFields {
  id: string
  user_id: string
  name: string
  color: string | null
  sort_order: number
}

export type TaskListInput = Pick<TaskList, 'name' | 'color'>

export type HabitInput = Pick<
  Habit,
  | 'name'
  | 'description'
  | 'category'
  | 'icon'
  | 'color'
  | 'frequency_type'
  | 'frequency_config'
  | 'target_type'
  | 'target_value'
  | 'unit'
  | 'start_date'
  | 'end_date'
  | 'is_active'
>

/** Estado del motor de sincronización, para mostrarlo en la UI. */
export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error'
