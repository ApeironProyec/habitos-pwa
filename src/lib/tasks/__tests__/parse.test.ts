import { describe, it, expect } from 'vitest'
import { parseQuickTitle } from '../parse'

/**
 * "Hoy" fijo para tests: miércoles 2026-08-27, 14:30 local.
 * El parser usa métodos locales de Date (getHours/setDate), así que fijamos
 * la hora del reloj con vi.useFakeTimers anclada a esa fecha.
 */
const FAKE_NOW = new Date(2026, 7, 27, 14, 30, 0)

function at(input: string): ReturnType<typeof parseQuickTitle> {
  return parseQuickTitle(input, FAKE_NOW)
}

describe('ejemplos de Erick (los contratos del producto)', () => {
  it('"Comer comida mañana:4pm prioridad:alta #comida"', () => {
    const r = at('Comer comida mañana:4pm prioridad:alta #comida')
    expect(r.title).toBe('Comer comida')
    expect(r.due_date).toBe('2026-08-28') // mañana
    expect(r.due_time).toBe('16:00:00')
    expect(r.priority).toBe('high')
    expect(r.tags).toEqual(['comida'])
  })

  it('solo hora pasada → mañana ("escribo de noche para mañana")', () => {
    // 14:30 ahora; 2pm ya pasó → mañana
    const r = at('Llamar a René 2pm')
    expect(r.title).toBe('Llamar a René')
    expect(r.due_date).toBe('2026-08-28')
    expect(r.due_time).toBe('14:00:00')
  })

  it('solo hora pasada → mañana ("Salir a correr 6am" escrito a las 14:30)', () => {
    // 27-ago-2026 es JUEVES y son las 14:30; 6am ya pasó → viernes 28
    const r = at('Salir a correr 6am prioridad:alta')
    expect(r.due_date).toBe('2026-08-28')
    expect(r.due_time).toBe('06:00:00')
    expect(r.priority).toBe('high')
  })

  it('"hacer tarea hoy" → hoy sin hora', () => {
    const r = at('hacer tarea hoy')
    expect(r.title).toBe('hacer tarea')
    expect(r.due_date).toBe('2026-08-27')
    expect(r.due_time).toBeNull()
  })
})

describe('tags', () => {
  it('#tag se extrae, normaliza y deduplica', () => {
    const r = at('Comprar #Casa y #casa #estudio')
    expect(r.tags).toEqual(['casa', 'estudio'])
    expect(r.title).toBe('Comprar y')
  })

  it('tag con guión y números', () => {
    const r = at('Revisar #proyecto-2')
    expect(r.tags).toEqual(['proyecto-2'])
  })
})

describe('prioridad', () => {
  it('formato con dos puntos y sin ellos', () => {
    expect(at('X prioridad:baja').priority).toBe('low')
    expect(at('X prioridad media').priority).toBe('medium')
    expect(at('X !alta').priority).toBe('high')
  })

  it('sin prioridad → null (caller aplica default)', () => {
    expect(at('X').priority).toBeNull()
  })
})

describe('horas', () => {
  it('24h: 16:00 o 9:45', () => {
    expect(at('Y 16:00').due_time).toBe('16:00:00')
    expect(at('Y 9:45').due_time).toBe('09:45:00')
  })

  it('12h con minutos: 10:30am', () => {
    expect(at('Y 10:30am').due_time).toBe('10:30:00')
  })

  it('12h redonda: 8pm = 20:00', () => {
    const r = at('Y 8pm')
    expect(r.due_time).toBe('20:00:00')
  })

  it("hora 24h pasada → mañana ('quedo hasta las 1:00' escrito a las 14:30)", () => {
    const r = at('Dormir bien 1:00')
    expect(r.due_time).toBe('01:00:00')
    expect(r.due_date).toBe('2026-08-28')
  })

  it('con fecha explícita la regla de "ya pasó" NO aplica', () => {
    const r = at('Entregar mañana 9:00')
    expect(r.due_date).toBe('2026-08-28')
    expect(r.due_time).toBe('09:00:00')
  })
})

describe('fechas por palabra', () => {
  it('pasado mañana', () => {
    expect(at('Z pasado mañana').due_date).toBe('2026-08-29')
  })

  it('día de semana: próximo sábado', () => {
    // El fake now (27-ago) es JUEVES (day=4); sábado=6; diff=(6-4+7)%7=2 → sáb 29
    expect(at('Ir al mercado sabado').due_date).toBe('2026-08-29')
  })

  it('el lunes que viene dentro de esta semana? lunes=1 < hoy(3) → próxima semana', () => {
    expect(at('Reunión el lunes').due_date).toBe('2026-08-31')
  })

  it('hoy explícito con hora combinada', () => {
    const r = at('Cenar hoy:21:30')
    expect(r.due_date).toBe('2026-08-27')
    expect(r.due_time).toBe('21:30:00')
  })
})

describe('título limpio', () => {
  it('no deja espacios dobles ni comandos sueltos', () => {
    const r = at('  Comer   comida  mañana:4pm   prioridad:alta   #comida  ')
    expect(r.title).toBe('Comer comida')
  })

  it('sin comandos queda igual', () => {
    expect(at('Regar las plantas').title).toBe('Regar las plantas')
  })
})

describe('casos raros pero reales', () => {
  it('todo junto en desorden', () => {
    const r = at('#urgente 18:30 llamar banco prioridad alta')
    expect(r.title).toBe('llamar banco')
    expect(r.priority).toBe('high')
    expect(r.due_time).toBe('18:30:00')
    expect(r.due_date).toBe('2026-08-27') // 18:30 > 14:30 → hoy
    expect(r.tags).toEqual(['urgente'])
  })
})
