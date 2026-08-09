# Hábitos — PWA

App de hábitos, tareas y foco (PWA mobile-first). React + TypeScript + Vite + Tailwind + Supabase.

## 🌐 Producción
**https://habitos-pwa-nu.vercel.app**

## ✨ Features
- **Hábitos** con 4 tipos de frecuencia: diario, varias veces al día, cada X horas, días específicos
  - Ocurrencias generadas on-demand (no persistidas hacia el futuro)
  - Completar / omitir / deshacer en 1-2 toques desde "Hoy"
- **Tareas** estilo Google Tasks:
  - CRUD completo: crear, editar, completar, eliminar, vencimiento
  - **Iniciar tarea con temporizador** (15/30/45/60 min) → al terminar suma los minutos invertidos
  - **Pomodoro** de 25 min con círculo de progreso
- **Estadísticas**: semanal/mensual, rachas, mejor racha, cumplimiento por hábito, gráfico de barras
- **Dark mode**: claro / oscuro / sistema (persistente en localStorage)
- **Auth**: email + contraseña (confirmación de correo) **o** Google OAuth
- **PWA**: instalable, service worker, offline básico

## 🧱 Stack
| Capa | Tecnología |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind v4 |
| Backend | Supabase (PostgreSQL + Auth + RLS) |
| Hosting | Vercel |
| Testing | Vitest |

## 🗄️ Base de datos (Supabase)
- `profiles` — perfil de usuario (creado automáticamente por trigger)
- `habits` — hábitos con `frequency_type` + `frequency_config` JSONB
- `habit_occurrences` — ocurrencias por fecha (unique: habit_id + scheduled_at)
- `tasks` — tareas con `spent_minutes` / `estimated_minutes` / `due_date`

Todas las tablas con RLS por `auth.uid() = user_id`.

## 🚀 Desarrollo
```bash
npm install
cp .env.local.example .env.local  # VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev
npm test       # 21 tests de lógica pura
npm run build
```

## 🔐 Google OAuth
- Credenciales: `G:/My Drive/Obsidian/Project I/Lia/memoria-largo-plazo/para/Resources/google-oauth-habitos.json`
- Redirect URI: `https://roqdwkpvstmtrsfdlxni.supabase.co/auth/v1/callback`
- Origen JS: `https://habitos-pwa-nu.vercel.app`

## 📦 Deploy
```bash
git push origin main   # GitHub ApeironProyec/habitos-pwa
vercel --prod --yes    # Vercel (apeironproyecs-projects/habitos-pwa)
```

---
v0.2.0 · 2026-08-09 · construida por Lia para Erick
