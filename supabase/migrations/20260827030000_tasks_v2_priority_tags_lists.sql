-- ============================================================
-- habitos-pwa — Migración v4 (2026-08-27): tareas con superpoderes
--
-- 1. Tabla task_lists: múltiples listas (estilo Google Tasks)
-- 2. tasks.priority: low | medium | high
-- 3. tasks.tags: array de texto (filtrable por tag)
-- 4. tasks.reminder_date/time: fecha y hora del recordatorio,
--    como hora LOCAL de pared (mismo modelo de ocurrencias);
--    el motor de notificaciones futuras las consumirá así.
-- ============================================================

-- ---------- listas ----------
create table if not exists public.task_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text,
  sort_order bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.task_lists enable row level security;

create policy "task_lists_select_own" on public.task_lists
  for select using (auth.uid() = user_id);
create policy "task_lists_insert_own" on public.task_lists
  for insert with check (auth.uid() = user_id);
create policy "task_lists_update_own" on public.task_lists
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "task_lists_delete_own" on public.task_lists
  for delete using (auth.uid() = user_id);

create index if not exists idx_task_lists_user on public.task_lists(user_id, updated_at);

drop trigger if exists trg_task_lists_updated on public.task_lists;
create trigger trg_task_lists_updated before update on public.task_lists
  for each row execute function public.set_updated_at();

-- ---------- campos nuevos en tasks ----------
alter table public.tasks
  add column if not exists priority text
    not null default 'medium'
    check (priority in ('low', 'medium', 'high'));

alter table public.tasks
  add column if not exists tags text[] not null default '{}';

alter table public.tasks
  add column if not exists list_id uuid references public.task_lists(id) on delete set null;

-- Recordatorio en dos partes (fecha local + hora local), coherente con
-- habit_occurrences; nunca volver al timestamp ambiguo.
alter table public.tasks add column if not exists reminder_date date;
alter table public.tasks add column if not exists reminder_time time;

-- El check de prioridad puede existir si esta migración se reintenta
alter table public.tasks drop constraint if exists tasks_priority_check;
alter table public.tasks
  add constraint tasks_priority_check check (priority in ('low', 'medium', 'high'));

-- Consultas nuevas: "hoy y próximas por fecha", filtro por lista
create index if not exists idx_tasks_user_due on public.tasks(user_id, due_date);
create index if not exists idx_tasks_user_list on public.tasks(user_id, list_id);
