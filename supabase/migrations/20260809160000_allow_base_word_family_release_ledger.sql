-- BW-2B-0: allow a reviewed Base Word family package in the Teaching
-- Dictionary release ledger and make its published family rows append-only.
-- This migration publishes no curriculum data, route release, activation,
-- assignment, learning item, or learner gate.

begin;

alter table public.canonical_teaching_dictionary_import_batches
  drop constraint if exists canonical_teaching_dictionary_import_batches_release_fields_check;

alter table public.canonical_teaching_dictionary_import_batches
  add constraint canonical_teaching_dictionary_import_batches_release_fields_check
  check (
    import_mode not in ('staging_release', 'production_release')
    or (
      btrim(coalesce(release_id, '')) <> ''
      and package_type in (
        'canonical_word_batch_v1',
        'canonical_word_repair_v1',
        'micro_skill_content_batch_v1',
        'base_word_family_batch_v1'
      )
      and btrim(coalesce(package_schema_version, '')) <> ''
      and workbook_sha256 ~ '^[0-9a-f]{64}$'
      and package_sha256 ~ '^[0-9a-f]{64}$'
      and target_environment in ('staging', 'production')
      and btrim(coalesce(importer_version, '')) <> ''
    )
  );

-- The canonical-word release hardening migration intentionally removed this
-- role from every non-canonical package table. Restore only the capability
-- needed by this reviewed package: append new family rows. Verification reads
-- and immutable-authority publication occur after RESET ROLE.
revoke all privileges on table public.canonical_teaching_dictionary_base_word_families
  from teaching_dictionary_releaser;
revoke all privileges on table public.canonical_teaching_dictionary_base_word_family_members
  from teaching_dictionary_releaser;
grant insert on table public.canonical_teaching_dictionary_base_word_families
  to teaching_dictionary_releaser;
grant insert on table public.canonical_teaching_dictionary_base_word_family_members
  to teaching_dictionary_releaser;

create or replace function public.prevent_applied_base_word_family_release_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_batch_id uuid := old.import_batch_id;
begin
  if exists (
    select 1
    from public.canonical_teaching_dictionary_import_batches batch
    where batch.id = v_batch_id
      and batch.package_type = 'base_word_family_batch_v1'
      and batch.batch_status = 'applied'
  ) then
    raise exception '% rows from an applied Base Word family release are immutable', tg_table_name;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists base_word_family_release_rows_immutable
  on public.canonical_teaching_dictionary_base_word_families;
create trigger base_word_family_release_rows_immutable
before update or delete on public.canonical_teaching_dictionary_base_word_families
for each row execute function public.prevent_applied_base_word_family_release_mutation();

drop trigger if exists base_word_family_release_member_rows_immutable
  on public.canonical_teaching_dictionary_base_word_family_members;
create trigger base_word_family_release_member_rows_immutable
before update or delete on public.canonical_teaching_dictionary_base_word_family_members
for each row execute function public.prevent_applied_base_word_family_release_mutation();

commit;
