begin;

alter table public.courses
add column if not exists structure_type text not null default 'timed';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'courses_structure_type_check'
  ) then
    alter table public.courses
    add constraint courses_structure_type_check
    check (structure_type in ('phased', 'timed'));
  end if;
end $$;

create table if not exists public.course_phases (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  parent_user_id uuid not null,
  title text not null,
  description text,
  position integer not null default 0,
  badge_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists course_phases_course_idx
  on public.course_phases (course_id, position);

grant select, insert, update, delete on public.course_phases to authenticated;

alter table public.course_phases enable row level security;

drop policy if exists course_phases_parent_access on public.course_phases;
create policy course_phases_parent_access
on public.course_phases
for all
to authenticated
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);

alter table public.course_modules
add column if not exists phase_id uuid references public.course_phases(id) on delete set null;

create index if not exists course_modules_phase_idx
  on public.course_modules (phase_id, position);

commit;
