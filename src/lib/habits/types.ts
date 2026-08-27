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

export interface Task extends SyncFields {
  id: string
  user_id: string
  title: string
  description: string | null
  status: TaskStatus
  due_date: string | null
  due_time: string | null
  estimated_minutes: number | null
  spent_minutes: number
  sort_order: number
  completed_at: string | null
}

export type TaskInput = Pick<
  Task,
  'title' | 'description' | 'status' | 'due_date' | 'due_time' | 'estimated_minutes'
> & { spent_minutes?: number }

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
