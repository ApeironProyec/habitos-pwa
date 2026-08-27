/**
 * Placeholders de carga.
 *
 * Sustituyen los textos "Cargando…" centrados: al llegar los datos el layout
 * ya tiene la forma correcta, así que nada salta. Como los datos vienen de
 * IndexedDB casi siempre se ven solo un frame, pero evitan el parpadeo.
 */

export function SkeletonCard() {
  return (
    <div className="glass p-4">
      <div className="flex items-center gap-3">
        <div className="skeleton h-11 w-11 shrink-0 rounded-xl" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-1/2" />
          <div className="skeleton h-3 w-1/3" />
        </div>
      </div>
    </div>
  )
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="fade-in stagger" style={{ '--i': i } as React.CSSProperties}>
          <SkeletonCard />
        </div>
      ))}
    </div>
  )
}

export function SkeletonStats() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Cargando estadísticas">
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="glass fade-in stagger p-4" style={{ '--i': i } as React.CSSProperties}>
            <div className="skeleton mb-2 h-3 w-2/3" />
            <div className="skeleton h-8 w-1/2" />
          </div>
        ))}
      </div>
      <div className="glass p-4">
        <div className="skeleton mb-3 h-4 w-1/3" />
        <div className="skeleton h-24 w-full" />
      </div>
    </div>
  )
}

/** Estado vacío con llamada a la acción. */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: React.ReactNode
}) {
  return (
    <div className="fade-up rounded-2xl border border-dashed border-[var(--card-border)] p-8 text-center">
      <p className="text-[15px] font-medium text-[var(--text-primary)]">{title}</p>
      {hint && <p className="mt-1 text-sm text-[var(--text-secondary)]">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
