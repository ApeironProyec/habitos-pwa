-- ============================================================
-- habitos-pwa — Migración v3 (2026-08-27)
--
-- 1. Endurecimiento de RLS: `with check` en todos los UPDATE
--    (sin él, un usuario puede reasignar sus filas a otro user_id)
-- 2. Ownership real en habit_occurrences (validar que el habit_id sea tuyo)
-- 3. Soft delete: requisito para sincronizar borrados entre dispositivos
-- 4. scheduled_date + scheduled_time: reemplaza scheduled_at timestamptz.
--    Un hábito "a las 09:00" es hora de pared local, no un instante UTC.
-- 5. Índices por updated_at para pull incremental
-- 6. RPC atómico para acumular minutos sin condición de carrera
-- ============================================================

-- ============================================================
-- 1. SOFT DELETE
-- ============================================================

alter table public.habits            add column if not exists deleted_at timestamptz;
alter table public.habit_occurrences add column if not exists deleted_at timestamptz;
alter table public.tasks             add column if not exists deleted_at timestamptz;

-- ============================================================
-- 2. OCURRENCIAS: scheduled_at (timestamptz) → scheduled_date + scheduled_time
--
-- Los valores viejos se escribieron como texto naive ('2026-08-27T09:00:00')
-- y Postgres los interpretó en UTC. Para recuperar la intención original
-- (hora local del usuario) hay que leerlos de vuelta AT TIME ZONE 'UTC'.
-- ============================================================

alter table public.habit_occurrences add column if not exists scheduled_date date;
alter table public.habit_occurrences add column if not exists scheduled_time time;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'habit_occurrences'
      and column_name = 'scheduled_at'
  ) then
    update public.habit_occurrences
    set scheduled_date = (scheduled_at at time zone 'UTC')::date,
        scheduled_time = (scheduled_at at time zone 'UTC')::time
    where scheduled_date is null;
  end if;
end $$;

-- Filas sin dato recuperable: descartar (no hay forma de saber a qué día iban)
delete from public.habit_occurrences where scheduled_date is null;

alter table public.habit_occurrences alter column scheduled_date set not null;
alter table public.habit_occurrences alter column scheduled_time set not null;

-- Reemplazar la restricción de unicidad por la nueva clave natural
alter table public.habit_occurrences
  drop constraint if exists habit_occurrences_habit_id_scheduled_at_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'habit_occurrences_habit_slot_key'
  ) then
    alter table public.habit_occurrences
      add constraint habit_occurrences_habit_slot_key
      unique (habit_id, scheduled_date, scheduled_time);
  end if;
end $$;

alter table public.habit_occurrences drop column if exists scheduled_at;

drop index if exists public.idx_occurrences_scheduled_at;
drop index if exists public.idx_occurrences_user_scheduled;
create index if not exists idx_occurrences_user_date
  on public.habit_occurrences(user_id, scheduled_date);
create index if not exists idx_occurrences_habit_date
  on public.habit_occurrences(habit_id, scheduled_date);

-- ============================================================
-- 3. ZONA HORARIA DEL HÁBITO
-- Guardar en qué zona se definió el hábito permite, más adelante,
-- programar notificaciones correctamente aunque el usuario viaje.
-- ============================================================

alter table public.habits
  add column if not exists timezone text not null default 'America/La_Paz';

-- ============================================================
-- 4. ÍNDICES PARA PULL INCREMENTAL (sync)
-- ============================================================

create index if not exists idx_habits_user_updated
  on public.habits(user_id, updated_at);
create index if not exists idx_occurrences_user_updated
  on public.habit_occurrences(user_id, updated_at);
create index if not exists idx_tasks_user_updated
  on public.tasks(user_id, updated_at);

-- ============================================================
-- 5. RLS ENDURECIDO
-- El `with check` faltante permitía: update habits set user_id = '<otro>'
-- ============================================================

-- ---------- profiles ----------
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ---------- habits ----------
drop policy if exists "habits_update_own" on public.habits;
create policy "habits_update_own" on public.habits
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- tasks ----------
drop policy if exists "tasks_update_own" on public.tasks;
create policy "tasks_update_own" on public.tasks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- habit_occurrences ----------
-- Además del user_id, validar que el hábito referenciado sea propio:
-- sin esto se podían colgar ocurrencias de un habit_id ajeno.
drop policy if exists "occurrences_insert_own" on public.habit_occurrences;
create policy "occurrences_insert_own" on public.habit_occurrences
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.habits h
      where h.id = habit_id and h.user_id = auth.uid()
    )
  );

drop policy if exists "occurrences_update_own" on public.habit_occurrences;
create policy "occurrences_update_own" on public.habit_occurrences
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.habits h
      where h.id = habit_id and h.user_id = auth.uid()
    )
  );

-- ============================================================
-- 6. INCREMENTO ATÓMICO DE MINUTOS
-- El cliente leía spent_minutes del estado de React y escribía la suma:
-- dos temporizadores terminando juntos se pisaban.
-- ============================================================

create or replace function public.add_task_minutes(p_task_id uuid, p_minutes integer)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total integer;
begin
  update public.tasks
  set spent_minutes = spent_minutes + greatest(0, p_minutes)
  where id = p_task_id and user_id = auth.uid()
  returning spent_minutes into v_total;

  if v_total is null then
    raise exception 'Tarea no encontrada o sin permiso';
  end if;

  return v_total;
end $$;

revoke all on function public.add_task_minutes(uuid, integer) from public;
grant execute on function public.add_task_minutes(uuid, integer) to authenticated;
