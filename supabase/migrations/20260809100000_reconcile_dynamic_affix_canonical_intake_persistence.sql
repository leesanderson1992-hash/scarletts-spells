begin;

-- Reconcile the canonical-intake persistence boundary after the guarded
-- Dynamic Affix replacement. Staging still has the historical nine-argument
-- function while Production has the guarded eleven-argument function, so
-- remove both possible signatures before installing one governed contract.
drop function if exists public.adle_persist_canonical_intake(
  uuid, uuid, text, uuid, uuid, text, text, text, date
);
drop function if exists public.adle_persist_canonical_intake(
  uuid, uuid, text, uuid, uuid, text, text, text, date, text, text
);

create function public.adle_persist_canonical_intake(
  p_child_id uuid,
  p_canonical_word_id uuid,
  p_micro_skill_key text,
  p_candidate_mapping_id uuid,
  p_canonical_mapping_id uuid,
  p_misspelling_normalized text,
  p_correct_spelling_normalized text,
  p_source_ref text,
  p_verified_on date,
  p_route_id text,
  p_route_version text
)
returns table (learning_item_id uuid, inserted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_learning_item_id uuid;
  v_inserted boolean := false;
  v_candidate public.adle_canonical_intake_candidates%rowtype;
  v_source public.parent_verified_spelling_candidate_mappings%rowtype;
  v_route_id text;
  v_route_version text;
  v_is_affix boolean := p_micro_skill_key in (
    'D4_MOR_SUFFIXES_AL',
    'D4_MOR_SUFFIXES_ABLE_IBLE',
    'D4_MOR_SUFFIXES_FUL_LESS',
    'D4_MOR_SUFFIXES_ITY',
    'D4_MOR_SUFFIXES_LY',
    'D4_MOR_SUFFIXES_MENT',
    'D4_MOR_SUFFIXES_NESS',
    'D4_MOR_SUFFIXES_OUS',
    'D4_MOR_SUFFIXES_SION',
    'D4_MOR_SUFFIXES_TION'
  );
begin
  perform pg_advisory_xact_lock(hashtextextended(
    p_child_id::text || ':' || p_canonical_word_id::text || ':' || p_micro_skill_key,
    0
  ));

  select * into v_source
  from public.parent_verified_spelling_candidate_mappings c
  where c.id = p_candidate_mapping_id
    and c.child_id = p_child_id
    and c.misspelling_normalized = p_misspelling_normalized
    and c.correct_spelling_normalized = p_correct_spelling_normalized
    and c.micro_skill_key = p_micro_skill_key
    and c.candidate_status = any (
      array['parent_local_promoted', 'global_canonical_promoted']
    )
  for update;
  if not found or v_source.task_submission_id is null then
    raise exception 'canonical intake candidate identity is no longer approved';
  end if;

  if not exists (
    select 1
    from public.canonical_teaching_dictionary_words w
    where w.id = p_canonical_word_id
      and w.normalised_word = p_correct_spelling_normalized
      and w.row_status = 'active'
      and w.review_status = 'approved_for_first_exposure'
  ) then
    raise exception 'canonical intake target identity is no longer assignment-approved';
  end if;

  if v_is_affix then
    if p_route_id <> 'dynamic_affix_word_lab' or p_route_version <> 'v3' then
      raise exception 'Dynamic Affix candidate must request dynamic_affix_word_lab:v3';
    end if;
    if not exists (
      select 1
      from public.canonical_teaching_dictionary_suffix_profiles profile
      join public.canonical_teaching_dictionary_suffix_members member
        on member.suffix_profile_id = profile.id
      join public.micro_skill_catalog skill
        on skill.micro_skill_key = profile.micro_skill_key
      where profile.micro_skill_key = p_micro_skill_key
        and profile.production_enabled = true
        and profile.row_status = 'active'
        and profile.review_status = 'approved_for_first_exposure'
        and skill.mastery_domain_key = 'D4'
        and skill.is_active = true
        and skill.is_assignable = true
        and member.canonical_word_id = p_canonical_word_id
        and member.assignment_eligible = true
        and member.row_status = 'active'
        and member.review_status = 'approved_for_first_exposure'
    ) then
      raise exception 'Dynamic Affix candidate is not an exact production-ready profile member';
    end if;
    v_route_id := 'dynamic_affix_word_lab';
    v_route_version := 'v3';
  elsif p_micro_skill_key like 'D4_MOR_PREFIXES_%' then
    if p_route_id <> 'dynamic_prefix_word_lab' or p_route_version <> 'v2' then
      raise exception 'Dynamic Prefix candidate requested an invalid route';
    end if;
    v_route_id := 'dynamic_prefix_word_lab';
    v_route_version := 'v2';
  else
    if p_route_id <> 'adle_word_level' or p_route_version <> 'v1' then
      raise exception 'generic candidate requested an invalid route';
    end if;
    v_route_id := 'adle_word_level';
    v_route_version := 'v1';
  end if;

  select item.id into v_learning_item_id
  from public.adle_learning_items item
  where item.child_id = p_child_id
    and item.canonical_word_id = p_canonical_word_id
    and item.micro_skill_key = p_micro_skill_key
    and item.row_status = 'active'
  order by item.intake_on desc, item.id
  limit 1;

  if v_learning_item_id is null then
    insert into public.adle_learning_items (
      child_id,
      canonical_word_id,
      micro_skill_key,
      item_status,
      source_kind,
      source_ref,
      source_attempt_text,
      reteach_priority,
      ejected_on,
      intake_on,
      row_status
    ) values (
      p_child_id,
      p_canonical_word_id,
      p_micro_skill_key,
      'pending',
      'verified_misspelling',
      p_source_ref,
      p_misspelling_normalized,
      false,
      null,
      p_verified_on,
      'active'
    )
    returning id into v_learning_item_id;
    v_inserted := true;
  end if;

  insert into public.adle_learning_item_sources (
    learning_item_id,
    parent_verified_candidate_mapping_id,
    canonical_mapping_id,
    misspelling_normalized,
    correct_spelling_normalized,
    micro_skill_key,
    source_ref,
    row_status
  ) values (
    v_learning_item_id,
    p_candidate_mapping_id,
    p_canonical_mapping_id,
    p_misspelling_normalized,
    p_correct_spelling_normalized,
    p_micro_skill_key,
    p_source_ref,
    'active'
  )
  on conflict do nothing;

  insert into public.adle_canonical_intake_candidates (
    source_candidate_mapping_id,
    source_submission_id,
    child_id,
    normalized_target_token,
    canonical_word_id,
    target_identity_status,
    route_id,
    route_version,
    micro_skill_key,
    candidate_state,
    blockers,
    readiness_fingerprint,
    last_evaluated_at,
    learning_item_id,
    activated_at,
    resolved_at
  ) values (
    p_candidate_mapping_id,
    v_source.task_submission_id,
    p_child_id,
    lower(btrim(p_correct_spelling_normalized)),
    p_canonical_word_id,
    'established',
    v_route_id,
    v_route_version,
    p_micro_skill_key,
    'activated',
    '[]'::jsonb,
    encode(extensions.digest(concat_ws(
      E'\x1f',
      p_candidate_mapping_id::text,
      p_canonical_mapping_id::text,
      p_canonical_word_id::text,
      p_micro_skill_key,
      v_route_id,
      v_route_version
    ), 'sha256'), 'hex'),
    timezone('utc', now()),
    v_learning_item_id,
    timezone('utc', now()),
    timezone('utc', now())
  )
  on conflict (source_candidate_mapping_id) do update set
    canonical_word_id = excluded.canonical_word_id,
    target_identity_status = 'established',
    route_id = excluded.route_id,
    route_version = excluded.route_version,
    micro_skill_key = excluded.micro_skill_key,
    candidate_state = 'activated',
    blockers = '[]'::jsonb,
    readiness_fingerprint = excluded.readiness_fingerprint,
    last_evaluated_at = excluded.last_evaluated_at,
    next_retry_at = null,
    learning_item_id = excluded.learning_item_id,
    activated_at = coalesce(
      public.adle_canonical_intake_candidates.activated_at,
      excluded.activated_at
    ),
    resolved_at = excluded.resolved_at,
    lock_version = public.adle_canonical_intake_candidates.lock_version + 1,
    updated_at = timezone('utc', now())
  returning * into v_candidate;

  update public.adle_canonical_intake_candidate_demands
  set link_status = 'resolved',
      resolved_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where candidate_id = v_candidate.id
    and link_status = 'waiting';

  update public.adle_canonical_intake_demands demand
  set lifecycle_status = 'activated',
      notification_status = 'resolved',
      activated_at = coalesce(demand.activated_at, timezone('utc', now())),
      notification_resolved_at = coalesce(
        demand.notification_resolved_at,
        timezone('utc', now())
      ),
      last_reconciled_at = timezone('utc', now()),
      last_reconciliation_outcome = 'all_waiting_candidates_activated',
      updated_at = timezone('utc', now())
  where exists (
    select 1
    from public.adle_canonical_intake_candidate_demands link
    where link.demand_id = demand.id
      and link.candidate_id = v_candidate.id
  )
    and not exists (
      select 1
      from public.adle_canonical_intake_candidate_demands waiting
      where waiting.demand_id = demand.id
        and waiting.link_status = 'waiting'
    );

  update public.adle_canonical_intake_reconciliation_queue
  set job_status = 'completed',
      completed_at = timezone('utc', now()),
      lease_owner = null,
      lease_expires_at = null,
      updated_at = timezone('utc', now())
  where candidate_id = v_candidate.id
    and job_status in ('pending', 'leased', 'retry');

  insert into public.adle_canonical_intake_events (
    candidate_id,
    event_type,
    actor_type,
    readiness_fingerprint,
    event_payload
  ) values (
    v_candidate.id,
    'candidate_activated',
    'reconciler',
    v_candidate.readiness_fingerprint,
    jsonb_build_object(
      'learningItemId', v_learning_item_id,
      'inserted', v_inserted
    )
  );

  return query select v_learning_item_id, v_inserted;
end;
$$;

revoke all on function public.adle_persist_canonical_intake(
  uuid, uuid, text, uuid, uuid, text, text, text, date, text, text
) from public, anon, authenticated;
grant execute on function public.adle_persist_canonical_intake(
  uuid, uuid, text, uuid, uuid, text, text, text, date, text, text
) to service_role;

commit;
