-- Keep an erroneous CSV batch available for audit while blocking further
-- publication once a corrected import has replaced it.
create table public.teaching_dictionary_manager_batch_replacements (
  original_batch_id uuid primary key,
  replacement_batch_id uuid not null,
  reason text not null check (btrim(reason) <> ''),
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  check (original_batch_id <> replacement_batch_id)
);
create trigger teaching_dictionary_manager_batch_replacements_immutable before update
  on public.teaching_dictionary_manager_batch_replacements for each row execute function public.reject_writing_fact_update();
alter table public.teaching_dictionary_manager_batch_replacements enable row level security;
revoke all on public.teaching_dictionary_manager_batch_replacements from anon, authenticated;
grant select, insert on public.teaching_dictionary_manager_batch_replacements to service_role;
