import { describe, it, expect } from 'vitest'
import {
  timesPerDay,
  timesOfDay,
  appliesOn,
  slotsForDate,
  normalizeTime,
  displayTime,
  dayOfWeek,
  shiftDate,
  daysBetween,
  dateRange,
  slotToDate,
  dateInTimezone,
} from '../frequency'
import type { Habit } from '../types'

function habit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    user_id: 'u1',
    name: 'Test',
    description: null,
    category: null,
    icon: null,
    color: null,
    frequency_type: 'daily',
    frequency_config: { start_time: '09:00' },
    target_type: null,
    target_value: null,
    unit: null,
    start_date: '2026-01-01',
    end_date: null,
    is_active: true,
    timezone: 'America/La_Paz',
    created_at: '',
    updated_at: '',
    deleted_at: null,
    ...overrides,
  }
}

describe('normalizeTime / displayTime', () => {
  it('normaliza a HH:mm:ss', () => {
    expect(normalizeTime('9:5')).toBe('09:05:00')
    expect(normalizeTime('08:00')).toBe('08:00:00')
    expect(normalizeTime('08:00:00')).toBe('08:00:00')
  })

  it('muestra HH:mm', () => {
    expect(displayTime('08:00:00')).toBe('08:00')
    expect(displayTime('8:5')).toBe('08:05')
  })
})

describe('timesOfDay', () => {
  it('daily usa start_time', () => {
    expect(timesOfDay(habit({ frequency_config: { start_time: '07:30' } }))).toEqual(['07:30:00'])
  })

  it('daily sin start_time cae en 09:00', () => {
    expect(timesOfDay(habit({ frequency_config: {} }))).toEqual(['09:00:00'])
  })

  it('multiple_daily respeta start_time (antes lo ignoraba y repartía desde 00:00)', () => {
    const times = timesOfDay(
      habit({ frequency_type: 'multiple_daily', frequency_config: { times_per_day: 3, start_time: '08:00' } })
    )
    expect(times).toHaveLength(3)
    expect(times[0]).toBe('08:00:00')
    // Ninguna ocurrencia antes de la hora de inicio
    expect(times.every((t) => t >= '08:00:00')).toBe(true)
  })

  it('multiple_daily con horas explícitas las usa ordenadas', () => {
    expect(
      timesOfDay(
        habit({ frequency_type: 'multiple_daily', frequency_config: { times: ['20:00', '08:00', '14:00'] } })
      )
    ).toEqual(['08:00:00', '14:00:00', '20:00:00'])
  })

  it('interval espacia desde start_time sin pasar de medianoche', () => {
    const times = timesOfDay(
      habit({ frequency_type: 'interval', frequency_config: { interval_hours: 6, start_time: '08:00' } })
    )
    expect(times).toEqual(['08:00:00', '14:00:00', '20:00:00'])
  })

  it('interval con horas inválidas cae en el default de 8h', () => {
    const times = timesOfDay(
      habit({ frequency_type: 'interval', frequency_config: { interval_hours: 0, start_time: '00:00' } })
    )
    expect(times).toEqual(['00:00:00', '08:00:00', '16:00:00'])
  })

  it('no devuelve duplicados', () => {
    const times = timesOfDay(
      habit({ frequency_type: 'multiple_daily', frequency_config: { times: ['08:00', '08:00:00', '8:00'] } })
    )
    expect(times).toEqual(['08:00:00'])
  })
})

describe('timesPerDay', () => {
  it('coincide con la cantidad de horas generadas', () => {
    expect(timesPerDay(habit())).toBe(1)
    expect(
      timesPerDay(habit({ frequency_type: 'multiple_daily', frequency_config: { times_per_day: 6 } }))
    ).toBe(6)
    expect(
      timesPerDay(habit({ frequency_type: 'interval', frequency_config: { interval_hours: 12, start_time: '08:00' } }))
    ).toBe(2)
  })
})

describe('appliesOn', () => {
  it('respeta start_date y end_date', () => {
    const h = habit({ start_date: '2026-08-10', end_date: '2026-08-12' })
    expect(appliesOn(h, '2026-08-09')).toBe(false)
    expect(appliesOn(h, '2026-08-10')).toBe(true)
    expect(appliesOn(h, '2026-08-12')).toBe(true)
    expect(appliesOn(h, '2026-08-13')).toBe(false)
  })

  it('weekly solo aplica en los días elegidos', () => {
    // 2026-08-10 es lunes
    const h = habit({ frequency_type: 'weekly', frequency_config: { days_of_week: [1, 3] } })
    expect(appliesOn(h, '2026-08-10')).toBe(true)  // lunes
    expect(appliesOn(h, '2026-08-11')).toBe(false) // martes
    expect(appliesOn(h, '2026-08-12')).toBe(true)  // miércoles
  })
})

describe('dayOfWeek', () => {
  it('calcula el día sin depender del huso', () => {
    expect(dayOfWeek('2026-08-10')).toBe(1) // lunes
    expect(dayOfWeek('2026-08-16')).toBe(0) // domingo
  })
})

describe('slotsForDate', () => {
  it('devuelve fecha y hora separadas, nunca un timestamp', () => {
    const slots = slotsForDate(habit({ frequency_config: { start_time: '09:00' } }), '2026-08-15')
    expect(slots).toEqual([{ date: '2026-08-15', time: '09:00:00' }])
  })

  it('devuelve vacío si el hábito no aplica ese día', () => {
    const h = habit({ frequency_type: 'weekly', frequency_config: { days_of_week: [0] } })
    expect(slotsForDate(h, '2026-08-10')).toEqual([])
  })
})

describe('aritmética de fechas', () => {
  it('shiftDate cruza meses y años', () => {
    expect(shiftDate('2026-08-31', 1)).toBe('2026-09-01')
    expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31')
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('daysBetween cuenta días completos', () => {
    expect(daysBetween('2026-08-01', '2026-08-08')).toBe(7)
    expect(daysBetween('2026-08-08', '2026-08-01')).toBe(-7)
  })

  it('dateRange es inclusivo en ambos extremos', () => {
    expect(dateRange('2026-08-01', '2026-08-03')).toEqual(['2026-08-01', '2026-08-02', '2026-08-03'])
    expect(dateRange('2026-08-03', '2026-08-01')).toEqual([])
  })
})

describe('slotToDate', () => {
  it('interpreta la hora en la zona indicada, no en UTC', () => {
    // 09:00 en Bolivia (UTC-4) es 13:00 UTC. La versión anterior guardaba
    // '2026-08-15T09:00:00' en timestamptz y quedaba como 09:00 UTC = 05:00 local.
    const d = slotToDate('2026-08-15', '09:00:00', 'America/La_Paz')
    expect(d.toISOString()).toBe('2026-08-15T13:00:00.000Z')
  })

  it('funciona en una zona con signo opuesto', () => {
    const d = slotToDate('2026-08-15', '09:00:00', 'Asia/Tokyo') // UTC+9
    expect(d.toISOString()).toBe('2026-08-15T00:00:00.000Z')
  })
})

describe('dateInTimezone', () => {
  it('devuelve el día local, no el UTC', () => {
    // 2026-08-16T02:00Z es todavía el 15 en Bolivia
    const at = new Date('2026-08-16T02:00:00.000Z')
    expect(dateInTimezone(at, 'America/La_Paz')).toBe('2026-08-15')
    expect(dateInTimezone(at, 'UTC')).toBe('2026-08-16')
  })
})
