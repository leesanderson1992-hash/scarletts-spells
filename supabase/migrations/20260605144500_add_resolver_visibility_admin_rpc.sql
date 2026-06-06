begin;

create or replace function public.set_spelling_canonical_mapping_resolver_visibility_admin(
  p_mapping_id uuid,
  p_new_resolver_visibility_status text,
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
  v_note text;
  v_event_type text;
  v_conflicting_pair_count integer := 0;
  v_conflicting_correction_count integer := 0;
  v_conflicting_mapping_ids uuid[] := array[]::uuid[];
  v_has_created_event boolean := false;
  v_metadata jsonb;
begin
  if p_admin_user_id is null then
    raise exception 'Resolver visibility changes require an admin user id.';
  end if;

  if p_new_resolver_visibility_status not in ('visible', 'disabled') then
    raise exception 'Resolver visibility target must be visible or disabled.';
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
    raise exception 'Only active canonical mappings can change resolver visibility.';
  end if;

  if p_new_resolver_visibility_status = 'visible'
    and v_mapping.resolver_visibility_status = 'visible' then
    raise exception 'Canonical mapping is already resolver-visible.';
  end if;

  if p_new_resolver_visibility_status = 'disabled'
    and v_mapping.resolver_visibility_status <> 'visible' then
    raise exception 'Only resolver-visible mappings can be disabled.';
  end if;

  if p_new_resolver_visibility_status = 'visible' then
    if v_mapping.created_by_admin_user_id is null then
      raise exception 'Resolver visibility requires admin provenance.';
    end if;

    select exists (
      select 1
      from public.spelling_canonical_mapping_events
      where mapping_id = v_mapping.id
        and event_type = 'created'
        and new_status = 'active'
    )
    into v_has_created_event;

    if not v_has_created_event then
      raise exception 'Resolver visibility requires canonical mapping creation audit history.';
    end if;

    if not exists (
      select 1
      from public.micro_skill_catalog
      where micro_skill_key = v_mapping.micro_skill_key
        and mastery_domain_key = 'D4'
        and is_active = true
        and is_assignable = true
    ) then
      raise exception 'Resolver visibility requires an active assignable D4 micro-skill.';
    end if;

    select
      count(*),
      coalesce(array_agg(id order by created_at), array[]::uuid[])
    into v_conflicting_correction_count, v_conflicting_mapping_ids
    from public.spelling_canonical_mappings
    where id <> v_mapping.id
      and mapping_status = 'active'
      and resolver_visibility_status = 'visible'
      and misspelling_normalized = v_mapping.misspelling_normalized
      and dialect_code = v_mapping.dialect_code
      and normalization_version = v_mapping.normalization_version
      and correct_spelling_normalized <> v_mapping.correct_spelling_normalized;

    if v_conflicting_correction_count > 0 then
      raise exception 'Resolver visibility conflict: same misspelling has a different visible correction.';
    end if;

    select
      count(*),
      coalesce(array_agg(id order by created_at), array[]::uuid[])
    into v_conflicting_pair_count, v_conflicting_mapping_ids
    from public.spelling_canonical_mappings
    where id <> v_mapping.id
      and mapping_status = 'active'
      and resolver_visibility_status = 'visible'
      and misspelling_normalized = v_mapping.misspelling_normalized
      and correct_spelling_normalized = v_mapping.correct_spelling_normalized
      and dialect_code = v_mapping.dialect_code
      and normalization_version = v_mapping.normalization_version
      and micro_skill_key <> v_mapping.micro_skill_key;

    if v_conflicting_pair_count > 0 then
      raise exception 'Resolver visibility conflict: exact pair has a different visible micro-skill.';
    end if;
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');

  if v_note is null then
    raise exception 'Resolver visibility changes require an admin note.';
  end if;

  v_event_type := case
    when p_new_resolver_visibility_status = 'visible'
      then 'resolver_visibility_enabled'
    else 'resolver_visibility_disabled'
  end;

  v_metadata := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'action_source',
    'resolver_visibility_admin_r2',
    'conflict_check',
    jsonb_build_object(
      'same_pair_different_micro_skill_count',
      v_conflicting_pair_count,
      'same_misspelling_different_correction_count',
      v_conflicting_correction_count,
      'conflicting_mapping_ids',
      to_jsonb(v_conflicting_mapping_ids)
    )
  );

  update public.spelling_canonical_mappings
  set
    resolver_visibility_status = p_new_resolver_visibility_status,
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
  )
  values (
    v_mapping.id,
    v_event_type,
    v_mapping.mapping_status,
    v_mapping.mapping_status,
    v_mapping.resolver_visibility_status,
    p_new_resolver_visibility_status,
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
    v_metadata
  );

  return v_mapping.id;
end;
$$;

revoke all on function public.set_spelling_canonical_mapping_resolver_visibility_admin(
  uuid,
  text,
  uuid,
  text,
  text,
  jsonb
) from public;

revoke all on function public.set_spelling_canonical_mapping_resolver_visibility_admin(
  uuid,
  text,
  uuid,
  text,
  text,
  jsonb
) from anon;

revoke all on function public.set_spelling_canonical_mapping_resolver_visibility_admin(
  uuid,
  text,
  uuid,
  text,
  text,
  jsonb
) from authenticated;

grant execute on function public.set_spelling_canonical_mapping_resolver_visibility_admin(
  uuid,
  text,
  uuid,
  text,
  text,
  jsonb
) to service_role;

commit;
