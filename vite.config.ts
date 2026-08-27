import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt' en lugar de 'autoUpdate': en una app offline-first no
      // queremos recargar sin avisar mientras hay escrituras locales en vuelo.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Hábitos',
        short_name: 'Hábitos',
        description: 'Crea y cumple tus hábitos diarios. Funciona sin conexión.',
        theme_color: '#6d28d9',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'es',
        categories: ['productivity', 'lifestyle', 'health'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Mi día', url: '/', description: 'Hábitos de hoy' },
          { name: 'Tareas', url: '/tasks', description: 'Lista de tareas' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // SPA: cualquier ruta desconocida sirve index.html desde caché,
        // así /stats abre sin red. Se excluyen las peticiones a la API.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/auth\/v1/, /^\/rest\/v1/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // Auth y datos NUNCA se cachean: los datos viven en IndexedDB y
            // servir un token o una fila obsoleta desde caché causa bugs raros.
            urlPattern: ({ url }) => /\/(auth|rest|realtime)\/v1\//.test(url.pathname),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ request }) => request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: {
        // Permite probar el comportamiento offline con `npm run dev`
        enabled: false,
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // Separa las dependencias grandes del código de la app: al desplegar
        // un cambio de UI, el chunk de vendor sigue en caché del usuario.
        // Forma de función: la de objeto ya no está tipada en Vite 8/Rolldown.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@supabase')) return 'vendor-supabase'
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('react-router') ||
            id.includes('scheduler')
          ) {
            return 'vendor-react'
          }
          return undefined
        },
      },
    },
  },
})
