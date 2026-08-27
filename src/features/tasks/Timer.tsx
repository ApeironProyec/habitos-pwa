import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  /** Duración en minutos. Cambiarla reinicia el temporizador. */
  initialMinutes: number
  label?: string
  onComplete?: (minutesElapsed: number) => void
  onClose?: () => void
}

/**
 * Temporizador de cuenta regresiva.
 *
 * Cuenta contra `Date.now()` en lugar de acumular ticks. Dos motivos:
 *
 * 1. En una PWA en segundo plano el navegador estrangula `setInterval` — un
 *    temporizador basado en ticks se congela al minimizar y luego miente.
 *    Comparando con el reloj real, al volver muestra el tiempo correcto.
 * 2. No hay deriva acumulada por el retraso de cada tick.
 *
 * El callback `onComplete` se guarda en un ref para que no reinicie el
 * intervalo: antes era una arrow inline en el padre, así que cambiaba de
 * identidad en cada render y el efecto recreaba el `setInterval` cada segundo.
 */
export function Timer({ initialMinutes, label, onComplete, onClose }: Props) {
  const totalMs = Math.max(1, Math.round(initialMinutes * 60)) * 1000

  const [remainingMs, setRemainingMs] = useState(totalMs)
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)

  /** Instante en que debe terminar. `null` mientras está pausado. */
  const deadlineRef = useRef<number | null>(null)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  // Cambiar la duración reinicia por completo
  useEffect(() => {
    setRemainingMs(totalMs)
    setRunning(false)
    setFinished(false)
    deadlineRef.current = null
  }, [totalMs])

  useEffect(() => {
    if (!running) return

    if (deadlineRef.current === null) {
      deadlineRef.current = Date.now() + remainingMs
    }

    const tick = () => {
      const deadline = deadlineRef.current
      if (deadline === null) return
      const left = deadline - Date.now()

      if (left <= 0) {
        setRemainingMs(0)
        setRunning(false)
        setFinished(true)
        deadlineRef.current = null
        onCompleteRef.current?.(Math.round(totalMs / 60000))
        return
      }
      setRemainingMs(left)
    }

    // 250ms: el dígito de segundos cambia sin retraso perceptible
    const id = setInterval(tick, 250)
    tick()

    // Al volver de segundo plano, recalcular de inmediato
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // remainingMs queda fuera a propósito: se lee solo al arrancar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, totalMs])

  const toggle = useCallback(() => {
    setRunning((prev) => {
      if (prev) {
        // Pausa: congelar el tiempo restante
        const deadline = deadlineRef.current
        if (deadline !== null) setRemainingMs(Math.max(0, deadline - Date.now()))
        deadlineRef.current = null
        return false
      }
      if (finished) {
        setRemainingMs(totalMs)
        setFinished(false)
      }
      deadlineRef.current = null
      return true
    })
  }, [finished, totalMs])

  const reset = useCallback(() => {
    setRunning(false)
    setFinished(false)
    setRemainingMs(totalMs)
    deadlineRef.current = null
  }, [totalMs])

  const secondsLeft = Math.ceil(remainingMs / 1000)
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')
  const pct = totalMs === 0 ? 0 : (remainingMs / totalMs) * 100

  const R = 64
  const CIRC = 2 * Math.PI * R

  return (
    <div className="glass scale-in flex flex-col items-center p-5">
      <div className="mb-2 flex w-full items-center justify-between">
        {label ? (
          <p className="max-w-[220px] truncate text-sm font-medium text-[var(--text-secondary)]">{label}</p>
        ) : (
          <span />
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar temporizador"
            className="tap rounded-lg p-1 text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="relative mb-4 flex h-36 w-36 items-center justify-center">
        <svg className="h-36 w-36 -rotate-90" viewBox="0 0 144 144" aria-hidden="true">
          <circle
            cx="72"
            cy="72"
            r={R}
            fill="none"
            strokeWidth="8"
            className="stroke-black/10 dark:stroke-white/10"
          />
          <circle
            cx="72"
            cy="72"
            r={R}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - pct / 100)}
            className={cn(
              'transition-[stroke-dashoffset] duration-300 ease-linear',
              finished ? 'stroke-emerald-500' : 'stroke-violet-600 dark:stroke-violet-400'
            )}
          />
        </svg>
        <span
          className={cn(
            'absolute text-4xl font-bold tabular-nums',
            finished ? 'pop text-emerald-500' : 'text-[var(--text-primary)]'
          )}
          role="timer"
          aria-live="off"
        >
          {finished ? '✓' : `${mm}:${ss}`}
        </span>
      </div>

      {finished && (
        <p className="fade-in mb-3 text-sm font-medium text-emerald-600 dark:text-emerald-400">
          ¡Tiempo completado!
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={toggle}
          className={cn(
            'tap-strong flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow',
            running ? 'bg-amber-600' : 'bg-violet-700'
          )}
        >
          {running ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
          {running ? 'Pausar' : finished ? 'Repetir' : 'Iniciar'}
        </button>
        <button
          type="button"
          onClick={reset}
          className="tap flex items-center gap-1.5 rounded-xl bg-black/5 px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] dark:bg-white/10"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reiniciar
        </button>
      </div>
    </div>
  )
}
