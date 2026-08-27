import { useState } from 'react'
import { useAuth } from '@/features/auth/useAuth'
import { Modal } from '@/components/Modal'
import * as repo from '@/lib/db/repo'
import { timesOfDay, displayTime, todayStr } from '@/lib/habits/frequency'
import type { Habit, FrequencyType, FrequencyConfig, TargetType } from '@/lib/habits/types'
import { cn } from '@/lib/utils'

interface Props {
  habit: Habit | null
  onClose: () => void
  onSaved: () => void
}

/** Colores con suficiente contraste en ambos temas (los pasteles se perdían en dark). */
const COLORS = ['#8b5cf6', '#22c55e', '#eab308', '#f43f5e', '#0ea5e9', '#f97316']
const ICONS = ['🎯', '💪', '📚', '🧘', '💧', '🏃', '😴', '🥗', '✍️', '🎸', '💊', '🌅']
const DAY_LABELS = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

const TARGETS: { value: TargetType | ''; label: string; unit: string }[] = [
  { value: '', label: 'Sin meta', unit: '' },
  { value: 'count', label: 'Cantidad', unit: 'veces' },
  { value: 'duration_minutes', label: 'Duración', unit: 'min' },
  { value: 'repetitions', label: 'Repeticiones', unit: 'reps' },
]

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
  const [startDate, setStartDate] = useState(habit?.start_date ?? todayStr())
  const [endDate, setEndDate] = useState(habit?.end_date ?? '')
  const [targetType, setTargetType] = useState<TargetType | ''>(habit?.target_type ?? '')
  const [targetValue, setTargetValue] = useState<string>(
    habit?.target_value != null ? String(habit.target_value) : ''
  )
  const [unit, setUnit] = useState(habit?.unit ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const config = buildConfig(frequencyType, { timesPerDay, intervalHours, daysOfWeek, startTime })
  // Vista previa de los horarios reales: hace visible el efecto de la config
  const preview = timesOfDay({ frequency_type: frequencyType, frequency_config: config })

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim()) return setError('El nombre es obligatorio')
    if (!user) return setError('Sin sesión activa')
    if (frequencyType === 'weekly' && daysOfWeek.length === 0) {
      return setError('Elige al menos un día de la semana')
    }
    if (endDate && endDate < startDate) {
      return setError('La fecha de fin no puede ser anterior al inicio')
    }
    if (targetType && (!targetValue || Number(targetValue) <= 0)) {
      return setError('Indica un valor de meta mayor que cero')
    }

    setSaving(true)
    try {
      const input = {
        name: name.trim(),
        description: description.trim() || null,
        category: null,
        icon,
        color,
        frequency_type: frequencyType,
        frequency_config: config,
        target_type: targetType || null,
        target_value: targetType ? Number(targetValue) : null,
        unit: targetType ? unit.trim() || defaultUnit(targetType) : null,
        start_date: startDate,
        end_date: endDate || null,
        is_active: habit?.is_active ?? true,
      }

      if (habit) {
        await repo.updateHabit(habit.id, input)
      } else {
        await repo.createHabit(input, user.id)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    'w-full rounded-xl border border-[var(--card-border)] bg-black/[0.03] px-3.5 py-2.5 text-[15px] text-[var(--text-primary)] outline-none t-fast focus:border-violet-500 focus:ring-2 focus:ring-violet-500/25 dark:bg-white/[0.06]'
  // Antes: 'text-zinc-700' sin variante dark → labels invisibles en modo oscuro
  const labelCls = 'mb-1.5 block text-sm font-medium text-[var(--text-primary)]'
  const chipCls = (active: boolean) =>
    cn(
      'tap rounded-xl border px-3 py-2.5 text-sm font-medium',
      active
        ? 'border-violet-500 bg-violet-500/15 text-violet-700 dark:text-violet-300'
        : 'border-[var(--card-border)] text-[var(--text-secondary)]'
    )

  return (
    <Modal
      title={habit ? 'Editar hábito' : 'Nuevo hábito'}
      onClose={onClose}
      footer={
        <button
          type="submit"
          form="habit-form"
          disabled={saving}
          className="tap-strong w-full rounded-xl bg-violet-700 py-3 text-[15px] font-semibold text-white shadow-lg shadow-violet-700/25 disabled:opacity-60"
        >
          {saving ? 'Guardando…' : habit ? 'Guardar cambios' : 'Crear hábito'}
        </button>
      }
    >
      <form id="habit-form" onSubmit={save} className="space-y-4 pb-2">
        <div>
          <label className={labelCls} htmlFor="habit-name">
            Nombre *
          </label>
          <input
            id="habit-name"
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Beber agua"
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="habit-desc">
            Descripción (opcional)
          </label>
          <input
            id="habit-desc"
            className={inputCls}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detalle breve"
          />
        </div>

        <fieldset>
          <legend className={labelCls}>Frecuencia</legend>
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
                aria-pressed={frequencyType === type}
                className={chipCls(frequencyType === type)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        {frequencyType === 'multiple_daily' && (
          <fieldset className="fade-in">
            <legend className={labelCls}>Veces al día</legend>
            <div className="flex gap-2">
              {[2, 3, 4, 6, 8].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setTimesPerDay(n)}
                  aria-pressed={timesPerDay === n}
                  className={cn('h-11 flex-1', chipCls(timesPerDay === n))}
                >
                  {n}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {frequencyType === 'interval' && (
          <fieldset className="fade-in">
            <legend className={labelCls}>Cada cuántas horas</legend>
            <div className="flex gap-2">
              {[2, 4, 6, 8, 12].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setIntervalHours(n)}
                  aria-pressed={intervalHours === n}
                  className={cn('h-11 flex-1', chipCls(intervalHours === n))}
                >
                  {n}h
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {frequencyType === 'weekly' && (
          <fieldset className="fade-in">
            <legend className={labelCls}>Días de la semana</legend>
            <div className="flex gap-1.5">
              {DAY_LABELS.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() =>
                    setDaysOfWeek((prev) =>
                      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort()
                    )
                  }
                  aria-pressed={daysOfWeek.includes(i)}
                  aria-label={['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][i]}
                  className={cn(
                    'tap h-10 w-10 rounded-full border text-sm font-semibold',
                    daysOfWeek.includes(i)
                      ? 'border-violet-600 bg-violet-600 text-white'
                      : 'border-[var(--card-border)] text-[var(--text-secondary)]'
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <div>
          <label className={labelCls} htmlFor="habit-start-time">
            Hora de inicio
          </label>
          <input
            id="habit-start-time"
            type="time"
            className={inputCls}
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
          {preview.length > 0 && (
            <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
              Horarios: <span className="tabular-nums">{preview.map(displayTime).join(' · ')}</span>
            </p>
          )}
        </div>

        {/* Metas: existían en el esquema pero la UI nunca las escribía */}
        <fieldset>
          <legend className={labelCls}>Meta (opcional)</legend>
          <div className="grid grid-cols-2 gap-2">
            {TARGETS.map((t) => (
              <button
                key={t.value || 'none'}
                type="button"
                onClick={() => {
                  setTargetType(t.value)
                  if (t.value && !unit) setUnit(t.unit)
                }}
                aria-pressed={targetType === t.value}
                className={chipCls(targetType === t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {targetType && (
            <div className="fade-in mt-2 grid grid-cols-2 gap-2">
              <input
                className={inputCls}
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                placeholder="Cantidad"
                aria-label="Valor de la meta"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
              />
              <input
                className={inputCls}
                placeholder={defaultUnit(targetType)}
                aria-label="Unidad"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
            </div>
          )}
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="habit-start">
              Fecha de inicio
            </label>
            <input
              id="habit-start"
              type="date"
              className={inputCls}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="habit-end">
              Fin (opcional)
            </label>
            <input
              id="habit-end"
              type="date"
              className={inputCls}
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <fieldset>
          <legend className={labelCls}>Color</legend>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
                aria-pressed={color === c}
                className={cn(
                  't-fast h-9 w-9 rounded-full border-2',
                  color === c ? 'scale-110 border-[var(--text-primary)]' : 'border-transparent'
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className={labelCls}>Icono</legend>
          <div className="flex flex-wrap gap-1.5">
            {ICONS.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIcon(i)}
                aria-label={`Icono ${i}`}
                aria-pressed={icon === i}
                className={cn(
                  'tap flex h-9 w-9 items-center justify-center rounded-xl text-lg',
                  icon === i ? 'bg-violet-500/20 ring-2 ring-violet-500' : 'bg-black/5 dark:bg-white/10'
                )}
              >
                {i}
              </button>
            ))}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="fade-in rounded-xl bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}

function buildConfig(
  type: FrequencyType,
  v: { timesPerDay: number; intervalHours: number; daysOfWeek: number[]; startTime: string }
): FrequencyConfig {
  const start = v.startTime || '09:00'
  switch (type) {
    case 'daily':
      return { start_time: start }
    case 'multiple_daily':
      return { times_per_day: v.timesPerDay, start_time: start }
    case 'interval':
      return { interval_hours: v.intervalHours, start_time: start }
    case 'weekly':
      return { days_of_week: v.daysOfWeek, times_per_day: 1, start_time: start }
  }
}

function defaultUnit(t: TargetType): string {
  return TARGETS.find((x) => x.value === t)?.unit ?? ''
}
