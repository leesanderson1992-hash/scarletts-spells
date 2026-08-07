begin;

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
      'seed_import_adopted',
      'automatic_detection_eligibility_updated'
    )
  );

-- Remove the PostgreSQL-truncated name from an early staging application of
-- this migration. The governed RPC below deliberately stays under 63 bytes.
drop function if exists public.set_spelling_canonical_mapping_automatic_detection_eligibility_(
  uuid, text, uuid, text, text, jsonb
);

create or replace function public.set_spelling_canonical_mapping_auto_detection_admin(
  p_mapping_id uuid,
  p_new_eligibility text,
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
  v_mapping public.spelling_canonical_mappings%rowtype;
  v_previous_eligibility text;
  v_note text;
begin
  if p_admin_user_id is null then
    raise exception 'Automatic detection eligibility changes require an admin user id.';
  end if;

  if p_new_eligibility not in ('token_safe', 'context_required', 'disabled') then
    raise exception 'Automatic detection eligibility must be token_safe, context_required, or disabled.';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is null then
    raise exception 'Automatic detection eligibility changes require an admin note.';
  end if;

  select *
  into v_mapping
  from public.spelling_canonical_mappings
  where id = p_mapping_id
  for update;

  if not found then
    raise exception 'Canonical mapping not found.';
  end if;

  if v_mapping.mapping_status <> 'active' then
    raise exception 'Only active canonical mappings can change automatic detection eligibility.';
  end if;

  if p_new_eligibility = 'token_safe' then
    if v_mapping.resolver_visibility_status <> 'visible' then
      raise exception 'Token-safe automatic detection requires a resolver-visible mapping.';
    end if;

    if not exists (
      select 1
      from public.spelling_canonical_mapping_events
      where mapping_id = v_mapping.id
        and event_type = 'resolver_visibility_enabled'
        and new_resolver_visibility_status = 'visible'
    ) then
      raise exception 'Token-safe automatic detection requires resolver visibility audit evidence.';
    end if;

    if v_mapping.misspelling_normalized !~ '^[a-z]+$'
      or v_mapping.correct_spelling_normalized !~ '^[a-z]+$'
      or v_mapping.misspelling_normalized = v_mapping.correct_spelling_normalized then
      raise exception 'Token-safe automatic detection requires a valid normalized spelling pair.';
    end if;

    if not exists (
      select 1
      from public.micro_skill_catalog
      where micro_skill_key = v_mapping.micro_skill_key
        and mastery_domain_key = 'D4'
        and is_active = true
        and is_assignable = true
    ) then
      raise exception 'Token-safe automatic detection requires an active assignable D4 relationship.';
    end if;
  end if;

  v_previous_eligibility := nullif(
    btrim(coalesce(v_mapping.metadata ->> 'automatic_detection_eligibility', '')),
    ''
  );

  if v_previous_eligibility = p_new_eligibility then
    return v_mapping.id;
  end if;

  update public.spelling_canonical_mappings
  set
    metadata = jsonb_set(
      coalesce(metadata, '{}'::jsonb),
      '{automatic_detection_eligibility}',
      to_jsonb(p_new_eligibility),
      true
    ),
    updated_at = timezone('utc', now())
  where id = v_mapping.id;

  insert into public.spelling_canonical_mapping_events (
    mapping_id,
    event_type,
    previous_status,
    new_status,
    previous_resolver_visibility_status,
    new_resolver_visibility_status,
    previous_misspelling_normalized,
    new_misspelling_normalized,
    previous_correct_spelling_normalized,
    new_correct_spelling_normalized,
    previous_micro_skill_key,
    new_micro_skill_key,
    admin_user_id,
    admin_email,
    source_case_id,
    source_decision_id,
    note,
    metadata
  ) values (
    v_mapping.id,
    'automatic_detection_eligibility_updated',
    v_mapping.mapping_status,
    v_mapping.mapping_status,
    v_mapping.resolver_visibility_status,
    v_mapping.resolver_visibility_status,
    v_mapping.misspelling_normalized,
    v_mapping.misspelling_normalized,
    v_mapping.correct_spelling_normalized,
    v_mapping.correct_spelling_normalized,
    v_mapping.micro_skill_key,
    v_mapping.micro_skill_key,
    p_admin_user_id,
    nullif(btrim(coalesce(p_admin_email, '')), ''),
    v_mapping.source_case_id,
    v_mapping.source_decision_id,
    v_note,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'action_source', 'canonical_misspelling_intake_v1',
      'previous_automatic_detection_eligibility', v_previous_eligibility,
      'new_automatic_detection_eligibility', p_new_eligibility
    )
  );

  return v_mapping.id;
