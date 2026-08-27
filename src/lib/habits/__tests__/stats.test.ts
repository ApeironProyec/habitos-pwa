import { describe, it, expect } from 'vitest'
import {
  buildStatusIndex,
  completionRate,
  currentStreak,
  bestStreak,
  dailyTotals,
  perHabitStats,
  dayCompleted,
} from '../stats'
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
    timezone: 'America/La_Paz',
    created_at: '',
    updated_at: '',
    deleted_at: null,
    ...overrides,
  }
}

/** time acepta 'HH:mm' o 'HH:mm:ss'; el índice debe normalizar ambos a lo mismo. */
function occ(
  habitId: string,
  date: string,
  time: string,
  status: Occurrence['status'] = 'completed'
): Occurrence {
  const normalized = /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : time
  return {
    id: `o-${habitId}-${date}-${normalized}`,
    user_id: 'u1',
    habit_id: habitId,
    scheduled_date: date,
    scheduled_time: normalized,
    status,
    completed_at: status === 'completed' ? `${date}T${time}` : null,
    created_at: '',
    updated_at: '',
    deleted_at: null,
  }
}

describe('buildStatusIndex', () => {
  it('normaliza horas (HH:mm y HH:mm:ss apuntan al mismo slot)', () => {
    const index = buildStatusIndex([occ('h1', '2026-08-01', '09:00')])
    // lookup con formato crudo de Postgres debe encontrar la fila igual
    expect(index.get('h1|2026-08-01|09:00:00')).toBe('completed')
  })

  it('ignora ocurrencias borradas (soft delete)', () => {
    const o = occ('h1', '2026-08-01', '09:00')
    const deleted = { ...o, id: 'o-del', deleted_at: '2026-08-02T00:00:00Z' }
    const index = buildStatusIndex([deleted])
    expect(index.get('o-del|2026-08-01|09:00:00')).toBeUndefined()
    expect(index.size).toBe(0)
  })
})

describe('completionRate', () => {
  it('100% cuando todo está completado', () => {
    const h = habit()
    const index = buildStatusIndex([
      occ(h.id, '2026-08-01', '09:00'),
      occ(h.id, '2026-08-02', '09:00'),
    ])
    expect(completionRate([h], index, '2026-08-01', '2026-08-02')).toBe(100)
  })

  it('50% con la mitad completada', () => {
    const h = habit()
    const index = buildStatusIndex([occ(h.id, '2026-08-01', '09:00')])
    expect(completionRate([h], index, '2026-08-01', '2026-08-02')).toBe(50)
  })

  it('las omitidas no cuentan como hechas', () => {
    const h = habit()
    const index = buildStatusIndex([
      occ(h.id, '2026-08-01', '09:00'),
      occ(h.id, '2026-08-02', '09:00', 'skipped'),
    ])
    expect(completionRate([h], index, '2026-08-01', '2026-08-02')).toBe(50)
  })

  it('null cuando no hay nada esperado (hábito finalizado antes del rango)', () => {
    const h = habit({ end_date: '2026-07-01' })
    expect(completionRate([h], new Map(), '2026-08-01', '2026-08-02')).toBeNull()
  })
})

describe('currentStreak', () => {
  it('cuenta días consecutivos al 100% terminando hoy', () => {
    const h = habit()
    const index = buildStatusIndex([
      occ(h.id, '2026-08-06', '09:00'),
      occ(h.id, '2026-08-07', '09:00'),
      occ(h.id, '2026-08-08', '09:00'),
    ])
    expect(currentStreak([h], index, '2026-08-08')).toBe(3)
  })

  it('si hoy tiene pendientes, la racha se mide hasta ayer', () => {
    const h = habit()
    const index = buildStatusIndex([
      occ(h.id, '2026-08-06', '09:00'),
      occ(h.id, '2026-08-07', '09:00'),
      occ(h.id, '2026-08-08', '09:00', 'pending'),
    ])
    expect(currentStreak([h], index, '2026-08-08')).toBe(2)
  })

  it('se rompe con un día incompleto', () => {
    const h = habit()
    const index = buildStatusIndex([
      occ(h.id, '2026-08-06', '09:00'),
      occ(h.id, '2026-08-08', '09:00'),
    ])
    expect(currentStreak([h], index, '2026-08-08')).toBe(1)
  })

  it('los días sin nada programado NO rompen la racha (semántica nueva)', () => {
    // Hábito solo los lunes; hoy es lunes 10 y el lunes pasado también se cumplió.
    // Los 6 días intermedios no tienen slots esperados: no deben cortar.
    const h = habit({
      frequency_type: 'weekly',
      frequency_config: { days_of_week: [1], start_time: '09:00' },
      start_date: '2026-07-01',
    })
    const index = buildStatusIndex([occ(h.id, '2026-08-03', '09:00'), occ(h.id, '2026-08-10', '09:00')])
    expect(currentStreak([h], index, '2026-08-10')).toBe(2)
  })

  it('un lunes incumplido sí rompe entre dos lunes cumplidos', () => {
    const h = habit({
      frequency_type: 'weekly',
      frequency_config: { days_of_week: [1], start_time: '09:00' },
      start_date: '2026-07-01',
    })
    // solo se cumplió hoy; el lunes anterior (03) quedó debiendo
    const index = buildStatusIndex([occ(h.id, '2026-08-10', '09:00')])
    expect(currentStreak([h], index, '2026-08-10')).toBe(1)
  })
})

