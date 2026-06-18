begin;

alter table public.spelling_canonical_mappings
  add column if not exists source_seed_import_row_id uuid references public.spelling_seed_import_rows(id) on delete set null;

alter table public.spelling_canonical_mapping_events
  add column if not exists source_seed_import_row_id uuid references public.spelling_seed_import_rows(id) on delete set null;

alter table public.spelling_canonical_mapping_events
  drop constraint if exists spelling_canonical_mapping_events_type_check;

alter table public.spelling_canonical_mapping_events
  add constraint spelling_canonical_mapping_events_type_check
  check (
    event_type in (
      'created',
      'disabled',
      'deprecated',
      'superseded',
      'metadata_updated',
      'resolver_visibility_enabled',
      'resolver_visibility_disabled',
      'pcrm_adopted',
      'seed_import_adopted'
    )
  );

create index if not exists spelling_canonical_mappings_source_seed_import_row_idx
  on public.spelling_canonical_mappings (source_seed_import_row_id, created_at desc)
  where source_seed_import_row_id is not null;

create index if not exists spelling_canonical_mapping_events_source_seed_import_row_idx
  on public.spelling_canonical_mapping_events (source_seed_import_row_id, created_at desc)
  where source_seed_import_row_id is not null;

create or replace function public.adopt_seed_import_row_hidden_canonical_admin(
  p_seed_import_row_id uuid,
  p_admin_user_id uuid,
  p_admin_email text default null,
  p_note text default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.spelling_seed_import_rows%rowtype;
  v_batch public.spelling_seed_import_batches%rowtype;
  v_micro_skill record;
  v_mapping public.spelling_canonical_mappings%rowtype;
  v_mapping_id uuid;
  v_note text;
  v_now timestamptz := timezone('utc', now());
  v_lineage jsonb;
  v_metadata jsonb;
  v_adoption_result text;
begin
  if p_admin_user_id is null then
    raise exception 'Seed import hidden canonical adoption requires an admin user id.';
  end if;

  if p_seed_import_row_id is null then
    raise exception 'Seed import hidden canonical adoption requires a seed import row id.';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');

  if v_note is null then
    raise exception 'Seed import hidden canonical adoption requires an admin adoption note.';
  end if;

  select *
  into v_row
  from public.spelling_seed_import_rows
  where id = p_seed_import_row_id
  for update;

  if not found then
    raise exception 'Seed import row not found.';
  end if;

  select *
  into v_batch
  from public.spelling_seed_import_batches
  where id = v_row.batch_id
  for update;

  if not found then
    raise exception 'Seed import row batch not found.';
  end if;

  if v_row.row_status <> 'nominated_for_canonical_adoption' then
    raise exception 'Only nominated seed import rows can be adopted into hidden canonical truth.';
  end if;

  if v_row.canonical_mapping_id is not null then
    raise exception 'Seed import row is already linked to a canonical mapping.';
  end if;

  if v_row.row_status in (
    'duplicate',
    'rejected',
    'superseded',
    'conflict_blocked',
    'adopted_hidden_canonical',
    'manual_review_required'
  ) then
    raise exception 'Duplicate, rejected, superseded, conflict-blocked, adopted, or manual-review seed rows cannot be adopted by Slice 4F.';
  end if;

  if v_row.duplicate_of_seed_import_row_id is not null then
    raise exception 'Duplicate seed import row lineage must follow its target row.';
  end if;

  if v_row.dry_run_bucket <> 'safe_for_candidate_review' then
    raise exception 'Seed import hidden canonical adoption requires a safe candidate-review dry-run row.';
  end if;

  if nullif(btrim(coalesce(v_batch.source_name, '')), '') is null
    or nullif(btrim(coalesce(v_batch.source_license_note, '')), '') is null
    or nullif(btrim(coalesce(v_batch.source_file_name, '')), '') is null
    or nullif(btrim(coalesce(v_batch.source_file_sha256, '')), '') is null
    or nullif(btrim(coalesce(v_batch.dry_run_report_schema_version, '')), '') is null
    or nullif(btrim(coalesce(v_batch.dry_run_report_sha256, '')), '') is null
    or nullif(btrim(coalesce(v_batch.batch_name, '')), '') is null
    or coalesce(v_row.source_row_number, 0) <= 0
    or nullif(btrim(coalesce(v_row.source_note, '')), '') is null
    or nullif(btrim(coalesce(v_row.source_dataset, v_batch.source_dataset, '')), '') is null
  then
    raise exception 'Seed import hidden canonical adoption requires auditable source, dataset, license, file, report, batch, and row lineage.';
  end if;

  if nullif(btrim(coalesce(v_row.misspelling_normalized, '')), '') is null
    or nullif(btrim(coalesce(v_row.correct_spelling_normalized, '')), '') is null
    or btrim(v_row.misspelling_normalized) = btrim(v_row.correct_spelling_normalized)
  then
    raise exception 'Seed import hidden canonical adoption requires a normalized spelling pair.';
  end if;

  if nullif(btrim(coalesce(v_row.dialect_code, '')), '') is null
    or nullif(btrim(coalesce(v_row.normalization_version, '')), '') is null
  then
    raise exception 'Seed import hidden canonical adoption requires dialect and normalization version.';
  end if;

  if jsonb_array_length(coalesce(v_row.blocking_errors, '[]'::jsonb)) > 0
    or jsonb_array_length(coalesce(v_row.canonical_conflict_ids, '[]'::jsonb)) > 0
  then
    raise exception 'Seed import hidden canonical adoption is blocked by validation errors or unresolved canonical conflicts.';
  end if;

  select micro_skill_key, mastery_domain_key, is_active, is_assignable
  into v_micro_skill
  from public.micro_skill_catalog
  where micro_skill_key = v_row.suggested_micro_skill_key
    and mastery_domain_key = 'D4'
    and is_active = true
    and is_assignable = true;

  if not found then
    raise exception 'Seed import hidden canonical adoption requires an active assignable D4 micro-skill.';
  end if;

  if exists (
    select 1
    from public.spelling_canonical_mappings
    where misspelling_normalized = v_row.misspelling_normalized
      and correct_spelling_normalized = v_row.correct_spelling_normalized
      and dialect_code = v_row.dialect_code
      and mapping_status <> 'active'
  ) then
    raise exception 'Seed import hidden canonical adoption is blocked by a disabled, deprecated, or superseded canonical mapping.';
  end if;

  if exists (
    select 1
    from public.spelling_canonical_mappings
    where misspelling_normalized = v_row.misspelling_normalized
      and correct_spelling_normalized <> v_row.correct_spelling_normalized
      and dialect_code = v_row.dialect_code
      and mapping_status = 'active'
  ) then
    raise exception 'Seed import hidden canonical adoption conflict: same misspelling has a different active correction.';
  end if;

  select *
  into v_mapping
  from public.spelling_canonical_mappings
  where misspelling_normalized = v_row.misspelling_normalized
    and correct_spelling_normalized = v_row.correct_spelling_normalized
    and dialect_code = v_row.dialect_code
    and mapping_status = 'active'
  order by created_at
  limit 1
  for update;

  if found and v_mapping.resolver_visibility_status = 'visible' then
    raise exception 'Seed import hidden canonical adoption is blocked by an existing resolver-visible canonical mapping.';
  end if;

  if found and v_mapping.resolver_visibility_status <> 'hidden' then
    raise exception 'Seed import hidden canonical adoption can only link to an existing hidden canonical mapping.';
  end if;

  if found and v_mapping.micro_skill_key <> v_row.suggested_micro_skill_key then
    raise exception 'Seed import hidden canonical adoption conflict: exact pair has a different active micro-skill.';
  end if;

  v_lineage := jsonb_build_object(
    'source_seed_import_row_id', v_row.id,
    'seed_import_batch_id', v_batch.id,
    'batch_name', v_batch.batch_name,
    'source_name', v_batch.source_name,
    'source_dataset', coalesce(v_row.source_dataset, v_batch.source_dataset),
    'source_url', coalesce(v_row.source_url, v_batch.source_url),
    'source_license_note', v_batch.source_license_note,
    'source_file_name', v_batch.source_file_name,
    'source_file_sha256', v_batch.source_file_sha256,
    'dry_run_report_schema_version', v_batch.dry_run_report_schema_version,
    'dry_run_report_sha256', v_batch.dry_run_report_sha256,
    'dry_run_generated_at', v_batch.dry_run_generated_at,
    'source_row_number', v_row.source_row_number,
    'source_row_id', v_row.source_row_id,
    'source_row_hash', v_row.source_row_hash,
    'dry_run_report_row_number', v_row.dry_run_report_row_number,
    'dry_run_bucket', v_row.dry_run_bucket
  );

  v_metadata := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'action_source', 'seed_import_4f_hidden_canonical_adoption',
    'resolver_visible', false,
    'resolver_visibility_status', 'hidden',
    'seed_import_lineage', v_lineage
  );

  if found then
    v_mapping_id := v_mapping.id;
    v_adoption_result := 'linked_existing_hidden_mapping';
  else
    insert into public.spelling_canonical_mappings (
      misspelling_normalized,
      correct_spelling_normalized,
      micro_skill_key,
      mapping_status,
      resolver_visibility_status,
      dialect_code,
      normalization_version,
      source_seed_import_row_id,
      created_by_admin_user_id,
      created_by_admin_email,
      decision_note,
      metadata
    )
    values (
      v_row.misspelling_normalized,
      v_row.correct_spelling_normalized,
      v_row.suggested_micro_skill_key,
      'active',
      'hidden',
      v_row.dialect_code,
      v_row.normalization_version,
      v_row.id,
      p_admin_user_id,
      nullif(btrim(coalesce(p_admin_email, '')), ''),
      v_note,
      v_metadata
    )
    returning * into v_mapping;

    v_mapping_id := v_mapping.id;
    v_adoption_result := 'created_hidden_mapping';

    insert into public.spelling_canonical_mapping_events (
      mapping_id,
      event_type,
      previous_status,
      new_status,
      previous_misspelling_normalized,
      new_misspelling_normalized,
      previous_correct_spelling_normalized,
      new_correct_spelling_normalized,
      previous_micro_skill_key,
      new_micro_skill_key,
      previous_resolver_visibility_status,
      new_resolver_visibility_status,
      admin_user_id,
      admin_email,
      source_seed_import_row_id,
      note,
      metadata
    )
    values (
      v_mapping_id,
      'created',
      null,
      'active',
      null,
      v_row.misspelling_normalized,
      null,
      v_row.correct_spelling_normalized,
      null,
      v_row.suggested_micro_skill_key,
      null,
      'hidden',
      p_admin_user_id,
      nullif(btrim(coalesce(p_admin_email, '')), ''),
      v_row.id,
      v_note,
      v_metadata || jsonb_build_object('adoption_result', v_adoption_result)
    );
  end if;

  insert into public.spelling_canonical_mapping_events (
    mapping_id,
    event_type,
    previous_status,
    new_status,
    previous_misspelling_normalized,
    new_misspelling_normalized,
    previous_correct_spelling_normalized,
    new_correct_spelling_normalized,
    previous_micro_skill_key,
    new_micro_skill_key,
    previous_resolver_visibility_status,
    new_resolver_visibility_status,
    admin_user_id,
    admin_email,
    source_seed_import_row_id,
    note,
    metadata
  )
  values (
    v_mapping_id,
    'seed_import_adopted',
    v_mapping.mapping_status,
    v_mapping.mapping_status,
    v_mapping.misspelling_normalized,
    v_mapping.misspelling_normalized,
    v_mapping.correct_spelling_normalized,
    v_mapping.correct_spelling_normalized,
    v_mapping.micro_skill_key,
    v_mapping.micro_skill_key,
    v_mapping.resolver_visibility_status,
    v_mapping.resolver_visibility_status,
    p_admin_user_id,
    nullif(btrim(coalesce(p_admin_email, '')), ''),
    v_row.id,
    v_note,
    v_metadata || jsonb_build_object('adoption_result', v_adoption_result)
  );

  update public.spelling_seed_import_rows
  set
    row_status = 'adopted_hidden_canonical',
    canonical_mapping_id = v_mapping_id,
    reviewed_by_admin_user_id = p_admin_user_id,
    reviewed_by_admin_email = nullif(btrim(coalesce(p_admin_email, '')), ''),
    reviewed_at = v_now,
    updated_at = v_now,
    status_reason = 'Adopted into hidden canonical mapping truth by explicit Slice 4F admin action. Resolver visibility remains disabled.',
    review_note = v_note,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'latest_hidden_canonical_adoption', jsonb_build_object(
        'action_source', 'seed_import_4f_hidden_canonical_adoption',
        'canonical_mapping_id', v_mapping_id,
        'adoption_result', v_adoption_result,
        'resolver_visible', false,
        'resolver_visibility_status', 'hidden',
        'adopted_at', v_now,
        'adopted_by_admin_user_id', p_admin_user_id,
        'adopted_by_admin_email', nullif(btrim(coalesce(p_admin_email, '')), ''),
        'adoption_note', v_note
      )
    )
  where id = v_row.id;

  return v_mapping_id;
end;
$$;

revoke all on function public.adopt_seed_import_row_hidden_canonical_admin(
  uuid,
  uuid,
  text,
  text,
  jsonb
) from public;

revoke all on function public.adopt_seed_import_row_hidden_canonical_admin(
  uuid,
  uuid,
  text,
  text,
  jsonb
) from anon;

revoke all on function public.adopt_seed_import_row_hidden_canonical_admin(
  uuid,
  uuid,
  text,
  text,
  jsonb
) from authenticated;

grant execute on function public.adopt_seed_import_row_hidden_canonical_admin(
  uuid,
  uuid,
  text,
  text,
  jsonb
) to service_role;

revoke all on table public.spelling_seed_import_batches from anon, authenticated;
revoke all on table public.spelling_seed_import_rows from anon, authenticated;
grant all on table public.spelling_seed_import_batches to service_role;
grant all on table public.spelling_seed_import_rows to service_role;

commit;
