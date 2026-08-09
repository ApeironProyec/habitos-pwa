import { describe, it, expect } from 'vitest'
import { expectedOccurrences, completionRate, currentStreak, bestStreak, dailyTotals, perHabitStats } from '../stats'
import type { Habit, Occurrence } from '../types'

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
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

function occ(habitId: string, sched: string, status: Occurrence['status'] = 'completed'): Occurrence {
  return {
    id: `o-${habitId}-${sched}`,
    user_id: 'u1',
    habit_id: habitId,
    scheduled_at: sched,
    status,
    completed_at: status === 'completed' ? sched : null,
    created_at: sched,
    updated_at: sched,
  }
}

describe('expectedOccurrences', () => {
  it('cuenta ocurrencias diarias en el rango', () => {
    const h = habit()
    expect(expectedOccurrences(h, '2026-08-01', '2026-08-03')).toEqual([
      '2026-08-01T09:00:00',
      '2026-08-02T09:00:00',
      '2026-08-03T09:00:00',
    ])
  })
})

describe('completionRate', () => {
  it('100% cuando todo está completado', () => {
    const h = habit()
    const byHabit = new Map([[h.id, [occ(h.id, '2026-08-01T09:00:00'), occ(h.id, '2026-08-02T09:00:00')]]])
    expect(completionRate([h], byHabit, '2026-08-01', '2026-08-02')).toBe(100)
  })

  it('50% con la mitad completada', () => {
    const h = habit()
    const byHabit = new Map([[h.id, [occ(h.id, '2026-08-01T09:00:00')]]])
    expect(completionRate([h], byHabit, '2026-08-01', '2026-08-02')).toBe(50)
  })

  it('null cuando no hay ocurrencias esperadas', () => {
    const h = habit({ end_date: '2026-07-01' })
    expect(completionRate([h], new Map(), '2026-08-01', '2026-08-02')).toBeNull()
  })
})

describe('currentStreak', () => {
  it('cuenta días consecutivos al 100% terminando en hoy', () => {
    const h = habit()
    const byHabit = new Map([
      [
        h.id,
        [
          occ(h.id, '2026-08-06T09:00:00'),
          occ(h.id, '2026-08-07T09:00:00'),
          occ(h.id, '2026-08-08T09:00:00'),
        ],
      ],
    ])
    expect(currentStreak([h], byHabit, '2026-08-08')).toBe(3)
  })

  it('si hoy no está completado, la racha se cuenta desde ayer', () => {
    const h = habit()
    const byHabit = new Map([
      [h.id, [occ(h.id, '2026-08-06T09:00:00'), occ(h.id, '2026-08-07T09:00:00')]],
    ])
    expect(currentStreak([h], byHabit, '2026-08-08')).toBe(2)
  })

  it('se rompe con un día incompleto', () => {
    const h = habit()
    const byHabit = new Map([
      [h.id, [occ(h.id, '2026-08-06T09:00:00'), occ(h.id, '2026-08-08T09:00:00')]],
    ])
    expect(currentStreak([h], byHabit, '2026-08-08')).toBe(1)
  })
})

describe('bestStreak', () => {
  it('encuentra la racha más larga del período', () => {
    const h = habit()
    const byHabit = new Map([
      [
        h.id,
        [
          occ(h.id, '2026-07-28T09:00:00'),
          occ(h.id, '2026-07-29T09:00:00'),
          occ(h.id, '2026-07-30T09:00:00'),
          occ(h.id, '2026-08-01T09:00:00'),
        ],
      ],
    ])
    expect(bestStreak([h], byHabit, '2026-08-08')).toBe(3)
  })
})

describe('dailyTotals', () => {
  it('agrega expected/done por día', () => {
    const h1 = habit({ id: 'h1' })
    const h2 = habit({ id: 'h2', frequency_config: { start_time: '09:00' } })
    const byHabit = new Map([
      [h1.id, [occ(h1.id, '2026-08-01T09:00:00')]],
      [h2.id, []],
    ])
    const totals = dailyTotals([h1, h2], byHabit, '2026-08-01', '2026-08-01')
    expect(totals.get('2026-08-01')).toEqual({ expected: 2, done: 1 })
  })
})

describe('perHabitStats', () => {
  it('calcula pct por hábito', () => {
    const h = habit()
    const byHabit = new Map([[h.id, [occ(h.id, '2026-08-01T09:00:00')]]])
    const stats = perHabitStats([h], byHabit, '2026-08-01', '2026-08-02')
    expect(stats[0]).toMatchObject({ expected: 2, done: 1, pct: 50 })
  })
})
