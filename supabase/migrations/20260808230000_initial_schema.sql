-- ============================================================
-- habitos-pwa — Migración inicial (2026-08-08)
-- Tablas: profiles, habits, habit_occurrences
-- RLS + policies + índices + triggers
-- ============================================================

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  timezone text not null default 'America/La_Paz',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- ---------- habits ----------
create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  category text,
  icon text,
  color text,
  frequency_type text not null check (frequency_type in ('daily', 'weekly', 'interval', 'multiple_daily')),
  frequency_config jsonb not null default '{}'::jsonb,
  target_type text check (target_type in ('count', 'duration_minutes', 'repetitions') or target_type is null),
  target_value numeric,
  unit text,
  start_date date not null default current_date,
  end_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.habits enable row level security;

create policy "habits_select_own" on public.habits
  for select using (auth.uid() = user_id);

create policy "habits_insert_own" on public.habits
  for insert with check (auth.uid() = user_id);

create policy "habits_update_own" on public.habits
  for update using (auth.uid() = user_id);

create policy "habits_delete_own" on public.habits
  for delete using (auth.uid() = user_id);

-- ---------- habit_occurrences ----------
create table if not exists public.habit_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  scheduled_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'skipped')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (habit_id, scheduled_at)
);

alter table public.habit_occurrences enable row level security;

create policy "occurrences_select_own" on public.habit_occurrences
  for select using (auth.uid() = user_id);

create policy "occurrences_insert_own" on public.habit_occurrences
  for insert with check (auth.uid() = user_id);

create policy "occurrences_update_own" on public.habit_occurrences
  for update using (auth.uid() = user_id);

create policy "occurrences_delete_own" on public.habit_occurrences
  for delete using (auth.uid() = user_id);

-- ---------- índices ----------
create index if not exists idx_habits_user_id on public.habits(user_id);
create index if not exists idx_occurrences_user_id on public.habit_occurrences(user_id);
create index if not exists idx_occurrences_habit_id on public.habit_occurrences(habit_id);
create index if not exists idx_occurrences_scheduled_at on public.habit_occurrences(scheduled_at);
create index if not exists idx_occurrences_user_scheduled on public.habit_occurrences(user_id, scheduled_at);

-- ---------- triggers: updated_at ----------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_habits_updated on public.habits;
create trigger trg_habits_updated before update on public.habits
  for each row execute function public.set_updated_at();

drop trigger if exists trg_occurrences_updated on public.habit_occurrences;
create trigger trg_occurrences_updated before update on public.habit_occurrences
  for each row execute function public.set_updated_at();

-- ---------- trigger: crear profile automáticamente al registrarse ----------
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, timezone)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)), 'America/La_Paz')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
