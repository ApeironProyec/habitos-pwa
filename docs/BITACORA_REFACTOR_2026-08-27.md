# Bitácora — Refactor Offline-First · 27 ago 2026

Registro completo de la sesión de análisis profundo + refactor mayor de habitos-pwa.
Sirve para retomar el trabajo exactamente donde quedó. Todo lo marcado ✅ fue **ejecutado y
verificado con output real**; lo marcado ⏳ está escrito pero **sin compilar/verificar**;
lo marcado ⬜ ni se ha empezado.

---

## 0. Contexto del estado inicial

Análisis del código pre-refactor (commit `33403ac`, "rediseño premium dark"):
build limpio, 21 tests pasando, lint con 3 warnings de fast-refresh.

Problemas encontrados y clasificados:

| # | Problema | Gravedad |
|---|----------|----------|
| 1 | Timestamps naive (`${date}T${time}:00`) escritos en columna `timestamptz`. Postgres los interpretaba en UTC: un hábito de 08:00 quedaba a las 04:00 de Bolivia. Invisible porque `TodayPage.slice(11,16)` leía el string crudo | 🔴 Crítico |
| 2 | Policies UPDATE sin `with check`: cualquier usuario podía `set user_id = <otro>` en sus filas y transferirlas a otra cuenta | 🔴 Seguridad |
| 3 | `occurrences_insert_own` no validaba ownership del `habit_id` | 🔴 Seguridad |
| 4 | Seed de ocurrencias incluía hábitos **pausados**; además corría un upsert a Supabase en cada montaje | 🟠 |
| 5 | `timerMinutes` decorativo: `startTask()` hardcodeaba 30 min | 🟡 |
| 6 | `start_time` ignorado en `multiple_daily` (repartía desde 00:00) | 🟡 |
| 7 | Timer: intervalo recreado cada segundo (onComplete inline cambiaba identidad) + drift acumulado + congelaba al minimizar | 🟠 |
| 8 | `StatisticsPage` catch vacío → pantalla colgada en "Calculando…" para siempre si fallaba | 🟠 |
| 9 | Labels dark mode invisibles (`text-zinc-700` sin variante dark) | 🟡 |
| 10 | Race en `addSpentMinutes` (leía estado React, escribía suma) | 🟠 |
| 11 | `bestStreak`/`dailyTotals` reconstruían el Map de índice dentro del loop: 3.650 Maps/render con 10 hábitos | ⚪ Perf |
| 12 | Metas (`target_type/value/unit`), `end_date`, `estimated_minutes`: en esquema pero sin UI | 🟡 Feature hueca |
| 13 | Modales sin accesibilidad (sin rol/focus trap/Escape), `confirm()` nativo | 🟡 |
| 14 | Sin notificaciones (la app no recuerda nada — pendiente, ver §6) | ⬜ |

---

## 1. ✅ Base de datos — migración APLICADA y VERIFICADA

Archivo: `supabase/migrations/20260827010000_offline_sync_and_rls_hardening.sql`

### Proceso (hubo incidentes que conviene conocer)
1. MCP de Supabase (`mcp__supabase__*`) falló con timeout: "MCP stdio subprocess exited".
   No confiar en esa vía hasta revisar el servidor.
