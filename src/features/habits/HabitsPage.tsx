import { useState } from 'react'
import { Plus, Pencil, Pause, Play, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useHabits } from './useHabits'
import type { Habit } from '@/lib/habits/types'
import HabitFormModal from './HabitFormModal'
import { cn } from '@/lib/utils'

export default function HabitsPage() {
  const { habits, loading, reload } = useHabits()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Habit | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function toggleActive(h: Habit) {
    setBusyId(h.id)
    try {
      await supabase.from('habits').update({ is_active: !h.is_active }).eq('id', h.id)
      await reload()
    } finally {
      setBusyId(null)
    }
  }

  async function remove(h: Habit) {
    if (!confirm(`¿Eliminar el hábito "${h.name}"? Se borrará su historial.`)) return
    setBusyId(h.id)
    try {
      await supabase.from('habits').delete().eq('id', h.id)
      await reload()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 dark:text-zinc-100">Hábitos</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{habits.length} definidos</p>
        </div>
        <button
          onClick={() => { setEditing(null); setModalOpen(true) }}
          className="flex items-center gap-1.5 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-700/25 transition active:scale-95"
        >
          <Plus className="h-4 w-4" /> Nuevo
        </button>
      </header>

      {loading ? (
        <p className="pt-10 text-center text-sm text-zinc-400 dark:text-zinc-500 dark:text-zinc-400">Cargando…</p>
      ) : habits.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Sin hábitos todavía. Crea el primero con el botón «Nuevo».
        </div>
      ) : (
        <ul className="space-y-2.5">
          {habits.map((h) => (
            <li
              key={h.id}
              className={cn(
                'flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-zinc-100 dark:ring-zinc-800 transition',
                !h.is_active && 'opacity-55'
              )}
            >
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg"
                style={{ backgroundColor: h.color ?? '#ede9fe' }}
              >
                {h.icon ?? '🎯'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-zinc-900 dark:text-zinc-100 dark:text-zinc-100">{h.name}</p>
                <p className="truncate text-xs text-zinc-400 dark:text-zinc-500 dark:text-zinc-400">
                  {freqLabel(h)} · {h.is_active ? 'activo' : 'pausado'}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => { setEditing(h); setModalOpen(true) }}
                  className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-100 dark:bg-zinc-800 hover:text-zinc-700"
                  title="Editar"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => toggleActive(h)}
                  disabled={busyId === h.id}
                  className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-100 dark:bg-zinc-800 hover:text-violet-700 disabled:opacity-50"
                  title={h.is_active ? 'Pausar' : 'Reactivar'}
                >
                  {h.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => remove(h)}
                  disabled={busyId === h.id}
                  className="rounded-lg p-2 text-zinc-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  title="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {modalOpen && (
        <HabitFormModal
          habit={editing}
          onClose={() => { setModalOpen(false); setEditing(null) }}
          onSaved={async () => { setModalOpen(false); setEditing(null); await reload() }}
        />
      )}
    </div>
  )
}

export function freqLabel(h: Habit): string {
  const cfg = h.frequency_config ?? {}
  switch (h.frequency_type) {
    case 'daily':
      return '1 vez al día'
    case 'multiple_daily': {
      const n = cfg.times?.length ?? cfg.times_per_day ?? 1
      return `${n} veces al día`
    }
    case 'interval':
      return `Cada ${cfg.interval_hours ?? 8} h`
    case 'weekly': {
      const days = (cfg.days_of_week ?? []).map((d) => ['D', 'L', 'M', 'X', 'J', 'V', 'S'][d] ?? '?')
      return days.length ? `Días: ${days.join(' ')}` : 'Semanal'
    }
    default:
      return h.frequency_type
  }
}