end;
$$;

create or replace function public.find_resolver_visible_token_safe_canonical_mappings(
  p_observed_normalized_tokens text[],
  p_dialect_code text default 'en-GB',
  p_normalization_version text default 'spelling_normalize_v1'
) returns table (
  mapping_id uuid,
  misspelling_normalized text,
  correct_spelling_normalized text,
  micro_skill_key text,
  dialect_code text,
  normalization_version text,
  authority_reference text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    mapping.id,
    mapping.misspelling_normalized,
    mapping.correct_spelling_normalized,
    mapping.micro_skill_key,
    mapping.dialect_code,
    mapping.normalization_version,
    case
      when mapping.source_decision_id is not null
        then 'catalog_review_decision:' || mapping.source_decision_id::text
      when mapping.source_seed_import_row_id is not null
        then 'seed_import_row:' || mapping.source_seed_import_row_id::text
      when mapping.source_case_id is not null
        then 'catalog_review_case:' || mapping.source_case_id::text
      else 'canonical_mapping:' || mapping.id::text
    end
  from public.spelling_canonical_mappings as mapping
  join public.micro_skill_catalog as micro_skill
    on micro_skill.micro_skill_key = mapping.micro_skill_key
    and micro_skill.mastery_domain_key = 'D4'
    and micro_skill.is_active = true
    and micro_skill.is_assignable = true
  where mapping.misspelling_normalized = any(coalesce(p_observed_normalized_tokens, array[]::text[]))
    and mapping.mapping_status = 'active'
    and mapping.resolver_visibility_status = 'visible'
    and mapping.dialect_code = p_dialect_code
    and mapping.normalization_version = p_normalization_version
    and mapping.metadata ->> 'automatic_detection_eligibility' = 'token_safe'
    and mapping.misspelling_normalized ~ '^[a-z]+$'
    and mapping.correct_spelling_normalized ~ '^[a-z]+$'
    and mapping.misspelling_normalized <> mapping.correct_spelling_normalized
    and exists (
      select 1
      from public.spelling_canonical_mapping_events as event
      where event.mapping_id = mapping.id
        and event.event_type = 'resolver_visibility_enabled'
        and event.new_resolver_visibility_status = 'visible'
    )
  order by mapping.misspelling_normalized, mapping.correct_spelling_normalized, mapping.created_at;
$$;

create or replace function public.replace_misspelling_analysis_atomic(
  p_writing_sample_id uuid,
  p_parent_user_id uuid,
  p_child_id uuid,
  p_rows jsonb
) returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sample public.writing_samples%rowtype;
  v_row jsonb;
  v_row_id uuid;
  v_keep_ids uuid[] := array[]::uuid[];
  v_occurrence_keys text[] := array[]::text[];
  v_occurrence_key text;
begin
  if p_writing_sample_id is null or p_parent_user_id is null or p_child_id is null then
    raise exception 'Atomic spelling analysis replacement requires sample, parent, and child ids.';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Atomic spelling analysis replacement requires a JSON array of rows.';
  end if;

  select *
  into v_sample
  from public.writing_samples
  where id = p_writing_sample_id
    and parent_user_id = p_parent_user_id
    and child_id = p_child_id
  for update;

  if not found then
    raise exception 'Writing sample does not match the requested parent and child scope.';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    if coalesce(v_row ->> 'writing_sample_id', '') <> p_writing_sample_id::text
      or coalesce(v_row ->> 'parent_user_id', '') <> p_parent_user_id::text
      or coalesce(v_row ->> 'child_id', '') <> p_child_id::text then
      raise exception 'Replacement row escaped the writing sample scope.';
    end if;

    if nullif(btrim(coalesce(v_row ->> 'misspelled_word', '')), '') is null
      or nullif(btrim(coalesce(v_row ->> 'corrected_word', '')), '') is null then
      raise exception 'Replacement rows require a misspelling and correction.';
    end if;

    v_occurrence_key := concat_ws(
      ':',
      coalesce(v_row ->> 'position_start', 'null'),
      coalesce(v_row ->> 'position_end', 'null'),
      lower(v_row ->> 'misspelled_word'),
      lower(v_row ->> 'corrected_word')
    );

    if v_occurrence_key = any(v_occurrence_keys) then
      raise exception 'Replacement analysis contains a duplicate occurrence row.';
    end if;
    v_occurrence_keys := array_append(v_occurrence_keys, v_occurrence_key);

    v_row_id := coalesce(nullif(v_row ->> 'id', '')::uuid, gen_random_uuid());

    if v_row ? 'id' and nullif(v_row ->> 'id', '') is not null and not exists (
      select 1
      from public.misspelling_instances
      where id = v_row_id
        and writing_sample_id = p_writing_sample_id
        and parent_user_id = p_parent_user_id
        and child_id = p_child_id
    ) then
      raise exception 'Replacement row id does not belong to the writing sample scope.';
    end if;

    insert into public.misspelling_instances (
      id,
      writing_sample_id,
      child_id,
      parent_user_id,
      misspelled_word,
      corrected_word,
      word_family_id,
      context_text,
      position_start,
      position_end,
      notes,
      error_type,
      secondary_error_type,
      confidence_score,
      suggested_word,
      is_parent_overridden,
      is_false_positive,
      updated_at
    ) values (
      v_row_id,
      p_writing_sample_id,
      p_child_id,
      p_parent_user_id,
      v_row ->> 'misspelled_word',
      v_row ->> 'corrected_word',
      nullif(v_row ->> 'word_family_id', '')::uuid,
      v_row ->> 'context_text',
      nullif(v_row ->> 'position_start', '')::integer,
      nullif(v_row ->> 'position_end', '')::integer,
      v_row ->> 'notes',
      nullif(v_row ->> 'error_type', ''),
      nullif(v_row ->> 'secondary_error_type', ''),
      nullif(v_row ->> 'confidence_score', '')::numeric,
      nullif(v_row ->> 'suggested_word', ''),
      coalesce((v_row ->> 'is_parent_overridden')::boolean, false),
      coalesce((v_row ->> 'is_false_positive')::boolean, false),
      timezone('utc', now())
    )
    on conflict (id) do update set
      misspelled_word = excluded.misspelled_word,
      corrected_word = excluded.corrected_word,
      word_family_id = excluded.word_family_id,
      context_text = excluded.context_text,
      position_start = excluded.position_start,
      position_end = excluded.position_end,
      notes = excluded.notes,
      error_type = excluded.error_type,
      secondary_error_type = excluded.secondary_error_type,
      confidence_score = excluded.confidence_score,
      suggested_word = excluded.suggested_word,
      is_parent_overridden = excluded.is_parent_overridden,
      is_false_positive = excluded.is_false_positive,
      updated_at = excluded.updated_at;

    v_keep_ids := array_append(v_keep_ids, v_row_id);
  end loop;

  delete from public.misspelling_instances
  where writing_sample_id = p_writing_sample_id
    and parent_user_id = p_parent_user_id
    and child_id = p_child_id
    and not (id = any(v_keep_ids));

  return v_keep_ids;
end;
$$;

revoke all on function public.set_spelling_canonical_mapping_auto_detection_admin(
  uuid, text, uuid, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.set_spelling_canonical_mapping_auto_detection_admin(
  uuid, text, uuid, text, text, jsonb
) to service_role;

revoke all on function public.find_resolver_visible_token_safe_canonical_mappings(
  text[], text, text
) from public, anon, authenticated;
grant execute on function public.find_resolver_visible_token_safe_canonical_mappings(
  text[], text, text
) to service_role;

revoke all on function public.replace_misspelling_analysis_atomic(
  uuid, uuid, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.replace_misspelling_analysis_atomic(
  uuid, uuid, uuid, jsonb
) to service_role;

notify pgrst, 'reload schema';

commit;
