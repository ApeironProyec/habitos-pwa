import type { Habit } from './types'

/** Cuántas veces al día debe ocurrir el hábito según su configuración. */
export function timesPerDay(habit: Pick<Habit, 'frequency_type' | 'frequency_config'>): number {
  const cfg = habit.frequency_config ?? {}
  switch (habit.frequency_type) {
    case 'daily':
      return 1
    case 'multiple_daily':
      return cfg.times?.length ?? cfg.times_per_day ?? 1
    case 'interval': {
      const hours = cfg.interval_hours ?? 8
      return Math.max(1, Math.min(12, Math.floor(24 / hours)))
    }
    case 'weekly':
      return cfg.times_per_day ?? 1
    default:
      return 1
  }
}

/** ¿El hábito aplica en la fecha dada (date = YYYY-MM-DD, zona local)? */
export function appliesOn(habit: Pick<Habit, 'frequency_type' | 'frequency_config' | 'start_date' | 'end_date'>, date: string): boolean {
  if (date < habit.start_date) return false
  if (habit.end_date && date > habit.end_date) return false
  if (habit.frequency_type === 'weekly') {
    const days = habit.frequency_config?.days_of_week ?? []
    const dow = new Date(date + 'T12:00:00').getDay() // 0=domingo
    return days.includes(dow)
  }
  return true
}

/** Horas locales (HH:mm) en las que ocurre el hábito durante un día dado. */
export function timesOfDay(habit: Pick<Habit, 'frequency_type' | 'frequency_config'>): string[] {
  const cfg = habit.frequency_config ?? {}
  switch (habit.frequency_type) {
    case 'daily':
      return [cfg.start_time ?? '09:00']
    case 'multiple_daily':
      return cfg.times?.length ? cfg.times : defaultTimes(cfg.times_per_day ?? 1)
    case 'interval': {
      const hours = cfg.interval_hours ?? 8
      const start = cfg.start_time ?? '08:00'
      const count = Math.max(1, Math.min(12, Math.floor(24 / hours)))
      return spacedTimes(start, hours, count)
    }
    case 'weekly':
      return [cfg.start_time ?? '09:00']
    default:
      return ['09:00']
  }
}

/** Reparte N ocurrencias uniformemente a lo largo del día (paso = 24/N desde 00:00). */
function defaultTimes(n: number): string[] {
  const times: string[] = []
  const step = 24 / Math.max(1, n)
  for (let i = 0; i < n; i++) {
    const h = Math.floor(i * step)
    const m = Math.round((i * step - h) * 60)
    times.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }
  return times
}

function spacedTimes(start: string, stepHours: number, count: number): string[] {
  const [h, m] = start.split(':').map(Number)
  const times: string[] = []
  for (let i = 0; i < count; i++) {
    const total = h + i * stepHours
    if (total >= 24) break
    times.push(`${String(total).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }
  return times.length ? times : [start]
}

/** Crea los timestamps ISO de las ocurrencias de un hábito para una fecha (YYYY-MM-DD, zona local). */
export function scheduledTimesForDate(
  habit: Pick<Habit, 'frequency_type' | 'frequency_config' | 'start_date' | 'end_date'>,
  date: string
): string[] {
  if (!appliesOn(habit, date)) return []
  return timesOfDay(habit).map((t) => localDateToISO(date, t))
}

/** Convierte 'YYYY-MM-DD' + 'HH:mm' (zona local) a ISO timestamptz. */
export function localDateToISO(date: string, time: string): string {
  return `${date}T${time}:00`
}

/** Zona horaria del usuario (desde perfil o default). */
export const DEFAULT_TIMEZONE = 'America/La_Paz'

/** Desplaza una fecha YYYY-MM-DD por N días (negativo = hacia atrás). */
export function shiftDate(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/** 'Hoy' en YYYY-MM-DD según zona horaria dada (o local del navegador). */
export function todayStr(timezone?: string): string {
  return dateInTimezone(new Date(), timezone)
}

export function dateInTimezone(date: Date, timezone?: string): string {
  if (!timezone) {
    // formato local sin UTC: YYYY-MM-DD
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
  return parts // en-CA → YYYY-MM-DD
}
