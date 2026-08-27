import type { TaskPriority } from '@/lib/habits/types'

/**
 * Parser de títulos inteligentes para creación rápida.
 *
 * Un título como "Comer comida mañana:4pm prioridad:alta #comida" produce
 * estructura de tarea real. Lo que no se menciona queda null y el caller
 * aplica sus defaults (prioridad media, sin fecha).
 *
 * Regla clave documentada para Erick: si escribes SOLO una hora ("2pm"),
 * es HOY a esa hora; si esa hora ya pasó, es MAÑANA — el mismo criterio
 * que usa cualquiera al dictar una tarea pendiente de noche.
 */

export interface ParsedQuickTask {
  /** Título limpio, sin los comandos interpretados. */
  title: string
  due_date: string | null // 'YYYY-MM-DD' local
  due_time: string | null // 'HH:mm:ss'
  priority: TaskPriority | null
  tags: string[]
}

/** Mapa de nombres de día → número (0 = domingo). Sin tildes tras normalizar. */
const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  dom: 0,
  lunes: 1,
  lun: 1,
  martes: 2,
  mar: 2,
  miercoles: 3,
  mie: 3,
  jueves: 4,
  jue: 4,
  viernes: 5,
  vie: 5,
  sabado: 6,
  sab: 6,
}

function toLocalYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

function shiftDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

/** Convierte (h, m, am|pm|undefined) a 'HH:mm:ss' según reglas de 12/24h. */
function buildTime(hour: number, minute: number, meridiem?: string): string | null {
  let h = hour
  const m = Number.isFinite(minute) ? minute : 0
  if (meridiem === 'pm' || meridiem === 'PM') {
    if (h >= 1 && h <= 11) h += 12
    else if (h === 12) h = 12
  } else if (meridiem === 'am' || meridiem === 'AM') {
    if (h === 12) h = 0
  }
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

/**
 * Interpreta un título libre.
 *
 * @param input Texto crudo escrito por el usuario
 * @param now   Momento de referencia para resolver hoy/mañana/inyectable en tests
 */
export function parseQuickTitle(input: string, now: Date = new Date()): ParsedQuickTask {
  const result: ParsedQuickTask = {
    title: '',
    due_date: null,
    due_time: null,
    priority: null,
    tags: [],
  }

  let text = input

  // ---- 1. TAGS: #palabra ----
  text = text.replace(/#([\p{L}\p{N}_-]{1,24})/gu, (_m, tag: string) => {
    result.tags.push(tag.toLowerCase())
    return ' '
  })
  result.tags = [...new Set(result.tags)].slice(0, 8)

  // ---- 2. PRIORIDAD: "prioridad:alta" o "prioridad alta" ----
  text = text.replace(/\bprioridad\s*:?\s*(alta|media|baja)\b/i, (_m, p: string) => {
    const norm = p.toLowerCase()
    result.priority = norm === 'alta' ? 'high' : norm === 'media' ? 'medium' : 'low'
    return ' '
  })
  // forma corta "!alta" (también "!urgentísima" no matchea, solo las tres)
  text = text.replace(/(^|\s)!(alta|media|baja)\b/i, (_m, sp: string, p: string) => {
    const norm = p.toLowerCase()
    result.priority ??= norm === 'alta' ? 'high' : norm === 'media' ? 'medium' : 'low'
    return sp
  })

  // ---- 3. FECHA PALABRA + HORA COMPACTA: "mañana:4pm", "hoy:16:00" ----
  const DATE_WORD = String.raw`pasado\s+ma[nñ]ana|ma[nñ]ana|hoy|lunes|lun|martes|mar|mi[eé]rcoles|jueves|jue|viernes|vie|s[áa]bado|domingo`
  const TIME_PART = String.raw`(\d{1,2})(?::(\d{2}))?\s*(am|pm)?`

  const comboRe = new RegExp(
    String.raw`\b(${DATE_WORD})\s*:\s*${TIME_PART}\b`,
    'iu'
  )
  const comboMatch = text.match(comboRe)
  if (comboMatch) {
    const [full, dateWord, hourS, minS, meridiem] = comboMatch
    result.due_date = resolveDateWord(dateWord, now)
    result.due_time = buildTime(Number(hourS), Number(minS ?? 0), meridiem?.toLowerCase())
    text = text.replace(full, ' ')
  }

  // ---- 4. FECHA SUELTA ----
  if (!result.due_date) {
    const relRe = /\b(pasado\s+ma[nñ]ana|ma[nñ]ana|hoy)\b/iu
    const relMatch = text.match(relRe)
    if (relMatch) {
      result.due_date = resolveDateWord(relMatch[1], now)
      text = text.replace(relMatch[0], ' ')
    } else {
      // "el lunes", "sábado", "miercoles"
      const dowRe = new RegExp(String.raw`\b(?:el\s+)?(${DATE_WORD})\b`, 'iu')
      const dowMatch = text.match(dowRe)
      if (dowMatch && WEEKDAYS[fold(dowMatch[1])] !== undefined) {
        const target = WEEKDAYS[fold(dowMatch[1])]
        const base = new Date(now)
        const diff = (target - base.getDay() + 7) % 7 // hoy mismo cuenta
        result.due_date = toLocalYMD(shiftDays(base, diff))
        text = text.replace(dowMatch[0], ' ')
      }
    }
  }

  // ---- 5. HORA SUELTA (sin fecha explícita → hoy, o mañana si ya pasó) ----
  if (!result.due_time) {
    // 24h: "16:00", "9:45"  |  12h con sufijo: "4pm", "10:30 am", "6am"
    const t24 = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)
    const t12 = text.match(/\b(?:a\s*las\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)

    if (t24) {
      result.due_time = buildTime(Number(t24[1]), Number(t24[2]))
      text = text.replace(t24[0], ' ')
    } else if (t12) {
      result.due_time = buildTime(Number(t12[1]), Number(t12[2] ?? 0), t12[3].toLowerCase())
      text = text.replace(t12[0], ' ')
    }

    if (result.due_time && !result.due_date) {
      const nowHM = now.getHours() * 60 + now.getMinutes()
      const [th, tm] = result.due_time.split(':').map(Number)
      const targetHM = th * 60 + tm
      // La hora escrita ya pasó hoy → se entiende para mañana
      result.due_date = toLocalYMD(targetHM < nowHM ? shiftDays(now, 1) : now)
    }
  }

  // ---- 6. Título: colapsar espacios sobrantes ----
  result.title = text.replace(/\s+/g, ' ').trim().replace(/^[-:,.;]+\s*/, '').trim()

  return result
}

/** Resuelve hoy / mañana / pasado mañana / día de semana a YYYY-MM-DD. */
function resolveDateWord(word: string, now: Date): string {
  const w = fold(word)
  if (w === 'hoy') return toLocalYMD(now)
  if (w.startsWith('pasado')) return toLocalYMD(shiftDays(now, 2))
  if (w.startsWith('ma')) return toLocalYMD(shiftDays(now, 1)) // mañana
  const dow = WEEKDAYS[w]
  if (dow !== undefined) {
    const diff = (dow - now.getDay() + 7) % 7
    return toLocalYMD(shiftDays(now, diff))
  }
  return toLocalYMD(now)
}

/** Quita tildes/minúsculas solo para comparar contra diccionarios. */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}
