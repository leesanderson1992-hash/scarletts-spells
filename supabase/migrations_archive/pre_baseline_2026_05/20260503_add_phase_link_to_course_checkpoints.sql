alter table public.course_checkpoints
  add column if not exists phase_id uuid references public.course_phases (id) on delete set null;

create index if not exists course_checkpoints_phase_idx
  on public.course_checkpoints (phase_id);
