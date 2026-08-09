import { useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  /** Duración inicial en minutos */
  initialMinutes: number
  /** Etiqueta (ej. nombre de tarea o 'Pomodoro') */
  label?: string
  /** Al terminar la cuenta regresiva */
  onComplete?: () => void
  onClose?: () => void
}

/**
 * Temporizador con cuenta regresiva: estilo pomodoro / foco en tarea.
 * Muestra mm:ss, permite pausar/reanudar/reiniciar.
 */
export function Timer({ initialMinutes, label, onComplete, onClose }: Props) {
  const [totalSeconds] = useState(initialMinutes * 60)
  const [remaining, setRemaining] = useState(initialMinutes * 60)
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!)
            setRunning(false)
            setFinished(true)
            onComplete?.()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [running, onComplete])

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
  const ss = String(remaining % 60).padStart(2, '0')
  const pct = totalSeconds === 0 ? 0 : (remaining / totalSeconds) * 100

  function reset() {
    setRunning(false)
    setFinished(false)
    setRemaining(totalSeconds)
  }

  return (
    <div className="flex flex-col items-center rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-100 dark:bg-zinc-900 dark:ring-zinc-800">
      <div className="mb-2 flex w-full items-center justify-between">
        {label ? (
          <p className="max-w-[220px] truncate text-sm font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
        ) : (
          <span />
        )}
        {onClose && (
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="relative mb-4 flex h-36 w-36 items-center justify-center">
        <svg className="h-36 w-36 -rotate-90" viewBox="0 0 144 144">
          <circle cx="72" cy="72" r="64" fill="none" strokeWidth="8" className="stroke-zinc-100 dark:stroke-zinc-800" />
          <circle
            cx="72"
            cy="72"
            r="64"
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 64}
            strokeDashoffset={2 * Math.PI * 64 * (1 - pct / 100)}
            className={cn('transition-all duration-1000', finished ? 'stroke-emerald-500' : 'stroke-violet-600 dark:stroke-violet-400')}
          />
        </svg>
        <span className={cn('absolute text-4xl font-bold tabular-nums', finished ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-900 dark:text-zinc-100')}>
          {finished ? '✓' : `${mm}:${ss}`}
        </span>
      </div>

      {finished && <p className="mb-3 text-sm font-medium text-emerald-600 dark:text-emerald-400">¡Tiempo completado!</p>}

      <div className="flex gap-2">
        <button
          onClick={() => setRunning((r) => !r)}
          className={cn(
            'flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow transition active:scale-95',
            running ? 'bg-amber-600' : 'bg-violet-700'
          )}
        >
          {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {running ? 'Pausar' : finished ? 'Repetir' : 'Iniciar'}
        </button>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 rounded-xl bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-200 active:scale-95 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          <RotateCcw className="h-4 w-4" /> Reiniciar
        </button>
      </div>
    </div>
  )
}
