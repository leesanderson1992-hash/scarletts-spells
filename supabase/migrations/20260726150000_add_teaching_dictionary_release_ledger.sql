-- One guarded release ledger and least-privilege role for reviewed Teaching
-- Dictionary content packages. Schema migrations remain separate from data
-- releases; this migration imports no dictionary or learner data.

alter table public.canonical_teaching_dictionary_import_batches
  add column if not exists release_id text,
  add column if not exists package_type text,
  add column if not exists package_schema_version text,
  add column if not exists workbook_sha256 text,
  add column if not exists package_sha256 text,
  add column if not exists target_environment text,
  add column if not exists importer_version text,
  add column if not exists verification_summary jsonb not null default '{}'::jsonb,
  add column if not exists verified_at timestamptz;

alter table public.canonical_teaching_dictionary_import_batches
  drop constraint if exists canonical_teaching_dictionary_import_batches_mode_check;

alter table public.canonical_teaching_dictionary_import_batches
  add constraint canonical_teaching_dictionary_import_batches_mode_check
  check (
    import_mode = any (
      array[
        'local_dev_dry_run',
        'local_dev_import',
        'admin_import',
        'staging_release',
        'production_release'
      ]
    )
  );

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
        'micro_skill_content_batch_v1'
      )
      and btrim(coalesce(package_schema_version, '')) <> ''
      and workbook_sha256 ~ '^[0-9a-f]{64}$'
      and package_sha256 ~ '^[0-9a-f]{64}$'
      and target_environment in ('staging', 'production')
      and btrim(coalesce(importer_version, '')) <> ''
    )
  );

create unique index if not exists canonical_teaching_dictionary_import_batches_release_id_idx
  on public.canonical_teaching_dictionary_import_batches (release_id)
  where release_id is not null;

create unique index if not exists canonical_teaching_dictionary_import_batches_package_sha_idx
  on public.canonical_teaching_dictionary_import_batches (package_sha256)
  where package_sha256 is not null;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'teaching_dictionary_releaser') then
    create role teaching_dictionary_releaser nologin noinherit;
  end if;
end
$$;

grant usage on schema public to teaching_dictionary_releaser;

do $$
declare
  table_record record;
begin
  for table_record in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
      and (
        tablename = 'canonical_teaching_dictionary_import_batches'
        or tablename like 'canonical_teaching_dictionary_%'
      )
  loop
    execute format(
      'grant select, insert, update on table %I.%I to teaching_dictionary_releaser',
      table_record.schemaname,
      table_record.tablename
    );
  end loop;
end
$$;

-- Make the safety boundary explicit even if a future broad grant is added to
-- public or another shared role.
do $$
declare
  protected_table text;
begin
  foreach protected_table in array array[
    'children',
    'learning_items',
    'learning_item_evidence',
    'assignment_items',
    'daily_assignments',
    'adle_learning_items',
    'adle_assignment_attempt_events',
    'adle_authentic_use_events',
    'adle_slippage_events',
    'adle_word_proficiency',
    'spelling_canonical_mappings',
    'spelling_canonical_mapping_events',
    'spelling_catalog_review_cases',
    'child_word_treasures',
    'child_word_treasure_events'
  ]
  loop
    if to_regclass('public.' || protected_table) is not null then
      execute format(
        'revoke insert, update, delete, truncate, references, trigger on table public.%I from teaching_dictionary_releaser',
        protected_table
      );
    end if;
  end loop;
end
$$;
