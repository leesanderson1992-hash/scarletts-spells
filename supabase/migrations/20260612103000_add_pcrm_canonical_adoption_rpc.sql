begin;

alter table public.spelling_canonical_mappings
  add column if not exists source_recommendation_id uuid references public.spelling_canonical_mapping_recommendations(id) on delete set null,
  add column if not exists source_candidate_mapping_id uuid references public.parent_verified_spelling_candidate_mappings(id) on delete set null,
  add column if not exists source_parent_verification_id uuid references public.parent_verifications(id) on delete set null;

alter table public.spelling_canonical_mapping_events
  add column if not exists source_recommendation_id uuid references public.spelling_canonical_mapping_recommendations(id) on delete set null,
  add column if not exists source_candidate_mapping_id uuid references public.parent_verified_spelling_candidate_mappings(id) on delete set null,
  add column if not exists source_parent_verification_id uuid references public.parent_verifications(id) on delete set null;

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
      'pcrm_adopted'
    )
  );

create index if not exists spelling_canonical_mappings_source_recommendation_idx
  on public.spelling_canonical_mappings (source_recommendation_id, created_at desc);

create index if not exists spelling_canonical_mapping_events_source_recommendation_idx
  on public.spelling_canonical_mapping_events (source_recommendation_id, created_at desc);

