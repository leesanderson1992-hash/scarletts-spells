begin;

alter table public.daily_assignments
  add column if not exists focus_word text,
  add column if not exists selected_family_slug text;

create index if not exists daily_assignments_selected_family_slug_idx
  on public.daily_assignments (selected_family_slug);

commit;