2. Alternativa usada: CLI `npx supabase` con credenciales de `.env.local`
   (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`).
3. `db push` inicial falló: historial de migraciones remoto VACÍO aunque el esquema existía.
   Fix: `supabase migration repair --status applied 20260808230000` y `... 20260809220000`,
   luego `db push --yes`. Quedó linkado (`supabase link --project-ref ...`).
4. Proyecto destino: DEV `roqdwkpvstmtrsfdlxni` (habitos-pwa-dev).

### Cambios de esquema
```sql
-- Soft delete (requisito para propagar borrados entre dispositivos)
alter table habits/habit_occurrences/tasks add column deleted_at timestamptz;

-- scheduled_at timestamptz → scheduled_date date + scheduled_time time
-- Backfill interpretando los valores viejos COMO UTC (así se habían escrito):
--   set scheduled_date = (scheduled_at at time zone 'UTC')::date, ...
-- Filas irrecuperables eliminadas; constraint nueva:
--   unique (habit_id, scheduled_date, scheduled_time)  [habit_occurrences_habit_slot_key]
alter table habit_occurrences drop column scheduled_at;

-- Zona horaria del hábito (para futuras notificaciones correctas)
alter table habits add column timezone text not null default 'America/La_Paz';

-- Índices para pull incremental
idx_habits_user_updated, idx_occurrences_user_updated, idx_tasks_user_updated (user_id, updated_at)
idx_occurrences_user_date, idx_occurrences_habit_date

-- RLS endurecido
profiles_update_own, habits_update_own, tasks_update_own
  for update using (auth.uid() = ...) with check (auth.uid() = ...)
occurrences_insert_own / occurrences_update_own
  with check (... and exists (select 1 from habits h where h.id = habit_id and h.user_id = auth.uid()))

-- RPC atómico (arregla la condición de carrera de minutos trabajados)
create function public.add_task_minutes(p_task_id uuid, p_minutes integer) returns integer
security invoker → update tasks set spent_minutes = spent_minutes + greatest(0, p_minutes)
where id = p_task_id and user_id = auth.uid() returning spent_minutes;
grant execute to authenticated;
```

### Verificación real (REST con service role)
- Ocurrencia migrada: `{"scheduled_date":"2026-08-09","scheduled_time":"08:00:00"}`
  → la hora de pared se preservó (antes era `2026-08-09T08:00:00+00:00` = 04:00 Bolivia). ✔
- Habits traen `timezone: America/La_Paz`, `deleted_at: null`. ✔
- RPC existe: responde 400 con service-role (`auth.uid()` null) — comportamiento correcto. ✔
- `database.types.ts` REGENERADO con `supabase gen types typescript` (incluye add_task_minutes,
  PostgrestVersion 14.17). ⚠️ Regenerarlo tras cada migración futura.

---

## 2. ✅ Arquitectura offline-first (archivos NUEVOS)

> Principio: ninguna pantalla llama a Supabase directamente. Toda lectura sale de IndexedDB,
> toda escritura pasa por `repo.ts`. El sync es un servicio invisible aparte.

| Archivo | Rol | Decisiones clave |
|---------|-----|------------------|
| `src/lib/db/idb.ts` | Wrapper IndexedDB sin dependencias (~1.5 KB vs 12 KB de dexie) | Stores: `habits`, `occurrences`, `tasks`, `outbox` (autoincr `seq`), `meta`. Índice único `slot = [habit_id, scheduled_date, scheduled_time]` para dedupe. `idbPutMany` escribe N filas en 1 transacción. `wipeLocal()` limpia todo. |
| `src/lib/db/outbox.ts` | Cola durable de mutaciones | IDs UUID v4 generados en CLIENTE (`newId()`) → no hay reconciliación de referencias. Colapso de mutaciones por fila: insert+update→insert fusionado; insert+delete→nada; update+update→update fusionado; *+delete→delete. `MAX_ATTEMPTS = 6`. `markFailed()` guarda last_error. |
| `src/lib/db/repo.ts` | Única puerta de lectura/escritura | Lecturas: `listHabits/listTasks/listOccurrences(from,to)/listOccurrencesForDate` (filtran `deleted_at`). Escrituras: create/update/delete de habits y tasks, `ensureOccurrences` (solo activos, crea solo faltantes), `setOccurrenceStatus` (optimista en hooks), `pruneStaleOccurrences` (al cambiar frecuencia borra SOLO pending futuros inválidos), `addTaskMinutes` acumula como DELTA en outbox (`__minutes_delta`). Serialización `serialize*` hacia servidor. |
| `src/lib/db/sync.ts` | Motor push/pull | `sync()` = pushOutbox → pullChanges(user) → setSyncState(idle). Reentrante (si corre, encola 1 repetición). Push: procesa outbox en orden; entries con attempts≥MAX se descartan (poison); `isOnline()==false` corta el bucle sin quemar intentos. Insert va como UPSERT onConflict:id (idempotente). Update NO envía id. Minutos viajan por RPC atómico. Delete = soft (`deleted_at` server-side). Pull: cursores por tabla en meta (`cursor:*`), filtro `updated_at > cursor`, order asc, página 500, máx 20 páginas. Merge LWW: fila local gana SOLO si su `updated_at >` remota (cambio local sin subir). `normalizeRow` normaliza 'HH:mm:ss'. Triggers: window online/offline, document visibilitychange→visible, setInterval 60s, primer arranque. `localOwner/setLocalOwner` para detectar cambio de cuenta. |
| `src/lib/db/events.ts` | Bus local + estado UI | `onDataChanged(scope)` + `emitDataChanged('habits'|'occurrences'|'tasks')`. `SyncState { status: idle\|syncing\|offline\|error, pending, lastSyncAt, error }` con `onSyncStateChange`. |
| `src/features/sync/SyncProvider.tsx` | Bootstrap del sync | Al loguearse: compara `localOwner`; si hay datos de OTRO usuario → `wipeLocal()+resetCursors()`. Arranca `startSync()`. Expone `{ ...state, syncNow }`. Hook separado en `useSync.ts` (fast refresh). |
| `src/features/sync/SyncBadge.tsx` | Indicador visual | Flotante arriba; OCULTO cuando idle y pending=0. Muestra "Sin conexión · N por subir" / "Sincronizando…" (spinner) / "Error al sincronizar" / "N cambios por subir". Click = syncNow. `aria-live="polite"`. |
| `src/lib/supabase/client.ts` | Cliente reforzado | `persistSession: true, autoRefreshToken: true, storageKey: 'habitos-auth'` → el login sobrevive abrir la PWA sin conexión. Header x-client-info. |

**Conflicto elegido**: Last-Write-Wins por `updated_at` (1 usuario multi-dispositivo, sin edición
concurrente real). Excepción deliberada: minutos trabajados viajan como DELTA sumándose
atómicamente (nunca se pisan).

---

## 3. ✅ Modelo temporal (mató el bug #1 de raíz)

`src/lib/habits/frequency.ts` REESCRITO COMPLETO:

- `normalizeTime(time)` → siempre `'HH:mm:ss'` (formato Postgres `time`); `displayTime()` → `'HH:mm'`.
- `slotsForDate(habit, date)` → `[{date, time}]`, nunca timestamps.
- `slotKey(habitId, date, time)` para dedupe/indexación estable.
- `timesOfDay()` CORREGIDO: `multiple_daily` respeta `start_time`
  (`spreadFromStart`: reparte desde la hora de inicio hasta ~22:00; antes: 00:00+24/N),
  horas explícitas (`cfg.times`) se normalizan y ORDENAN sin duplicados,
  `interval` espacia desde start sin cruzar medianoche, clamp 1–24h (default 8).
- `dayOfWeek(date)` por aritmética UTC (0=domingo) — sin depender del huso.
- `shiftDate/daysBetween/dateRange` aritmética pura UTC — inmunes a DST/offsets.
  (Elimina la inconsistencia vieja entre shiftDate/toYMD.)
- `todayStr/dateInTimezone` igual que antes (en-CA trick) + `nowTime(tz)`.
- `slotToDate(date,time,tz)` interpreta hora de pared EN la zona dada
  (offset real calculado con Intl.formatToParts) — lo que timestamptz nunca hizo bien.
- `deviceTimezone()` con fallback.

`src/lib/habits/types.ts`:
- `SyncFields { created_at, updated_at, deleted_at }` base común; `Habit.timezone`;
  `Occurrence.scheduled_date/scheduled_time` (adiós `scheduled_at`);
  `HabitInput` simplificado; `SyncStatus`.

`src/lib/habits/stats.ts` REESCRITO:
- `buildStatusIndex(occurrences)` → `Map<'habitId|date|time', status>` construido UNA VEZ
  fuera del loop (fix perf #11).
- `completionRate/currentStreak/bestStreak/dailyTotals/perHabitStats` sobre el índice.
- CAMBIO DE SEMÁNTICA de rachas: los días sin nada programado YA NO ROMPEN la racha
  (antes un hábito semanal hacía imposible mantenerla). Guard de 730 días en currentStreak.
- `expectedSlots()` reemplaza a `expectedOccurrences`.
- `src/lib/habits/occurrenceS.ts` viejo archivo ELIMINADO (lo sustituye repo.ts).

---

## 4. ✅ Bugs corregidos en pantallas/componentes

- `useHabits/useToday` REESCRITOS sobre repo local + `onDataChanged` (sin refetch por navegación).
  `useToday.mark()` es OPTIMISTA (actualiza estado antes de confirmar IDB) y hace rollback+reload en error. Sin sesión no llama ensureOccurrences.
- `Timer.tsx` REESCRITO: cuenta contra `Date.now()` (deadline en ref) — sobrevive segundo plano,
  cero drift; `onComplete` en REF (ya no reinicia el intervalo cada render); tick 250ms +
  listener `visibilitychange` para recalcular al volver; progress ring anima `stroke-dashoffset`;
  `initialMinutes` reinicia al cambiar; accesible.
- `TasksPage`: `TIMER_PRESETS=[15,25,30,45,60]` CONECTADO (usa `estimated_minutes` de la tarea si
  existe, si no el preset); editor guarda estimado; pomodoro toggle; botón submit disabled vacío;
  busy flag anti doble-create.
- `StatisticsPage`: catch con ESTADO de error visible + botón Reintentar (`tick`); skew del gráfico
  proporcional a expected real (`scaleY` con maxExpected como referencia, alturas comparables);
  mejor racha mira SIEMPRE 365 días aunque el rango visible sea semana; retries con stagger 8ms.
- `HabitFormModal` REESCRITO: metas (Sin meta/Cantidad/Duración/Repeticiones + valor + unidad con
  defaults), fecha fin con min=inicio, PREVIEW de horarios resultantes (`timesOfDay`),
  validación fin<inicio, colores saturados legibles en ambos temas, labels con var(--text-primary),
  chips aria-pressed, errores rol alert, footer sticky con form="habit-form".
- `HabitsPage`: ConfirmDialog propio (adiós confirm()), mezcla meta en subtitle, busy=pulse-soft,
  labels/aria-labels completos.
- `TodayPage`: slot vigente detectado con `nowTime()` + badge "ahora"; horas mostradas con
  displayTime (verificación visual inmediata del fix timezone); progreso anima scaleX; skeletons;
  EmptyState contextual (con/sin hábitos).
- `SettingsPage` NUEVA sección Sincronización: estado + última sync + botón manual + explicación
  offline; "Reconstruir datos locales" (wipeLocal+resetCursors+syncNow) con confirmación que
  advierte cambios pendientes N; logout con ConfirmDialog que bloquea si hay pending (aviso de pérdida);
  versión v0.3.0.
- `AppLayout`: SyncBadge flotante, `key={pathname}` para replay de animación en navegación,
  safe-area iOS (safe-top/safe-bottom), indicador activo animado con width transition,
  labels nav correctos.
- Accesibilidad global nueva: `Modal.tsx` (role dialog, aria-modal, focus trap Tab/Shift+Tab,
  Escape cierra, scroll lock body, restaura foco previo, footer safe-bottom) y `ConfirmDialog`.
- Fast refresh: `useAuth`→`features/auth/useAuth.ts`, `useTheme`→`theme/useTheme.ts`,
  `useSync`→`sync/useSync.ts`, `freqLabel`→`habits/freqLabel.ts`. `AuthContext.tsx` exporta
  contexto/provider sin hook (evita import circular).
- `ThemeProvider`: persistencia tolerante a modo privado, theme-color meta dinámico por tema.
- `AuthContext`: getSession().catch() evita colgar el loading sin red y sin sesión.
- Colores: las paletas pastel viejas (#ede9fe etc.) eran invisibles en dark → saturadas
  (#8b5cf6, #22c55e...) renderizadas con alpha '33'.

---

## 5. ✅ Animaciones 0.3x + rendimiento de movimiento

`src/index.css` reescrito:

```
--dur-instant: 90ms   feedback táctil (antes 120ms)
--dur-fast:   180ms   estados/hover    (antes ~200-350ms)
--dur-base:   300ms   entradas         (antes ~1000ms)
--ease-out cubic-bezier(.22,1,.36,1)  --ease-spring(.34,1.4,.64,1)
.fade-up .fade-in .scale-in .sheet-up .pop .spin-slow .pulse-soft
.stagger → animation-delay calc(var(--i)*30ms)   (listas escalonadas, 8 items ≈ 540ms total)
.tap/:active scale(0.96) | .tap-strong scale(0.94) | .t-fast .t-base .t-transform
.bar-fill  → transform-origin:left; transición TRANSFORM (no width = cero reflow/frame)
.skeleton  → shimmer en gradient position (no layout)
will-change helper; -webkit-tap-highlight-color transparent; touch-action manipulation
prefers-reduced-motion: reduce → todo a 0.01ms
.safe-top/.safe-bottom → env(safe-area-inset-*)
```

Patrones aplicados en pantallas: barras con `transform: scaleX()/scaleY()` + `width:100%`
(nunca animar width/height); `style={{'--i': idx}}` para stagger; animaciones limitadas a
propiedades compuestas GPU.

---

## 6. ✅ PWA — service worker y ciclo de vida

`vite.config.ts` REESCRITO:
- `registerType: 'prompt'` (antes autoUpdate): NO recargar sola mientras puede haber writes
  locales en vuelo. UpdatePrompt pregunta y aplica.
- Manifest ampliado: `lang:'es'`, `categories productivity/lifestyle/health`,
  `orientation portrait`, `scope`, shortcuts (Mi día, Tareas), background negro.
- workbox: `navigateFallback '/index.html'` + **`navigateFallbackDenylist [/^\/api/, /^\/auth\/v1/,
  /^\/rest\/v1/]`** → SPA navegable offline SIN cachear jamás la API/auth.
- runtimeCaching: API/auth/realtime = **NetworkOnly** (los DATOS viven en IndexedDB, servir
  cacheobsoleta causaría bugs imposibles); fonts CacheFirst 365d; images StaleWhileRevalidate 30d.
- `cleanupOutdatedCaches: true`, clientsClaim true.
- Build: `target es2022`, `manualChunks vendor-react / vendor-supabase` (vendor cacheable entre
  releases), `__dirname → import.meta.dirname` (limpia warning de vitest config loader).
- Alias igual.

`src/features/pwa/UpdatePrompt.tsx` (NUEVO): `useRegisterSW` virtual:pwa-register/react;
update check cada 1h con onRegisteredSW; banner "Nueva versión disponible" (Actualizar/Después)
y aviso efímero "Lista para usar sin conexión" (4s auto-dismiss).

`tsconfig.app.json`: `types: ["vite/client", "vite-plugin-pwa/react", "vite-plugin-pwa/client"]`
(era imprescindible para `virtual:pwa-register/react`).

---

## 7. ✅ Estado FINAL (sesión completada)

**Todo verificado: `tsc` 0 errores · oxlint 0 warnings · 39/39 tests · build OK · QA funcional end-to-end · deploy a producción CONFIRMADO.**

### Qué se verificó funcionalmente (con navegador automatizado + usuario QA real)
1. SW registrado en producción local → banner "Lista para usar sin conexión". ✔
2. Login con usuario QA nuevo → "Tu día" vacío correcto. ✔
3. Hábito creado desde la UI real ("Beber agua", 08:00, con preview de horarios). ✔
4. Push inicial no disparaba con mutaciones → FIX AÑADIDO: SyncProvider ahora hace push
   debounced 1.5s tras cada onDataChanged (antes solo 60s/visibilidad). Reconstruido y rehecho el ciclo.
5. Sync verificado server-side: hábito + ocurrencia 2026-08-27T08:00:00 (hora LOCAL preservada) en Supabase. ✔
6. OFFLINE REAL: fetch bloqueado + evento offline → badge "Sin conexión" apareció. ✔
   Tarea creada offline desde UI → guardada en IDB + outbox `tasks:insert`. ✔
7. Al reconectar → outbox drenó solo, badge desapareció, tarea verificada en Supabase. ✔
8. Mark "Hecho" → progreso 0→100% optimista, "¡Día completado!", Stats calculando racha=1,
   cumplimiento=100%. Update propagado al servidor (`status: completed`). ✔
9. Delete offline → soft delete local + outbox `tasks:delete`; al reconectar propagado
   al servidor (`deleted_at` seteado). ✔
10. Incidente durante pruebas NO es bug de la app: mi parcheo de pruebas reemplazó window.fetch
    y la restauración falló tras navigación (fetch=undefined). El outbox respondió CORRECTAMENTE:
    encoló, registró last_error="fetch is not a function" y aplicó backoff sin perder nada.
    Con página fresca drenó todo. Comportamiento exactamente como fue diseñado.
11. Limpieza total: datos QA borrados (204 x3), usuario auth eliminado (200).

### Proceso de release
- Commit único del refactor: `89a0770` ("feat: offline-first ...").
- `.gitignore`: añadido `supabase/.temp/`.
- Push a main → Vercel desplegó automáticamente; verificado hash de bundle NUEVO
  (`index-BUOLnWvU.js`) + `/sw.js` 200 con workbox + manifest con shortcuts/lang es.
- ⚠️ Nota para la proxima vez: al desplegar versión nueva, los clientes con PWA instalada
  verán el banner "Nueva versión disponible" (registerType prompt) — actualizar cuando
  sea conveniente; no se pierden datos porque las filas locales suben igual.

Lecciones/pitfalls (adicionales):

---

## 8. ⬜ Explícitamente NO hecho (backlog consciente, priorizado)

1. **NOTIFICACIONES** — la carencia de producto principal. Bloqueante resuelto: ya existen
   `scheduled_date/time` + `habits.timezone` + `slotToDate()` → instante real por zona.
   Camino sugerido: Web Push con VAPID vía Edge Function programada de Supabase (pg_cron +
   net.http) o notificaciones locales programadas. Es LA siguiente feature.
2. **Realtime multi-dispositivo**: hoy hay pull on-visible/online/60s + eventos locales.
   Podría añadirse canal realtime de Supabase para push en vivo. Bajo coste, opcional.
3. **AuthPage** sin tocar: falta manejar login offline con gracia (hoy: error crudo de fetch)
   y aprovechar el mensaje registered/reset ya existentes.
4. `supabase/.temp/linked-project.json` sigue TRACKED en git — añadir a .gitignore y quitarlo.
5. Admin de cuentas (baja/cambio email) y recovery de outbox poisoning (>6 intentos): hoy se
   descarta silenciosamente al drenar; valdría avisar en SyncBadge.
6. Cámara de métricas históricas cuando crezca el volumen (agregados precalculados).
7. README del repo desactualizado respecto a arquitectura nueva.

## 9. Lecciones/pitfalls de la sesión (para no repetir)

- MCP Supabase inestable → CLI funciona igual de bien y es verificable (`migration repair` OK).
- Historial de migraciones puede estar DESINCRONIZADO con esquema real: ante "already exists",
  `supabase migration repair --status applied <timestamp>` antes de push.
- `supabase gen types` después de CADA migración DDL o el TS rompe silencioso.
- postgrest-js rechaza `Record<string,unknown>` en inserts tipados → patrón `asRow` centralizado.
- En IndexedDB: agrupar operaciones en 1 transacción (`idbPutMany`) o el jank reaparece.
- Los timestamps NAIVE en timestamptz son una bomba silenciosa: aquí se disfrazaba con slice()
  en la UI. Modelo correcto para "horarios": fecha/hora separadas + zona aparte.

## 10. ✅ TAREAS 2.0 (27-ago, tarde) — commit 765b31e, EN PROD

Rediseño completo del módulo de tareas según lo que Erick pidió:

### Base de datos (migración `20260827030000_tasks_v2_priority_tags_lists.sql`)
- Tabla nueva `task_lists` (id, user_id, name, color, sort_order, soft delete) + RLS 4 policies
- `tasks.priority` ('low'|'medium'|'high', default medium, con check constraint)
- `tasks.tags text[] default '{}'`, `tasks.list_id → task_lists(id) on delete set null`
- `tasks.reminder_date date + reminder_time time` (hora LOCAL de pared, mismo modelo de ocurrencias)
- Índices: idx_tasks_user_due, idx_tasks_user_list
- Types regenerados; IndexedDB **v2** (store nuevo; migración de clientes es automática)

### Pantalla Tareas
- Creación RÁPIDA en línea (título+Enter) y botón "Detallada" con modal completo
- Modal: título, descripción, prioridad (3 botones con color), fecha objetivo + hora,
  recordatorio (fecha+hora), tags con sugerencias de los existentes, selector de lista
- Agrupación: **Prioridad | Fecha | Lista** con controles chip
- Filtros: por tag (chips generados automáticamente) y por lista
- Completadas colapsables
- Row chips: prioridad coloreada, vencida en rojo, hoy en violeta, 🔔 recordatorio, lista, #tags, minutos
- Pomodoro global y presets ELIMINADOS (Erick: no viable como PWA sin background); queda foco 30min por tarea

### "Hoy" integra tareas (lo que pidió Erick textualmente)
- Secciones: ⚠️ Vencidas → 📌 Hoy → 🗓️ Próximas → 📥 Sin fecha (buildTodaySections)
- Dentro de cada sección: prioridad primero (alta>media>baja), desempate fecha>hora (compareTasks)
- Máx 5 por sección + link "Ver todas"
- Chips resumen arriba: N vencidas / N para hoy

### Stats ahora incluyen tareas
- "Tareas para hoy" (con sub "+N vencidas"), "Tareas completadas" (+% histórico),
  "Tiempo enfocado en tareas" (h/min de spent_minutes)
- FIX bug móvil Evolución diaria: carril overflow-x-auto con min-width = días*18px,
  barras w-[14px] shrink-0 grow, labels 9px — las 30 barras ya no se aplastan ni desbordan

### Lógica pura testeada (`src/lib/tasks/sort.ts` + 14 tests)
priorityWeight, dueBucket, compareTasks (prioridad→fecha→nulls→sort_order),
buildTodaySections, groupTasks(3 modos), parseTags(comas/espacios/#, minúsculas, máx 8×24)

### Verificado end-to-end (QA usuario nuevo, navegador real)
Lista→2 tareas (rápida media sin fecha; detallada alta hoy 17:00 tags trabajo/urgente)→
agrupación ALTA/MEDIA correcta→modo Fecha agrupa por día→Hoy muestra secciones y chips→
servidor confirma priority/tags/due_date/due_time subidos. QA2 borrado completo (204s+200).

---


## 11. ✅ TÍTULO INTELIGENTE + RECORDATORIO UNIFICADO (27-ago noche) — commit 683ae27, EN PROD

### Parser natural (`src/lib/tasks/parse.ts`)
- Extrae de texto libre: `#tags`, `prioridad:alta|media|baja` (también `prioridad alta` y atajo `!alta`),
  fechas palabra (`hoy`, `mañana`, `pasado mañana`, días de semana con/sin tilde, "el lunes"),
  horas 12h (`4pm`, `10:30am`) y 24h (`16:00`), y combos con dos puntos (`mañana:4pm`, `hoy:21:30`).
- REGLA CLAVE (pedida por Erick): solo hora sin fecha = HOY; si esa hora ya pasó = MAÑANA.
  Con fecha explícita no aplica el ajuste ("Entregar mañana 9:00" → mañana 9:00 aunque sea de noche).
- Devuelve título limpio + campos; lo no mencionado queda null (caller aplica defaults).
- TESTS: 20 casos nuevos incluyendo los 4 ejemplos literales de Erick como contratos.

### UI
- Barra rápida: **preview en vivo** debajo del input mostrando cómo se interpretó
  (`✨ Comer comida — mañana · a las 16:00 · alta · #comida`).
- Botón "Detallada": hereda el texto escrito (`seedText`) y pre-llena TODOS los campos parseados
  para que ajuste lo demás.
- Placeholder orientativo: `Ej: Comer mañana:4pm !alta #comida`.

### Recordatorio unificado (decisión de diseño de Erick)
- "Definir para cuándo Y recordatorio es ilógico" → UN solo concepto:
  `reminder_date/time := due_date/due_time`. Campo aparte eliminado del modal.
- Los rows muestran 🔔 sincronizado con la fecha objetivo. Valores viejos se normalizan al editar.

### Bug reportado "no hay botón al editar"
- Flujo reproducido completo en QA navegador real: modal abre con título cargado → cambiar prioridad
  Baja → click Guardar → cierra + aplica + servidor refleja el cambio. NO se reprodujo el fallo;
  probablemente era del bundle anterior o una carrera ya corregida. Pendiente confirmación de Erick
  si reaparece.

### Lecciones
- El preview-server sirve el ÚLTIMO BUILD de dist/: si parcheas código y no reconstruyes,
  el navegador cargará bundles viejos aunque el SW esté limpio. Reconstruir SIEMPRE antes de QA.
- Para tests con fechas: fijar el reloj con fecha-hora COMPLETA (mi test usaba un día que creía
  miércoles y era jueves, invirtiendo expectativas de 'mañana' y días de semana).

---

## 12. ⬜ BACKLOG ACTUALIZADO (roadmap vivo)

Prioridad ALTA (siguiente sesión):
1. **NOTIFICACIONES** — el hueco de producto #1. Base lista: reminder_date/time locales +
   habits.timezone + slotToDate(). Camino: Web Push VAPID vía Edge Function programada
   (pg_cron + net.http) o notificaciones locales SW. Sin esto la app es registro, no asistente.
2. Gestión visual de LISTAS (crear/renombrar/color/borrar desde UI — hoy solo se eligen, no se crean).
3. Confirmación del bug de edición si reaparece (ver §11).

Media:
4. Realtime multi-dispositivo (canal Supabase) — hoy pull on visible/online/60s/debounce.
5. Recurrencia en tareas (diaria/semanal, estilo hábitos).
6. Vista calendario mensual / navegación por día (el heatmap de stats ya existe).
7. Archivo/histórico de completadas con búsqueda por tag/texto/fecha.

Baja / pulido:
8. Onboarding primera vez (sample data opcional).
9. Export/import JSON — alineado con offline-first.
10. Deep-links (?quick=... para prellenar la barra rápida desde shortcuts/widget).

**Estado final de calidad acumulada:** tsc 0 · oxlint 0 · **73/73 tests** · build ok.
Commits del día: `89a0770` refactor offline → `ff3a124` docs → `765b31e` tareas 2.0 →
`dc2713d` docs → `683ae27` parser inteligente. Cada deploy verificado con bundle nuevo en prod.

*Bitácora cerrada al 27-ago noche. La app pasó de prototipo frágil a producto offline-first real.*