create or replace function public.adopt_spelling_canonical_mapping_recommendation_admin(
  p_recommendation_id uuid,
  p_admin_user_id uuid,
  p_admin_email text default null,
  p_note text default null,
  p_dialect_code text default 'en-GB',
  p_normalization_version text default 'spelling_normalize_v1',
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recommendation public.spelling_canonical_mapping_recommendations%rowtype;
  v_micro_skill record;
  v_mapping public.spelling_canonical_mappings%rowtype;
  v_mapping_id uuid;
  v_note text;
  v_dialect_code text;
  v_normalization_version text;
  v_now timestamptz := timezone('utc', now());
  v_lineage jsonb;
  v_metadata jsonb;
begin
  if p_admin_user_id is null then
    raise exception 'PCRM canonical adoption requires an admin user id.';
  end if;

  if p_recommendation_id is null then
    raise exception 'PCRM canonical adoption requires a recommendation id.';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');

  if v_note is null then
    raise exception 'PCRM canonical adoption requires an admin note.';
  end if;

  v_dialect_code := nullif(btrim(coalesce(p_dialect_code, '')), '');
  v_normalization_version := nullif(btrim(coalesce(p_normalization_version, '')), '');

  if v_dialect_code is null then
    v_dialect_code := 'en-GB';
  end if;

  if v_normalization_version is null then
    v_normalization_version := 'spelling_normalize_v1';
  end if;

  select *
  into v_recommendation
  from public.spelling_canonical_mapping_recommendations
  where id = p_recommendation_id
  for update;

  if not found then
    raise exception 'PCRM recommendation not found.';
  end if;

  if v_recommendation.recommendation_status <> 'accepted' then
    raise exception 'Only accepted PCRM recommendation evidence can be adopted.';
  end if;

  if v_recommendation.canonical_mapping_id is not null then
    raise exception 'PCRM recommendation is already linked to a canonical mapping.';
  end if;

  if v_recommendation.duplicate_of_recommendation_id is not null
    or v_recommendation.merge_target_recommendation_id is not null
    or v_recommendation.superseded_by_recommendation_id is not null
  then
    raise exception 'Duplicate, merged, or superseded PCRM evidence must follow its target row.';
  end if;

  if nullif(btrim(coalesce(v_recommendation.source_provenance, '')), '') is null then
    raise exception 'PCRM canonical adoption requires source provenance.';
  end if;

  if nullif(btrim(coalesce(v_recommendation.misspelling_normalized, '')), '') is null
    or nullif(btrim(coalesce(v_recommendation.correct_spelling_normalized, '')), '') is null
    or btrim(v_recommendation.misspelling_normalized) = btrim(v_recommendation.correct_spelling_normalized)
  then
    raise exception 'PCRM canonical adoption requires a normalized spelling pair.';
  end if;

  select micro_skill_key, mastery_domain_key, is_active, is_assignable
  into v_micro_skill
  from public.micro_skill_catalog
  where micro_skill_key = v_recommendation.micro_skill_key
    and mastery_domain_key = 'D4'
    and is_active = true
    and is_assignable = true;

  if not found then
    raise exception 'PCRM canonical adoption requires an active assignable D4 micro-skill.';
  end if;

  if exists (
    select 1
    from public.spelling_canonical_mappings
    where misspelling_normalized = v_recommendation.misspelling_normalized
      and correct_spelling_normalized = v_recommendation.correct_spelling_normalized
      and dialect_code = v_dialect_code
      and mapping_status <> 'active'
  ) then
    raise exception 'PCRM canonical adoption is blocked by a disabled, deprecated, or superseded canonical mapping.';
  end if;

  if exists (
    select 1
    from public.spelling_canonical_mappings
    where misspelling_normalized = v_recommendation.misspelling_normalized
      and correct_spelling_normalized <> v_recommendation.correct_spelling_normalized
      and dialect_code = v_dialect_code
      and mapping_status = 'active'
  ) then
    raise exception 'PCRM canonical adoption conflict: same misspelling has a different active correction.';
  end if;

  select *
  into v_mapping
  from public.spelling_canonical_mappings
  where misspelling_normalized = v_recommendation.misspelling_normalized
    and correct_spelling_normalized = v_recommendation.correct_spelling_normalized
    and dialect_code = v_dialect_code
    and mapping_status = 'active'
  order by created_at
  limit 1
  for update;

  if found and v_mapping.micro_skill_key <> v_recommendation.micro_skill_key then
    raise exception 'PCRM canonical adoption conflict: exact pair has a different active micro-skill.';
  end if;

  v_lineage := jsonb_build_object(
    'source_recommendation_id', v_recommendation.id,
    'source_candidate_mapping_id', v_recommendation.candidate_mapping_id,
    'source_parent_verification_id', v_recommendation.parent_verification_id,
    'source_task_submission_id', v_recommendation.task_submission_id,
    'source_writing_sample_id', v_recommendation.writing_sample_id,
    'source_misspelling_instance_id', v_recommendation.source_misspelling_instance_id,
    'source_writing_issue_id', v_recommendation.source_writing_issue_id,
    'source_correction_attempt_id', v_recommendation.source_correction_attempt_id,
    'source_suggestion_id', v_recommendation.source_suggestion_id,
    'reviewed_event_source_entity_id', v_recommendation.reviewed_event_source_entity_id,
    'source_row_type', v_recommendation.source_row_type,
    'source_provenance', v_recommendation.source_provenance,
    'parent_user_id', v_recommendation.parent_user_id,
    'child_id', v_recommendation.child_id
  );

  v_metadata := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'action_source', 'pcrm_g_canonical_adoption',
    'resolver_visible', false,
    'resolver_visibility_status', 'hidden',
    'pcrm_lineage', v_lineage
  );

  if found then
    v_mapping_id := v_mapping.id;
  else
    insert into public.spelling_canonical_mappings (
      misspelling_normalized,
      correct_spelling_normalized,
      micro_skill_key,
      mapping_status,
      dialect_code,
      normalization_version,
      source_recommendation_id,
      source_candidate_mapping_id,
      source_parent_verification_id,
      created_by_admin_user_id,
      created_by_admin_email,
      decision_note,
      metadata
    )
    values (
      v_recommendation.misspelling_normalized,
      v_recommendation.correct_spelling_normalized,
      v_recommendation.micro_skill_key,
      'active',
      v_dialect_code,
      v_normalization_version,
      v_recommendation.id,
      v_recommendation.candidate_mapping_id,
      v_recommendation.parent_verification_id,
      p_admin_user_id,
      nullif(btrim(coalesce(p_admin_email, '')), ''),
      v_note,
      v_metadata
    )
    returning * into v_mapping;

    v_mapping_id := v_mapping.id;

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
      source_recommendation_id,
      source_candidate_mapping_id,
      source_parent_verification_id,
      note,
      metadata
    )
    values (
      v_mapping_id,
      'created',
      null,
      'active',
      null,
      v_recommendation.misspelling_normalized,
      null,
      v_recommendation.correct_spelling_normalized,
      null,
      v_recommendation.micro_skill_key,
      null,
      'hidden',
      p_admin_user_id,
      nullif(btrim(coalesce(p_admin_email, '')), ''),
      v_recommendation.id,
      v_recommendation.candidate_mapping_id,
      v_recommendation.parent_verification_id,
      v_note,
      v_metadata
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
    source_recommendation_id,
    source_candidate_mapping_id,
    source_parent_verification_id,
    note,
    metadata
  )
  values (
    v_mapping_id,
    'pcrm_adopted',
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
    v_recommendation.id,
    v_recommendation.candidate_mapping_id,
    v_recommendation.parent_verification_id,
    v_note,
    v_metadata || jsonb_build_object(
      'linked_existing_mapping', v_mapping.source_recommendation_id is distinct from v_recommendation.id
    )
  );

  update public.spelling_canonical_mapping_recommendations
  set
    canonical_mapping_id = v_mapping_id,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'resolver_visible', false,
      'latest_canonical_adoption', jsonb_build_object(
        'action_source', 'pcrm_g_canonical_adoption',
        'canonical_mapping_id', v_mapping_id,
        'resolver_visible', false,
        'resolver_visibility_status', v_mapping.resolver_visibility_status,
        'adopted_at', v_now,
        'adopted_by_admin_user_id', p_admin_user_id,
        'adopted_by_admin_email', nullif(btrim(coalesce(p_admin_email, '')), ''),
        'linked_existing_mapping', v_mapping.source_recommendation_id is distinct from v_recommendation.id
      )
    )
  where id = v_recommendation.id;

  return v_mapping_id;
end;
$$;

revoke all on function public.adopt_spelling_canonical_mapping_recommendation_admin(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  jsonb
) from public;

revoke all on function public.adopt_spelling_canonical_mapping_recommendation_admin(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  jsonb
) from anon;

revoke all on function public.adopt_spelling_canonical_mapping_recommendation_admin(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  jsonb
) from authenticated;

grant execute on function public.adopt_spelling_canonical_mapping_recommendation_admin(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  jsonb
) to service_role;

commit;
