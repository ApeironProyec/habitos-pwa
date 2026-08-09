import { describe, it, expect } from 'vitest'
import { timesPerDay, appliesOn, scheduledTimesForDate, localDateToISO } from '../frequency'
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
    frequency_config: {},
    target_type: null,
    target_value: null,
    unit: null,
    start_date: '2026-01-01',
    end_date: null,
    is_active: true,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

describe('timesPerDay', () => {
  it('daily = 1', () => {
    expect(timesPerDay(habit())).toBe(1)
  })

  it('multiple_daily usa times explícitas o times_per_day', () => {
    expect(timesPerDay(habit({ frequency_type: 'multiple_daily', frequency_config: { times_per_day: 6 } }))).toBe(6)
    expect(timesPerDay(habit({ frequency_type: 'multiple_daily', frequency_config: { times: ['08:00', '14:00'] } }))).toBe(2)
    expect(timesPerDay(habit({ frequency_type: 'multiple_daily', frequency_config: {} }))).toBe(1)
  })

  it('interval calcula floor(24/h)', () => {
    expect(timesPerDay(habit({ frequency_type: 'interval', frequency_config: { interval_hours: 6 } }))).toBe(4)
    expect(timesPerDay(habit({ frequency_type: 'interval', frequency_config: { interval_hours: 8 } }))).toBe(3)
    expect(timesPerDay(habit({ frequency_type: 'interval', frequency_config: { interval_hours: 12 } }))).toBe(2)
    expect(timesPerDay(habit({ frequency_type: 'interval', frequency_config: {} }))).toBe(3) // default 8h
  })
})

describe('appliesOn', () => {
  it('respeta start_date y end_date', () => {
    const h = habit({ start_date: '2026-02-01', end_date: '2026-02-10' })
    expect(appliesOn(h, '2026-01-31')).toBe(false)
    expect(appliesOn(h, '2026-02-05')).toBe(true)
    expect(appliesOn(h, '2026-02-11')).toBe(false)
  })

  it('weekly respeta days_of_week (0=domingo)', () => {
    // 2026-08-08 es sábado → getDay() = 6
    const h = habit({ frequency_type: 'weekly', frequency_config: { days_of_week: [6] } })
    expect(appliesOn(h, '2026-08-08')).toBe(true)
    expect(appliesOn(h, '2026-08-09')).toBe(false)
  })
})

describe('scheduledTimesForDate', () => {
  it('daily genera una ocurrencia con la hora configurada', () => {
    const h = habit({ frequency_config: { start_time: '09:30' } })
    expect(scheduledTimesForDate(h, '2026-08-08')).toEqual(['2026-08-08T09:30:00'])
  })

  it('multiple_daily genera N horas repartidas', () => {
    const h = habit({ frequency_type: 'multiple_daily', frequency_config: { times_per_day: 3 } })
    const times = scheduledTimesForDate(h, '2026-08-08')
    expect(times).toHaveLength(3)
    expect(times[0]).toBe('2026-08-08T00:00:00')
    expect(times[1]).toBe('2026-08-08T08:00:00')
    expect(times[2]).toBe('2026-08-08T16:00:00')
  })

  it('interval respeta interval_hours y start_time', () => {
    const h = habit({ frequency_type: 'interval', frequency_config: { interval_hours: 6, start_time: '08:00' } })
    expect(scheduledTimesForDate(h, '2026-08-08')).toEqual([
      '2026-08-08T08:00:00',
      '2026-08-08T14:00:00',
      '2026-08-08T20:00:00',
    ])
  })

  it('interval de 12h con start 08:00 da 2 ocurrencias', () => {
    const h = habit({ frequency_type: 'interval', frequency_config: { interval_hours: 12, start_time: '08:00' } })
    expect(scheduledTimesForDate(h, '2026-08-08')).toEqual(['2026-08-08T08:00:00', '2026-08-08T20:00:00'])
  })

  it('weekly no genera ocurrencias en días no configurados', () => {
    const h = habit({ frequency_type: 'weekly', frequency_config: { days_of_week: [1, 3, 5] } })
    // 2026-08-08 = sábado (6) → vacío
    expect(scheduledTimesForDate(h, '2026-08-08')).toEqual([])
  })
})

describe('localDateToISO', () => {
  it('combina fecha y hora en ISO local', () => {
    expect(localDateToISO('2026-08-08', '14:00')).toBe('2026-08-08T14:00:00')
  })
})
