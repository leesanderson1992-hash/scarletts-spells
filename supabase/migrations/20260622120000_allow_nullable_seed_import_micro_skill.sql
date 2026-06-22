alter table public.spelling_seed_import_rows
  alter column suggested_micro_skill_key drop not null;

alter table public.spelling_seed_import_rows
  drop constraint if exists spelling_seed_import_rows_skill_key_check;

alter table public.spelling_seed_import_rows
  add constraint spelling_seed_import_rows_skill_key_check
    check (
      suggested_micro_skill_key is null
      or btrim(suggested_micro_skill_key) <> ''
    );
