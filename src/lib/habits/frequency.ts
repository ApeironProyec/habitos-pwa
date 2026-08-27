import type { Habit } from './types'

/**
 * Modelo temporal de la app
 * ─────────────────────────
 * Un hábito "a las 09:00" es HORA DE PARED, no un instante en el tiempo.
 * Si defines "leer a las 21:00" y viajas a otro país, sigue siendo a las 21:00
 * locales — no a las 21:00 de Cochabamba convertidas.
 *
 * Por eso las ocurrencias se guardan como (scheduled_date, scheduled_time),
 * nunca como timestamptz. La versión anterior guardaba
 * `${date}T${time}:00` en una columna timestamptz: Postgres lo interpretaba
 * en UTC y un hábito de las 09:00 quedaba a las 05:00 de Bolivia. No se notaba
 * porque la UI recortaba el string crudo, así que el error se cancelaba solo
 * mientras nadie leyera el dato desde SQL.
 */

/** Hora normalizada a 'HH:mm:ss', que es como Postgres devuelve un `time`. */
export function normalizeTime(time: string): string {
  const [h = '0', m = '0', s = '0'] = time.split(':')
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:${s.padStart(2, '0')}`
}

/** 'HH:mm' para mostrar en pantalla. */
export function displayTime(time: string): string {
  return normalizeTime(time).slice(0, 5)
}

/** Cuántas veces al día debe ocurrir el hábito según su configuración. */
export function timesPerDay(habit: Pick<Habit, 'frequency_type' | 'frequency_config'>): number {
  return timesOfDay(habit).length
}

/** ¿El hábito aplica en la fecha dada (date = YYYY-MM-DD, hora local)? */
export function appliesOn(
  habit: Pick<Habit, 'frequency_type' | 'frequency_config' | 'start_date' | 'end_date'>,
  date: string
): boolean {
  if (date < habit.start_date) return false
  if (habit.end_date && date > habit.end_date) return false
  if (habit.frequency_type === 'weekly') {
    const days = habit.frequency_config?.days_of_week ?? []
    return days.includes(dayOfWeek(date))
  }
  return true
}

/** Día de la semana (0=domingo) de un 'YYYY-MM-DD', sin depender del huso. */
export function dayOfWeek(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/**
 * Horas locales ('HH:mm:ss') en las que ocurre el hábito durante un día.
 * Siempre ordenadas y sin duplicados.
 */
export function timesOfDay(habit: Pick<Habit, 'frequency_type' | 'frequency_config'>): string[] {
  const cfg = habit.frequency_config ?? {}
  const start = cfg.start_time ?? '09:00'

  let raw: string[]
  switch (habit.frequency_type) {
    case 'daily':
      raw = [start]
      break

    case 'multiple_daily':
      // Horas explícitas si las hay; si no, repartir desde start_time
      // (antes se repartía desde 00:00 e ignoraba start_time por completo)
      raw = cfg.times?.length ? cfg.times : spreadFromStart(start, cfg.times_per_day ?? 1)
      break

    case 'interval': {
      const hours = clampInterval(cfg.interval_hours ?? 8)
      raw = spacedTimes(start, hours)
      break
    }

    case 'weekly':
      raw = [start]
      break

    default:
      raw = [start]
  }

  const unique = Array.from(new Set(raw.map(normalizeTime)))
  return unique.sort()
}

function clampInterval(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 8
  return Math.min(24, Math.max(1, Math.floor(hours)))
}

function toMinutes(time: string): number {
  const [h, m] = normalizeTime(time).split(':').map(Number)
  return h * 60 + m
}

function fromMinutes(total: number): string {
  const wrapped = ((total % 1440) + 1440) % 1440
  const h = Math.floor(wrapped / 60)
  const m = wrapped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

/**
 * Reparte N ocurrencias desde start_time hasta el final del día.
 * 3 veces desde las 08:00 → 08:00, 13:20, 18:40 (antes: 00:00, 08:00, 16:00).
 */
function spreadFromStart(start: string, n: number): string[] {
  const count = Math.max(1, Math.min(24, Math.floor(n)))
  if (count === 1) return [start]
  const startMin = toMinutes(start)
  // Reparte dentro de la ventana de vigilia restante (hasta las 22:00 o fin del día)
  const endMin = Math.max(startMin + 60, Math.min(1320, 1440 - 60))
  const step = (endMin - startMin) / (count - 1)
  return Array.from({ length: count }, (_, i) => fromMinutes(Math.round(startMin + i * step)))
}

/** Horas espaciadas cada `stepHours` desde start, sin pasar de medianoche. */
function spacedTimes(start: string, stepHours: number): string[] {
  const startMin = toMinutes(start)
  const out: string[] = []
  for (let min = startMin; min < 1440; min += stepHours * 60) {
    out.push(fromMinutes(min))
  }
  return out.length ? out : [normalizeTime(start)]
}

/** Slots (fecha + hora) de un hábito para una fecha concreta. */
export interface Slot {
  date: string
  time: string
}

export function slotsForDate(
  habit: Pick<Habit, 'frequency_type' | 'frequency_config' | 'start_date' | 'end_date'>,
  date: string
): Slot[] {
  if (!appliesOn(habit, date)) return []
  return timesOfDay(habit).map((time) => ({ date, time }))
}

/** Clave estable de un slot, para deduplicar e indexar. */
export function slotKey(habitId: string, date: string, time: string): string {
  return `${habitId}|${date}|${normalizeTime(time)}`
}

export const DEFAULT_TIMEZONE = 'America/La_Paz'

/** Zona horaria detectada del dispositivo, con fallback. */
export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE
  } catch {
    return DEFAULT_TIMEZONE
  }
}

/** Desplaza un 'YYYY-MM-DD' N días. Aritmética en UTC: inmune al huso y al DST. */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}

/** Días entre dos fechas (b - a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

/** Rango inclusivo de fechas. */
export function dateRange(from: string, to: string): string[] {
  const n = daysBetween(from, to)
  if (n < 0) return []
  return Array.from({ length: n + 1 }, (_, i) => shiftDate(from, i))
}

/** 'Hoy' en YYYY-MM-DD según la zona indicada (o la del dispositivo). */
export function todayStr(timezone?: string): string {
  return dateInTimezone(new Date(), timezone)
}

export function dateInTimezone(date: Date, timezone?: string): string {
  if (!timezone) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** Hora local actual como 'HH:mm:ss'. Útil para saber qué slot toca ahora. */
export function nowTime(timezone?: string): string {
  const d = new Date()
  if (!timezone) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
  return normalizeTime(parts)
}

/**
 * Instante real de un slot, para notificaciones o comparar con "ahora".
 * Interpreta (date, time) en la zona dada — que es lo que la columna
 * timestamptz nunca pudo hacer bien.
 */
export function slotToDate(date: string, time: string, timezone?: string): Date {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = normalizeTime(time).split(':').map(Number)
  if (!timezone) return new Date(y, mo - 1, d, h, mi, 0, 0)

  // Punto de partida en UTC, corregido por el offset real de esa zona/fecha
  const naiveUTC = Date.UTC(y, mo - 1, d, h, mi, 0, 0)
  const offset = timezoneOffsetMs(new Date(naiveUTC), timezone)
  return new Date(naiveUTC - offset)
}

/** Offset de una zona en un instante dado (positivo al este de Greenwich). */
function timezoneOffsetMs(at: Date, timezone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = dtf.formatToParts(at)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0')
  const asUTC = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') === 24 ? 0 : get('hour'),
    get('minute'),
    get('second')
  )
  return asUTC - at.getTime()
}