describe('bestStreak', () => {
  it('encuentra la racha más larga del período', () => {
    const h = habit()
    const index = buildStatusIndex([
      occ(h.id, '2026-07-28', '09:00'),
      occ(h.id, '2026-07-29', '09:00'),
      occ(h.id, '2026-07-30', '09:00'),
      occ(h.id, '2026-08-01', '09:00'),
    ])
    expect(bestStreak([h], index, '2026-08-08', 30)).toBe(3)
  })

  it('la mejor racha histórica mira hacia atrás aunque el rango visible sea corto', () => {
    const h = habit()
    const index = buildStatusIndex([
      occ(h.id, '2026-05-01', '09:00'),
      occ(h.id, '2026-05-02', '09:00'),
      occ(h.id, '2026-05-03', '09:00'),
      occ(h.id, '2026-05-04', '09:00'),
    ])
    expect(bestStreak([h], index, '2026-08-08', 365)).toBe(4)
  })
})

describe('dayCompleted', () => {
  it('false si no había nada esperado', () => {
    const h = habit({ end_date: '2026-07-31' })
    expect(dayCompleted([h], new Map(), '2026-08-08')).toBe(false)
  })

  it('true solo si TODAS las ocurrencias del día están completas', () => {
    const h = habit({
      frequency_type: 'multiple_daily',
      frequency_config: { times_per_day: 2, start_time: '08:00' },
    })
    // El reparto desde 08:00 con 2 veces da 08:00 y 22:00 (se esparce hasta ~22h)
    const index = buildStatusIndex([occ(h.id, '2026-08-01', '08:00')])
    expect(dayCompleted([h], index, '2026-08-01')).toBe(false)
    index.set('h1|2026-08-01|22:00:00', 'completed')
    expect(dayCompleted([h], index, '2026-08-01')).toBe(true)
  })
})

describe('dailyTotals', () => {
  it('agrega expected/done por día', () => {
    const h1 = habit({ id: 'h1' })
    const h2 = habit({ id: 'h2', frequency_config: { start_time: '10:00' } })
    const index = buildStatusIndex([
      occ('h1', '2026-08-01', '09:00'),
      occ('h1', '2026-08-02', '09:00'),
    ])
    const totals = dailyTotals([h1, h2], index, '2026-08-01', '2026-08-02')
    expect(totals.get('2026-08-01')).toEqual({ expected: 2, done: 1 })
    expect(totals.get('2026-08-02')).toEqual({ expected: 2, done: 1 })
  })
})

describe('perHabitStats', () => {
  it('calcula pct por hábito en el rango', () => {
    const h = habit()
    const index = buildStatusIndex([occ(h.id, '2026-08-01', '09:00')])
    const stats = perHabitStats([h], index, '2026-08-01', '2026-08-02')
    expect(stats[0]).toMatchObject({ expected: 2, done: 1, pct: 50 })
  })

  it('separa correctamente dos hábitos con distinta frecuencia', () => {
    const agua = habit({ id: 'agua', frequency_config: { start_time: '08:00' } })
    const gym = habit({
      id: 'gym',
      frequency_type: 'weekly',
      frequency_config: { days_of_week: [1], start_time: '07:00' },
    })
    // 2026-08-03 es lunes
    const index = buildStatusIndex([
      occ('agua', '2026-08-03', '08:00'),
      occ('gym', '2026-08-03', '07:00'),
      occ('agua', '2026-08-04', '08:00', 'pending'),
    ])
    const stats = Object.fromEntries(
      perHabitStats([agua, gym], index, '2026-08-03', '2026-08-04').map((s) => [s.habit.id, s])
    )
    // agua: esperaba 2 (lun+mar), hizo 1 → 50%
    expect(stats['agua']).toMatchObject({ expected: 2, done: 1, pct: 50 })
    // gym: solo esperaba el lunes, completado → 100%
    expect(stats['gym']).toMatchObject({ expected: 1, done: 1, pct: 100 })
  })
})
