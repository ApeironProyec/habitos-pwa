import { useState } from 'react'
import { Plus, Pencil, Pause, Play, Trash2 } from 'lucide-react'
import { useHabits } from './useHabits'
import HabitFormModal from './HabitFormModal'
import { ConfirmDialog } from '@/components/Modal'
import { SkeletonList, EmptyState } from '@/components/Skeleton'
import * as repo from '@/lib/db/repo'
import { freqLabel } from './freqLabel'
import type { Habit } from '@/lib/habits/types'
import { cn } from '@/lib/utils'

export default function HabitsPage() {
  const { habits, loading } = useHabits()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Habit | null>(null)
  const [confirming, setConfirming] = useState<Habit | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function toggleActive(h: Habit) {
    setBusyId(h.id)
    try {
      await repo.setHabitActive(h.id, !h.is_active)
    } finally {
      setBusyId(null)
    }
  }

  async function confirmRemove() {
    if (!confirming) return
    const id = confirming.id
    setConfirming(null)
    setBusyId(id)
    try {
      await repo.deleteHabit(id)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <header className="fade-up flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-[var(--text-primary)]">Hábitos</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            {habits.length} {habits.length === 1 ? 'definido' : 'definidos'}
          </p>
        </div>
        <button
          onClick={() => {
            setEditing(null)
            setModalOpen(true)
          }}
          className="tap-strong flex items-center gap-1.5 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-700/25"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Nuevo
        </button>
      </header>

      {loading ? (
        <SkeletonList count={4} />
      ) : habits.length === 0 ? (
        <EmptyState
          title="Sin hábitos todavía."
          hint="Crea el primero con el botón «Nuevo» y aparecerá en tu día."
        />
      ) : (
        <ul className="space-y-2.5">
          {habits.map((h, idx) => (
            <li
              key={h.id}
              className={cn(
                'glass fade-up stagger t-fast flex items-center gap-3 p-3.5',
                !h.is_active && 'opacity-55',
                busyId === h.id && 'pulse-soft'
              )}
              style={{ '--i': idx } as React.CSSProperties}
            >
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg"
                style={{ backgroundColor: (h.color ?? '#6d28d9') + '33' }}
                aria-hidden="true"
              >
                {h.icon ?? '🎯'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-[var(--text-primary)]">{h.name}</p>
                <p className="truncate text-xs text-[var(--text-secondary)]">
                  {freqLabel(h)} · {h.is_active ? 'activo' : 'pausado'}
                  {h.target_value ? ` · meta ${h.target_value} ${h.unit ?? ''}`.trimEnd() : ''}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => {
                    setEditing(h)
                    setModalOpen(true)
                  }}
                  className="tap rounded-lg p-2 text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/10"
                  aria-label={`Editar ${h.name}`}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  onClick={() => toggleActive(h)}
                  disabled={busyId === h.id}
                  className="tap rounded-lg p-2 text-[var(--text-secondary)] hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
                  aria-label={h.is_active ? `Pausar ${h.name}` : `Reactivar ${h.name}`}
                >
                  {h.is_active ? (
                    <Pause className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Play className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
                <button
                  onClick={() => setConfirming(h)}
                  disabled={busyId === h.id}
                  className="tap rounded-lg p-2 text-[var(--text-secondary)] hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50"
                  aria-label={`Eliminar ${h.name}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {modalOpen && (
        <HabitFormModal
          habit={editing}
          onClose={() => {
            setModalOpen(false)
            setEditing(null)
          }}
          onSaved={() => {
            setModalOpen(false)
            setEditing(null)
          }}
        />
      )}

      {confirming && (
        <ConfirmDialog
          title="Eliminar hábito"
          message={`Se eliminará "${confirming.name}" y todo su historial. Esta acción no se puede deshacer.`}
          onConfirm={confirmRemove}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  )
}
