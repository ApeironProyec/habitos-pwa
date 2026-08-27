import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY en .env')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    // La sesión vive en localStorage y se refresca sola: al abrir la PWA sin
    // conexión el usuario sigue dentro en lugar de rebotar al login.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'habitos-auth',
  },
  global: {
    headers: { 'x-client-info': 'habitos-pwa' },
  },
})
