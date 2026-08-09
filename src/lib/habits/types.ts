import type { Json } from '@/lib/supabase/database.types'

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
  /** interval: hora de inicio del primer bloque del día (HH:mm) */
  start_time?: string
  /** multiple_daily: horas fijas explícitas (ej. ['08:00','14:00','20:00']) */
  times?: string[]
}

export interface Habit {
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
  created_at: string
  updated_at: string
}

export type OccurrenceStatus = 'pending' | 'completed' | 'skipped'

export interface Occurrence {
  id: string
  user_id: string
  habit_id: string
  scheduled_at: string
  status: OccurrenceStatus
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type HabitInput = Omit<
  Pick<
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
  >,
  'frequency_config'
> & { frequency_config: Json }
