begin;

alter table public.courses
  add column if not exists start_date date,
  add column if not exists duration_weeks integer,
  add column if not exists cycle_length_weeks integer not null default 4;

update public.courses
set cycle_length_weeks = 4
where cycle_length_weeks is null;

alter table public.focus_blocks
  add column if not exists cycle_number integer;

alter table public.course_checkpoints
  add column if not exists cycle_number integer;

commit;
