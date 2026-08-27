import { useEffect, useState } from 'react'
import { RefreshCw, WifiOff } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Avisos del ciclo de vida de la PWA.
 *
 * Con `registerType: 'prompt'` una versión nueva NO se activa sola: se instala
 * en segundo plano y espera. Eso importa en una app offline-first — recargar
 * sin avisar en medio de una escritura local puede dejar el outbox a medias.
 * El usuario decide cuándo aplicar.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Buscar versión nueva cada hora mientras la app siga abierta
      if (registration) {
        setInterval(() => void registration.update(), 60 * 60 * 1000)
      }
    },
  })

  const [dismissedOffline, setDismissedOffline] = useState(false)

  // El aviso de "listo sin conexión" se va solo; el de update se queda
  useEffect(() => {
    if (!offlineReady) return
    const id = setTimeout(() => setOfflineReady(false), 4000)
    return () => clearTimeout(id)
  }, [offlineReady, setOfflineReady])

  if (needRefresh) {
    return (
      <div className="fade-up fixed inset-x-3 bottom-24 z-50 mx-auto max-w-md">
        <div className="glass flex items-center gap-3 p-4 shadow-xl">
          <RefreshCw className="h-5 w-5 shrink-0 text-violet-500" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Nueva versión disponible</p>
            <p className="text-xs text-[var(--text-secondary)]">Tus datos no se pierden al actualizar.</p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button
              onClick={() => setNeedRefresh(false)}
              className="tap rounded-lg px-3 py-2 text-xs font-medium text-[var(--text-secondary)]"
            >
              Después
            </button>
            <button
              onClick={() => void updateServiceWorker(true)}
              className="tap-strong rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white"
            >
              Actualizar
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (offlineReady && !dismissedOffline) {
    return (
      <div className="fade-up fixed inset-x-3 bottom-24 z-50 mx-auto max-w-md">
        <button
          onClick={() => setDismissedOffline(true)}
          className="glass flex w-full items-center gap-3 p-3.5 text-left shadow-xl"
        >
          <WifiOff className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden="true" />
          <p className="text-sm font-medium text-[var(--text-primary)]">
            Lista para usar sin conexión
          </p>
        </button>
      </div>
    )
  }

  return null
}
