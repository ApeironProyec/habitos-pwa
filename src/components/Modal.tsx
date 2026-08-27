import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  /** Contenido fijo al pie (ej. botón de guardar). */
  footer?: ReactNode
}

/**
 * Hoja modal accesible.
 *
 * Los modales anteriores eran divs con onClick: sin rol, sin cierre por
 * Escape, sin gestión de foco. Un lector de pantalla no anunciaba nada y el
 * teclado seguía navegando por detrás del overlay.
 */
export function Modal({ title, onClose, children, footer }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null

    // Enfocar el primer control del modal
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
      'input:not([disabled]), button:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    focusable?.[0]?.focus()

    // Bloquear el scroll del fondo mientras el modal está abierto
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      // Ciclo de foco dentro del modal
      const items = panelRef.current?.querySelectorAll<HTMLElement>(
        'input:not([disabled]), button:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (!items || items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
      previouslyFocused.current?.focus?.()
    }
  }, [onClose])

  return (
    <div
      className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="sheet-up flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-3xl bg-[var(--app-bg)] shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pb-1 pt-5">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="tap rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2 pt-2">{children}</div>

        {footer && (
          <div className="safe-bottom border-t border-[var(--card-border)] p-5">{footer}</div>
        )}
      </div>
    </div>
  )
}

/** Diálogo de confirmación, en lugar del `confirm()` nativo del navegador. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Eliminar',
  onConfirm,
  onCancel,
  destructive = true,
}: {
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
  destructive?: boolean
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="pb-2 text-[15px] leading-relaxed text-[var(--text-secondary)]">{message}</p>
      <div className="flex gap-2 pt-3">
        <button
          type="button"
          onClick={onCancel}
          className="tap flex-1 rounded-xl bg-black/5 py-3 text-[15px] font-semibold text-[var(--text-primary)] dark:bg-white/10"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`tap-strong flex-1 rounded-xl py-3 text-[15px] font-semibold text-white ${
            destructive ? 'bg-red-600' : 'bg-violet-700'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
