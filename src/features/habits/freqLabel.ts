import type { Habit } from '@/lib/habits/types'
import { timesOfDay, displayTime } from '@/lib/habits/frequency'

const DAY_LABELS = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

/**
 * Descripción legible de la frecuencia de un hábito.
 *
 * Vive en su propio módulo (antes se exportaba desde HabitsPage.tsx, lo que
 * rompía el fast refresh: un archivo que exporta componentes y utilidades
 * fuerza recarga completa en cada edición).
 */
export function freqLabel(h: Habit): string {
  const cfg = h.frequency_config ?? {}
  switch (h.frequency_type) {
    case 'daily':
      return `Cada día a las ${displayTime(cfg.start_time ?? '09:00')}`

    case 'multiple_daily': {
      const n = timesOfDay(h).length
      return `${n} ${n === 1 ? 'vez' : 'veces'} al día`
    }

    case 'interval':
      return `Cada ${cfg.interval_hours ?? 8} h`

    case 'weekly': {
      const days = (cfg.days_of_week ?? []).map((d) => DAY_LABELS[d] ?? '?')
      return days.length ? `Días: ${days.join(' ')}` : 'Semanal'
    }

    default:
      return h.frequency_type
  }
}
