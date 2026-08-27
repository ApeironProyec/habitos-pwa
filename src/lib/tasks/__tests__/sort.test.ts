import { describe, it, expect } from 'vitest'
import {
  priorityWeight,
  compareTasks,
  dueBucket,
  buildTodaySections,
  groupTasks,
  parseTags,
} from '../sort'
import type { Task } from '@/lib/habits/types'

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    user_id: 'u1',
    title: 'Tarea',
    description: null,
    status: 'pending',
    due_date: null,
    due_time: null,
    priority: 'medium',
    tags: [],
    list_id: null,
    reminder_date: null,
    reminder_time: null,
    estimated_minutes: null,
    spent_minutes: 0,
    sort_order: 0,
    completed_at: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    deleted_at: null,
    ...overrides,
  }
}

const TODAY = '2026-08-27'

describe('priorityWeight', () => {
  it('alta < media < baja en orden de ejecución', () => {
    expect(priorityWeight('high')).toBeLessThan(priorityWeight('medium'))
    expect(priorityWeight('medium')).toBeLessThan(priorityWeight('low'))
    expect(priorityWeight('high')).toBe(0)
  })
})

describe('dueBucket', () => {
  it('clasifica vencida / hoy / próxima / sin fecha', () => {
    expect(dueBucket(task({ due_date: '2026-08-20' }), TODAY)).toBe('overdue')
    expect(dueBucket(task({ due_date: '2026-08-27' }), TODAY)).toBe('today')
    expect(dueBucket(task({ due_date: '2026-09-01' }), TODAY)).toBe('upcoming')
    expect(dueBucket(task({}), TODAY)).toBe('someday')
  })
})

describe('compareTasks', () => {
  it('prioridad manda dentro del mismo bucket', () => {
    const alta = task({ priority: 'high' })
    const baja = task({ priority: 'low' })
    expect(compareTasks(alta, baja)).toBeLessThan(0)
  })

  it('a igual prioridad, fecha más cercana primero', () => {
    const hoy = task({ due_date: '2026-08-27' })
    const manana = task({ due_date: '2026-08-28' })
    expect(compareTasks(hoy, manana)).toBeLessThan(0)
  })

  it('a igual prioridad y fecha, hora más temprana primero', () => {
    const temprano = task({ due_time: '08:00:00' })
    const tarde = task({ due_time: '18:00:00' })
    expect(compareTasks(temprano, tarde)).toBeLessThan(0)
  })

  it('con fecha va antes que sin fecha (desempate por null)', () => {
    const conFecha = task({ due_date: '2026-09-15' })
    const sinFecha = task({})
    expect(compareTasks(conFecha, sinFecha)).toBeLessThan(0)
  })
})

describe('buildTodaySections', () => {
  it('ordena secciones vencidas → hoy → próximas → sin fecha', () => {
    const sections = buildTodaySections(
      [
        task({ id: 'someday' }),
        task({ id: 'upcoming', due_date: '2026-09-10' }),
        task({ id: 'overdue', due_date: '2026-08-20', priority: 'low' }),
        task({ id: 'today', due_date: TODAY }),
        task({ id: 'completed', due_date: TODAY, status: 'completed' }),
      ],
      TODAY
    )
    // la completada se excluye
    const order = sections.map((s) => s.bucket)
    expect(order).toEqual(['overdue', 'today', 'upcoming', 'someday'])
    // buckets vacíos no aparecen
    expect(order).not.toContain(expect.stringMatching(/nada/))
  })

  it('dentro de "hoy": prioridad antes que hora', () => {
    const sections = buildTodaySections(
      [
        task({ id: 'baja-temprano', due_date: TODAY, due_time: '07:00', priority: 'low' }),
        task({ id: 'alta-tarde', due_date: TODAY, due_time: '20:00', priority: 'high' }),
      ],
      TODAY
    )
    expect(sections[0].tasks[0].id).toBe('alta-tarde')
  })

  it('excluye completadas e in_progress solo deja pendientes en secciones', () => {
    const sections = buildTodaySections(
      [
        task({ id: 'en-curso', status: 'in_progress', due_date: TODAY }),
        task({ id: 'hecha', status: 'completed', due_date: TODAY }),
      ],
      TODAY
    )
    const ids = sections.flatMap((s) => s.tasks.map((t) => t.id))
    expect(ids).toEqual(['en-curso'])
  })
})

describe('groupTasks', () => {
  it('modo priority crea grupos high/medium/low ordenados', () => {
    const groups = groupTasks(
      [task({ id: 'b', priority: 'low' }), task({ id: 'a', priority: 'high' })],
      'priority',
      TODAY
    )
    expect(groups.map((g) => g.key)).toEqual(['high', 'low'])
  })

  it('modo date agrupa por fecha con vencidas al frente', () => {
    const groups = groupTasks(
      [
        task({ id: 'x', due_date: '2026-09-02' }),
        task({ id: 'y', due_date: '2026-08-20' }), // vencida
      ],
      'date',
      TODAY
    )
    expect(groups[0].label).toContain('Vencida')
  })

  it('modo list agrupa por nombre de lista; sin lista = General', () => {
    const listsById = new Map([['l1', 'Casa']])
    const groups = groupTasks(
      [
        task({ id: 'c1', list_id: 'l1' }),
        task({ id: 'g1' }),
      ],
      'list',
      TODAY,
      listsById
    )
    const labels = groups.map((g) => g.label).sort()
    expect(labels).toEqual(['Casa', 'General'])
  })
})

describe('parseTags', () => {
  it('acepta comas, espacios y #, normaliza a minúsculas y deduplica', () => {
    expect(parseTags('Casa, Estudio  #URGENTE casa')).toEqual(['casa', 'estudio', 'urgente'])
  })

  it('filtra vacíos y limita cantidad y largo', () => {
    expect(parseTags(', , ,   ')).toEqual([])
    expect(parseTags(Array.from({ length: 12 }, (_, i) => `tag${i}`).join(','))).toHaveLength(8)
    expect(parseTags('x'.repeat(30))).toEqual([])
  })
})
