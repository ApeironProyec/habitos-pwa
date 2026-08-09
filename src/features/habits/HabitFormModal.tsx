import { useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/features/auth/AuthContext'
import type { Habit, HabitInput, FrequencyType } from '@/lib/habits/types'
import type { Json } from '@/lib/supabase/database.types'
import { cn } from '@/lib/utils'

interface Props {
  habit: Habit | null
  onClose: () => void
  onSaved: () => void
}

const COLORS = ['#ede9fe', '#dcfce7', '#fef9c3', '#ffe4e6', '#e0f2fe', '#ffedd5']
const ICONS = ['🎯', '💪', '📚', '🧘', '💧', '🏃', '😴', '🥗', '✍️', '🎸', '💊', '🌅']

export default function HabitFormModal({ habit, onClose, onSaved }: Props) {
  const { user } = useAuth()
  const [name, setName] = useState(habit?.name ?? '')
  const [description, setDescription] = useState(habit?.description ?? '')
  const [frequencyType, setFrequencyType] = useState<FrequencyType>(habit?.frequency_type ?? 'daily')
  const [timesPerDay, setTimesPerDay] = useState(habit?.frequency_config?.times_per_day ?? 3)
  const [intervalHours, setIntervalHours] = useState(habit?.frequency_config?.interval_hours ?? 8)
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(habit?.frequency_config?.days_of_week ?? [1, 3, 5])
  const [startTime, setStartTime] = useState(habit?.frequency_config?.start_time ?? '08:00')
  const [color, setColor] = useState(habit?.color ?? COLORS[0])
  const [icon, setIcon] = useState(habit?.icon ?? ICONS[0])
  const [startDate, setStartDate] = useState(habit?.start_date ?? new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('El nombre es obligatorio')
      return
    }
    if (!user) return
    if (frequencyType === 'weekly' && daysOfWeek.length === 0) {
      setError('Elige al menos un día de la semana')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const input: HabitInput = {
        name: name.trim(),
        description: description.trim() || null,
        category: null,
        icon,
        color,
        frequency_type: frequencyType,
        frequency_config: buildConfig(frequencyType, { timesPerDay, intervalHours, daysOfWeek, startTime }) as unknown as Json,
        target_type: null,
        target_value: null,
        unit: null,
        start_date: startDate,
        end_date: null,
        is_active: true,
      }
      if (habit) {
        const { error } = await supabase.from('habits').update({ ...input, is_active: habit.is_active }).eq('id', habit.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('habits').insert({ ...input, user_id: user.id })
        if (error) throw error
      }
      onSaved()
    } catch (err) {
      console.error('Error guardando hábito:', err)
      const msg = err instanceof Error ? err.message : 'No se pudo guardar'
      // extraer mensaje del error de Supabase (PostgrestError)
      const detail = typeof err === 'object' && err !== null && 'details' in err ? String((err as { details?: unknown }).details ?? '') : ''
      setError(detail ? `${msg} — ${detail}` : msg)
    } finally {
      setSaving(false)
    }
  }

  function buildConfig(
    type: FrequencyType,
    v: { timesPerDay: number; intervalHours: number; daysOfWeek: number[]; startTime: string }
  ) {
    switch (type) {
      case 'daily':
        return { start_time: v.startTime || '09:00' }
      case 'multiple_daily':
        return { times_per_day: v.timesPerDay, start_time: v.startTime }
      case 'interval':
        return { interval_hours: v.intervalHours, start_time: v.startTime }
      case 'weekly':
        return { days_of_week: v.daysOfWeek, times_per_day: 1, start_time: v.startTime }
    }
  }

  const inputCls =
    'w-full rounded-xl border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-800 px-3.5 py-2.5 text-[15px] outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200'
  const labelCls = 'mb-1.5 block text-sm font-medium text-zinc-700'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-3xl bg-zinc-50 sm:rounded-3xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between p-5 pb-0">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{habit ? 'Editar hábito' : 'Nuevo hábito'}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 pt-3">
          <div>
            <label className={labelCls}>Nombre *</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Beber agua" autoFocus />
          </div>

          <div>
            <label className={labelCls}>Descripción (opcional)</label>
            <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalle breve" />
          </div>

          <div>
            <label className={labelCls}>Frecuencia</label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['daily', 'Cada día'],
                  ['multiple_daily', 'Varias veces al día'],
                  ['interval', 'Cada X horas'],
                  ['weekly', 'Días específicos'],
                ] as [FrequencyType, string][]
              ).map(([type, label]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFrequencyType(type)}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-sm font-medium transition',
                    frequencyType === type
                      ? 'border-violet-600 bg-violet-50 text-violet-800'
                      : 'border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-800 text-zinc-600'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {frequencyType === 'multiple_daily' && (
            <div>
              <label className={labelCls}>Veces al día</label>
              <div className="flex gap-2">
                {[2, 3, 4, 6, 8].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setTimesPerDay(n)}
                    className={cn(
                      'h-11 flex-1 rounded-xl border text-sm font-semibold transition',
                      timesPerDay === n ? 'border-violet-600 bg-violet-50 text-violet-800' : 'border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-800 text-zinc-600'
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {frequencyType === 'interval' && (
            <div>
              <label className={labelCls}>Cada cuántas horas</label>
              <div className="flex gap-2">
                {[2, 4, 6, 8, 12].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setIntervalHours(n)}
                    className={cn(
                      'h-11 flex-1 rounded-xl border text-sm font-semibold transition',
                      intervalHours === n ? 'border-violet-600 bg-violet-50 text-violet-800' : 'border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-800 text-zinc-600'
                    )}
                  >
                    {n}h
                  </button>
                ))}
              </div>
            </div>
          )}

          {frequencyType === 'weekly' && (
            <div>
              <label className={labelCls}>Días de la semana</label>
              <div className="flex gap-1.5">
                {['D', 'L', 'M', 'X', 'J', 'V', 'S'].map((d, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() =>
                      setDaysOfWeek((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort()))
                    }
                    className={cn(
                      'h-10 w-10 rounded-full border text-sm font-semibold transition',
                      daysOfWeek.includes(i) ? 'border-violet-600 bg-violet-600 text-white' : 'border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-800 text-zinc-500'
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Hora de inicio</label>
              <input type="time" className={inputCls} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Fecha de inicio</label>
              <input type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Color</label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn('h-9 w-9 rounded-full border-2 transition', color === c ? 'border-zinc-800 scale-110' : 'border-transparent')}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>Icono</label>
            <div className="flex flex-wrap gap-1.5">
              {ICONS.map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIcon(i)}
                  className={cn('flex h-9 w-9 items-center justify-center rounded-xl text-lg transition', icon === i ? 'bg-violet-100 ring-2 ring-violet-500' : 'bg-white ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700')}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          </div>

          <div className="border-t border-zinc-200 p-5 dark:border-zinc-800">
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-violet-700 py-3 text-[15px] font-semibold text-white shadow-lg shadow-violet-700/25 transition active:scale-[0.98] disabled:opacity-60"
            >
              {saving ? 'Guardando…' : habit ? 'Guardar cambios' : 'Crear hábito'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
