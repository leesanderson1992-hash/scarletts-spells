-- R8B: make final parent approval occurrence-complete without invoking ADLE
-- canonical intake. Legacy learning_items remain microskill/route containers.

begin;

-- R8B-created occurrence sources are not eligible for whole-submission intake.
-- NULL preserves the released behaviour of candidate sources that pre-date R8B;
-- the only non-NULL state is deliberately immutable until the separately gated
-- R8C exact-ID handoff replaces this protection with its controlled transition.
alter table public.parent_verified_spelling_candidate_mappings
  add column canonical_intake_handoff_state text;

alter table public.parent_verified_spelling_candidate_mappings
  add constraint parent_verified_spelling_candidate_mappings_handoff_state_check
  check (
    canonical_intake_handoff_state is null
    or canonical_intake_handoff_state = 'awaiting_r8c_exact_id_handoff'
  );

create or replace function public.protect_r8b_canonical_intake_handoff_state()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_occurrence_governor_owner name;
begin
  if tg_op = 'UPDATE'
    and new.canonical_intake_handoff_state
      is distinct from old.canonical_intake_handoff_state
  then
    raise exception 'Canonical intake handoff state is server-controlled and immutable before R8C.';
  end if;

  if tg_op = 'UPDATE'
    and old.canonical_intake_handoff_state = 'awaiting_r8c_exact_id_handoff'
  then
    select pg_get_userbyid(procedure.proowner)
    into v_occurrence_governor_owner
    from pg_proc procedure
    where procedure.oid =
      'public.ensure_parent_approved_spelling_occurrence_source(uuid,uuid,uuid,text)'::regprocedure;

    if current_user is distinct from v_occurrence_governor_owner
      and (
        new.id is distinct from old.id
        or new.parent_user_id is distinct from old.parent_user_id
        or new.child_id is distinct from old.child_id
        or new.parent_verification_id is distinct from old.parent_verification_id
        or new.task_submission_id is distinct from old.task_submission_id
        or new.writing_sample_id is distinct from old.writing_sample_id
        or new.source_suggestion_id is distinct from old.source_suggestion_id
        or new.source_misspelling_instance_id is distinct from old.source_misspelling_instance_id
        or new.source_adle_review_session_id is distinct from old.source_adle_review_session_id
        or new.source_provenance is distinct from old.source_provenance
        or new.reviewed_event_source_entity_id is distinct from old.reviewed_event_source_entity_id
        or new.original_child_spelling is distinct from old.original_child_spelling
        or new.original_correct_spelling is distinct from old.original_correct_spelling
        or new.misspelling_normalized is distinct from old.misspelling_normalized
        or new.correct_spelling_normalized is distinct from old.correct_spelling_normalized
        or new.micro_skill_key is distinct from old.micro_skill_key
        or new.candidate_status is distinct from old.candidate_status
        or new.promotion_scope is distinct from old.promotion_scope
        or new.created_at is distinct from old.created_at
      )
    then
      raise exception 'An R8B occurrence source identity and live status are server-controlled before R8C.';
    end if;
  end if;

  if tg_op = 'DELETE'
    and old.canonical_intake_handoff_state = 'awaiting_r8c_exact_id_handoff'
  then
    raise exception 'An R8B occurrence source awaiting R8C cannot be deleted.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.protect_r8b_canonical_intake_handoff_state()
  from public, anon, authenticated;

create trigger pvscm_protect_handoff_update
before update
on public.parent_verified_spelling_candidate_mappings
for each row
execute function public.protect_r8b_canonical_intake_handoff_state();

create trigger pvscm_protect_handoff_delete
before delete on public.parent_verified_spelling_candidate_mappings
for each row
execute function public.protect_r8b_canonical_intake_handoff_state();

-- Enforce quarantine where governed sources enter canonical-intake persistence.
-- These triggers protect seed, blocked and ready/persist RPCs as well as direct
-- service-role writes; caller-side filtering is only an optimisation.
create or replace function public.enforce_candidate_canonical_intake_handoff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handoff_state text;
begin
  select candidate.canonical_intake_handoff_state
  into v_handoff_state
  from public.parent_verified_spelling_candidate_mappings candidate
  where candidate.id = new.source_candidate_mapping_id;

  if not found then
    raise exception 'Canonical intake requires an existing governed candidate source.';
  end if;

  if v_handoff_state = 'awaiting_r8c_exact_id_handoff' then
    raise exception 'The governed occurrence source is quarantined pending R8C exact-ID handoff.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_candidate_canonical_intake_handoff()
  from public, anon, authenticated;

create trigger adle_canonical_intake_candidates_enforce_source_handoff
before insert or update of source_candidate_mapping_id
on public.adle_canonical_intake_candidates
for each row
execute function public.enforce_candidate_canonical_intake_handoff();

create or replace function public.enforce_learning_item_source_canonical_intake_handoff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handoff_state text;
begin
  if new.parent_verified_candidate_mapping_id is null then
    return new;
  end if;

  select candidate.canonical_intake_handoff_state
  into v_handoff_state
  from public.parent_verified_spelling_candidate_mappings candidate
  where candidate.id = new.parent_verified_candidate_mapping_id;

  if not found then
    raise exception 'Learning-item lineage requires an existing governed candidate source.';
  end if;

  if v_handoff_state = 'awaiting_r8c_exact_id_handoff' then
    raise exception 'The governed occurrence source is quarantined pending R8C exact-ID handoff.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_learning_item_source_canonical_intake_handoff()
  from public, anon, authenticated;

create trigger adle_learning_item_sources_enforce_source_handoff
before insert or update of parent_verified_candidate_mapping_id
on public.adle_learning_item_sources
for each row
execute function public.enforce_learning_item_source_canonical_intake_handoff();

create or replace function public.assert_candidate_canonical_intake_handoff_eligible(
  p_candidate_mapping_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handoff_state text;
begin
  select candidate.canonical_intake_handoff_state
  into v_handoff_state
  from public.parent_verified_spelling_candidate_mappings candidate
  where candidate.id = p_candidate_mapping_id;

  if not found then
    raise exception 'Canonical intake requires an existing governed candidate source.';
  end if;

  if v_handoff_state = 'awaiting_r8c_exact_id_handoff' then
    raise exception 'The governed occurrence source is quarantined pending R8C exact-ID handoff.';
  end if;
end;
$$;

revoke all on function public.assert_candidate_canonical_intake_handoff_eligible(uuid)
  from public, anon, authenticated, service_role;

-- Wrap every released service-role canonical-intake entrypoint. The renamed
-- delegates retain their implementations, while only these guarded public
-- signatures remain executable by service_role.
alter function public.adle_seed_canonical_intake_candidate(
  uuid, text, text, text, text, text
) rename to adle_seed_canonical_intake_candidate_r8b_delegate;

revoke all on function public.adle_seed_canonical_intake_candidate_r8b_delegate(
  uuid, text, text, text, text, text
) from public, anon, authenticated, service_role;

create function public.adle_seed_canonical_intake_candidate(
  p_candidate_mapping_id uuid,
  p_normalized_target_token text,
  p_route_id text,
  p_route_version text,
  p_micro_skill_key text,
  p_source_ref text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_candidate_canonical_intake_handoff_eligible(
    p_candidate_mapping_id
  );
  return public.adle_seed_canonical_intake_candidate_r8b_delegate(
    p_candidate_mapping_id,
    p_normalized_target_token,
    p_route_id,
    p_route_version,
    p_micro_skill_key,
    p_source_ref
  );
end;
$$;

revoke all on function public.adle_seed_canonical_intake_candidate(
  uuid, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.adle_seed_canonical_intake_candidate(
  uuid, text, text, text, text, text
) to service_role;

alter function public.adle_record_canonical_intake_blocked(
  uuid, text, uuid, text, text, text, text, text, jsonb, text, text, text
) rename to adle_record_canonical_intake_blocked_r8b_delegate;

revoke all on function public.adle_record_canonical_intake_blocked_r8b_delegate(
  uuid, text, uuid, text, text, text, text, text, jsonb, text, text, text
) from public, anon, authenticated, service_role;

create function public.adle_record_canonical_intake_blocked(
  p_candidate_mapping_id uuid,
  p_normalized_target_token text,
  p_canonical_word_id uuid,
  p_target_identity_status text,
  p_route_id text,
  p_route_version text,
  p_micro_skill_key text,
  p_candidate_state text,
  p_blockers jsonb,
  p_readiness_fingerprint text,
  p_demand_type text,
  p_primary_blocker_code text
) returns table(candidate_id uuid, demand_id uuid, demand_created boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_candidate_canonical_intake_handoff_eligible(
    p_candidate_mapping_id
  );
  return query
  select *
  from public.adle_record_canonical_intake_blocked_r8b_delegate(
    p_candidate_mapping_id,
    p_normalized_target_token,
    p_canonical_word_id,
    p_target_identity_status,
    p_route_id,
    p_route_version,
    p_micro_skill_key,
    p_candidate_state,
    p_blockers,
    p_readiness_fingerprint,
    p_demand_type,
    p_primary_blocker_code
  );
end;
$$;

revoke all on function public.adle_record_canonical_intake_blocked(
  uuid, text, uuid, text, text, text, text, text, jsonb, text, text, text
) from public, anon, authenticated;
grant execute on function public.adle_record_canonical_intake_blocked(
  uuid, text, uuid, text, text, text, text, text, jsonb, text, text, text
) to service_role;

alter function public.adle_persist_canonical_intake(
  uuid, uuid, text, uuid, uuid, text, text, text, date,
  text, text, uuid, uuid, text, text
) rename to adle_persist_canonical_intake_r8b_delegate;

revoke all on function public.adle_persist_canonical_intake_r8b_delegate(
  uuid, uuid, text, uuid, uuid, text, text, text, date,
  text, text, uuid, uuid, text, text
) from public, anon, authenticated, service_role;

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
  p_route_version text,
  p_route_activation_id uuid default null,
  p_release_manifest_id uuid default null,
  p_release_manifest_sha256 text default null,
  p_dependency_fingerprint text default null
) returns table(learning_item_id uuid, inserted boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_candidate_canonical_intake_handoff_eligible(
    p_candidate_mapping_id
  );
  return query
  select *
  from public.adle_persist_canonical_intake_r8b_delegate(
    p_child_id,
    p_canonical_word_id,
    p_micro_skill_key,
    p_candidate_mapping_id,
    p_canonical_mapping_id,
    p_misspelling_normalized,
    p_correct_spelling_normalized,
    p_source_ref,
    p_verified_on,
    p_route_id,
    p_route_version,
    p_route_activation_id,
    p_release_manifest_id,
    p_release_manifest_sha256,
    p_dependency_fingerprint
  );
end;
$$;

revoke all on function public.adle_persist_canonical_intake(
  uuid, uuid, text, uuid, uuid, text, text, text, date,
  text, text, uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.adle_persist_canonical_intake(
  uuid, uuid, text, uuid, uuid, text, text, text, date,
  text, text, uuid, uuid, text, text
) to service_role;

-- One non-terminal governed source may own a lesson misspelling occurrence.
-- Terminal rejected/superseded rows remain available as immutable audit history.
create unique index parent_verified_spelling_candidate_mappings_live_occurrence_idx
  on public.parent_verified_spelling_candidate_mappings(
    parent_user_id,
    child_id,
    source_misspelling_instance_id
  )
  where source_misspelling_instance_id is not null
    and candidate_status in (
      'pending_parent_promotion',
      'parent_local_promoted',
      'admin_review_requested',
      'global_canonical_promoted'
    );

create or replace function public.ensure_parent_approved_spelling_occurrence_source(
  p_writing_issue_id uuid,
  p_parent_user_id uuid,
  p_child_id uuid,
  p_final_classification text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_issue public.writing_issues%rowtype;
  v_misspelling public.misspelling_instances%rowtype;
  v_candidate public.parent_verified_spelling_candidate_mappings%rowtype;
  v_verification public.parent_verifications%rowtype;
  v_candidate_id uuid;
  v_parent_verification_id uuid;
  v_source_submission_id uuid;
  v_misspelling_normalized text;
  v_correct_spelling_normalized text;
  v_source_provenance text;
  v_source_entity_id text;
  v_known_mapping_id uuid;
  v_has_known_route boolean := false;
  v_has_admin_handoff boolean := false;
  v_is_learning_reason boolean;
  v_requires_spelling_occurrence boolean := false;
  v_now timestamptz := timezone('utc', now());
begin
  if auth.uid() is not null and auth.uid() <> p_parent_user_id then
    raise exception 'Spelling occurrence sources may only be governed by the owning parent.';
  end if;

  v_is_learning_reason := p_final_classification in (
    'fragile_knowledge',
    'concept_gap',
    'transfer_failure'
  );

  select *
  into v_issue
  from public.writing_issues
  where id = p_writing_issue_id
    and parent_user_id = p_parent_user_id
    and child_id = p_child_id
  for update;

  if not found then
    raise exception 'That writing issue no longer exists.';
  end if;

  -- Source identity is authoritative when present. When it is missing, the
  -- governed catalogue domain distinguishes a malformed D4 spelling issue from
  -- valid non-spelling learning issues such as sentence boundaries or grammar.
  v_requires_spelling_occurrence :=
    v_issue.source_misspelling_instance_id is not null
    or exists (
      select 1
      from public.micro_skill_catalog catalog
      where catalog.micro_skill_key = v_issue.micro_skill_key
        and catalog.mastery_domain_key = 'D4'
    );

  if v_issue.source_misspelling_instance_id is null then
    if v_is_learning_reason and v_requires_spelling_occurrence then
      raise exception 'A learning spelling issue requires a source misspelling occurrence.';
    end if;
    return jsonb_build_object(
      'candidate_mapping_id', null,
      'action', 'not_spelling'
    );
  end if;

  select *
  into v_misspelling
  from public.misspelling_instances
  where id = v_issue.source_misspelling_instance_id
    and parent_user_id = p_parent_user_id
    and child_id = p_child_id
  for update;

  if not found then
    raise exception 'The source misspelling occurrence is missing or belongs to another learner.';
  end if;

  v_misspelling_normalized := lower(btrim(coalesce(
    nullif(v_issue.observed_text, ''),
    v_misspelling.misspelled_word
  )));
  v_correct_spelling_normalized := lower(btrim(coalesce(
    nullif(v_issue.approved_replacement, ''),
    nullif(v_issue.suggested_replacement, '')
  )));

  if v_is_learning_reason and (
    coalesce(v_misspelling_normalized, '') = ''
    or coalesce(v_correct_spelling_normalized, '') = ''
    or v_misspelling_normalized = v_correct_spelling_normalized
    or coalesce(btrim(v_issue.micro_skill_key), '') = ''
  ) then
    raise exception 'A learning spelling occurrence requires an exact corrected word and micro-skill identity.';
  end if;

  select attempt.task_submission_id
  into v_source_submission_id
  from public.writing_issue_correction_attempts attempt
  where attempt.writing_issue_id = v_issue.id
    and attempt.parent_user_id = p_parent_user_id
    and attempt.child_id = p_child_id
  order by attempt.created_at desc, attempt.id desc
  limit 1;

  select *
  into v_candidate
  from public.parent_verified_spelling_candidate_mappings candidate
  where candidate.parent_user_id = p_parent_user_id
    and candidate.child_id = p_child_id
    and candidate.source_misspelling_instance_id = v_issue.source_misspelling_instance_id
    and candidate.candidate_status in (
      'pending_parent_promotion',
      'parent_local_promoted',
      'admin_review_requested',
      'global_canonical_promoted'
    )
  for update;

  if not v_is_learning_reason then
    if v_candidate.id is not null
      and v_candidate.candidate_status = 'global_canonical_promoted' then
      raise exception 'An already-ingested spelling occurrence requires the controlled repair path before a non-learning decision.';
    end if;

    if exists (
      select 1
      from public.spelling_catalog_review_cases review_case
      where review_case.parent_user_id = p_parent_user_id
        and review_case.child_id = p_child_id
        and review_case.source_misspelling_instance_id = v_issue.source_misspelling_instance_id
        and review_case.case_status not in ('open', 'superseded')
    ) or exists (
      select 1
      from public.spelling_canonical_mapping_recommendations recommendation
      where recommendation.parent_user_id = p_parent_user_id
        and recommendation.child_id = p_child_id
        and recommendation.source_misspelling_instance_id = v_issue.source_misspelling_instance_id
        and recommendation.recommendation_status not in (
          'recommended',
          'pending_admin_review',
          'superseded'
        )
    ) then
      raise exception 'Admin has already acted on this spelling occurrence; use the controlled repair path before a non-learning decision.';
    end if;

    update public.spelling_catalog_review_cases
    set
      case_status = 'superseded',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'superseded_by_final_parent_decision', p_final_classification,
        'superseded_at', v_now,
        'r8b_occurrence_source_version', 1
      ),
      updated_at = v_now
    where parent_user_id = p_parent_user_id
      and child_id = p_child_id
      and source_misspelling_instance_id = v_issue.source_misspelling_instance_id
      and case_status = 'open';

    update public.spelling_canonical_mapping_recommendations
    set
      recommendation_status = 'superseded',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'superseded_by_final_parent_decision', p_final_classification,
        'superseded_at', v_now,
        'r8b_occurrence_source_version', 1
      ),
      updated_at = v_now
    where parent_user_id = p_parent_user_id
      and child_id = p_child_id
      and source_misspelling_instance_id = v_issue.source_misspelling_instance_id
      and recommendation_status in ('recommended', 'pending_admin_review');

    update public.parent_verified_spelling_candidate_mappings
    set
      candidate_status = 'superseded',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'superseded_by_final_parent_decision', p_final_classification,
        'superseded_at', v_now,
        'r8b_occurrence_source_version', 1
      ),
      updated_at = v_now
    where parent_user_id = p_parent_user_id
      and child_id = p_child_id
      and source_misspelling_instance_id = v_issue.source_misspelling_instance_id
      and candidate_status in (
        'pending_parent_promotion',
        'parent_local_promoted',
        'admin_review_requested'
      );

    return jsonb_build_object(
      'candidate_mapping_id', null,
      'action', case when v_candidate.id is null then 'none' else 'superseded' end
    );
  end if;

  if not exists (
    select 1
    from public.micro_skill_catalog catalog
    where catalog.micro_skill_key = v_issue.micro_skill_key
      and catalog.mastery_domain_key = 'D4'
      and catalog.is_active = true
      and catalog.is_assignable = true
  ) then
    raise exception 'The spelling occurrence micro-skill is not an active assignable D4 route.';
  end if;

  if coalesce(v_issue.metadata -> 'known_match_auto_resolution' ->> 'authority', '') = 'known_match' then
    begin
      v_known_mapping_id := (
        v_issue.metadata -> 'known_match_auto_resolution' ->> 'canonical_mapping_id'
      )::uuid;
    exception when invalid_text_representation then
      raise exception 'The known canonical mapping identity is invalid.';
    end;

    v_has_known_route := v_known_mapping_id is not null
      and coalesce(
        v_issue.metadata -> 'known_match_auto_resolution' ->> 'micro_skill_key',
        ''
      ) = v_issue.micro_skill_key
      and exists (
        select 1
        from public.spelling_canonical_mappings mapping
        where mapping.id = v_known_mapping_id
          and mapping.misspelling_normalized = v_misspelling_normalized
          and mapping.correct_spelling_normalized = v_correct_spelling_normalized
          and mapping.micro_skill_key = v_issue.micro_skill_key
          and mapping.mapping_status = 'active'
          and mapping.resolver_visibility_status = 'visible'
          and exists (
            select 1
            from public.spelling_canonical_mapping_events event
            where event.mapping_id = mapping.id
              and event.event_type = 'resolver_visibility_enabled'
              and event.new_resolver_visibility_status = 'visible'
          )
          and not exists (
            select 1
            from public.spelling_canonical_mappings conflict
            where conflict.misspelling_normalized = mapping.misspelling_normalized
              and conflict.dialect_code = mapping.dialect_code
              and conflict.normalization_version = mapping.normalization_version
              and conflict.mapping_status = 'active'
              and conflict.resolver_visibility_status = 'visible'
              and (
                conflict.correct_spelling_normalized <> mapping.correct_spelling_normalized
                or conflict.micro_skill_key <> mapping.micro_skill_key
              )
          )
      );

    if not v_has_known_route then
      raise exception 'The known canonical mapping no longer agrees with the spelling occurrence.';
    end if;
  end if;

  if v_candidate.id is not null then
    if v_candidate.misspelling_normalized <> v_misspelling_normalized
      or v_candidate.correct_spelling_normalized <> v_correct_spelling_normalized
      or v_candidate.micro_skill_key <> v_issue.micro_skill_key
      or v_candidate.source_misspelling_instance_id <> v_issue.source_misspelling_instance_id
    then
      raise exception 'The live spelling occurrence source disagrees with the final parent-approved identity.';
    end if;

    update public.parent_verified_spelling_candidate_mappings
    set
      candidate_status = case
        when candidate_status = 'global_canonical_promoted' then candidate_status
        else 'parent_local_promoted'
      end,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'final_classification', p_final_classification,
        'final_classification_source', 'parent_approval_occurrence_source',
        'r8b_occurrence_source_version', 1,
        'r8b_occurrence_source_reused_at', v_now
      ),
      updated_at = v_now
    where id = v_candidate.id;

    return jsonb_build_object(
      'candidate_mapping_id', v_candidate.id,
      'action', 'reused',
      'known_canonical_mapping_id', v_known_mapping_id
    );
  end if;

  v_has_admin_handoff := exists (
    select 1
    from public.spelling_catalog_review_cases review_case
    where review_case.parent_user_id = p_parent_user_id
      and review_case.child_id = p_child_id
      and review_case.source_misspelling_instance_id = v_issue.source_misspelling_instance_id
      and review_case.case_status = 'open'
  ) or exists (
    select 1
    from public.spelling_canonical_mapping_recommendations recommendation
    where recommendation.parent_user_id = p_parent_user_id
      and recommendation.child_id = p_child_id
      and recommendation.source_misspelling_instance_id = v_issue.source_misspelling_instance_id
      and recommendation.recommendation_status in (
        'recommended',
        'pending_admin_review',
        'accepted'
      )
  );

  if not v_has_known_route and not v_has_admin_handoff then
    raise exception 'A new spelling occurrence source requires a governed known route or admin handoff.';
  end if;

  if v_source_submission_id is null then
    raise exception 'The spelling occurrence has no returned-correction submission identity.';
  end if;

  v_source_provenance := case
    when v_issue.metadata ->> 'source_kind' = 'parent_authored_missed_word'
      or coalesce((v_issue.metadata ->> 'parent_authored_missed_word')::boolean, false)
      then 'lesson_submission_parent_added_missed_word'
    else 'lesson_submission_existing_output'
  end;

  v_source_entity_id := case
    when v_misspelling.position_start is not null
      and v_misspelling.position_end is not null
      and v_misspelling.position_end > v_misspelling.position_start
      then concat_ws(
        '::',
        'authentic_writing',
        v_issue.task_submission_id::text,
        coalesce(v_misspelling.writing_sample_id::text, 'no_sample'),
        concat(v_misspelling.position_start, '-', v_misspelling.position_end),
        v_misspelling_normalized,
        v_correct_spelling_normalized
      )
    else concat('spelling_occurrence::', v_issue.source_misspelling_instance_id::text)
  end;

  select verification.*
  into v_verification
  from public.parent_verifications verification
  where verification.parent_user_id = p_parent_user_id
    and verification.child_id = p_child_id
    and verification.domain_module = 'spelling'
    and verification.source_type = 'authentic_writing'
    and verification.source_entity_id = v_source_entity_id
    and not exists (
      select 1
      from public.parent_verified_spelling_candidate_mappings candidate
      where candidate.parent_verification_id = verification.id
    )
  order by verification.created_at desc, verification.id desc
  limit 1
  for update;

  if v_verification.id is not null then
    if v_verification.decision not in ('accepted', 'overridden')
      or coalesce(
        v_verification.verified_micro_skill_key,
        v_verification.suggested_micro_skill_key
      ) <> v_issue.micro_skill_key
    then
      raise exception 'The existing parent verification disagrees with the final spelling occurrence identity.';
    end if;
    v_parent_verification_id := v_verification.id;
  else
    insert into public.parent_verifications (
    child_id,
    parent_user_id,
    domain_module,
    source_type,
    source_entity_id,
    task_submission_id,
    writing_sample_id,
    suggested_micro_skill_key,
    suggestion_payload,
    decision,
    verified_micro_skill_key,
    verification_notes,
    metadata,
    verified_at,
    created_at,
    updated_at
  ) values (
    p_child_id,
    p_parent_user_id,
    'spelling',
    'authentic_writing',
    v_source_entity_id,
    v_issue.task_submission_id,
    v_misspelling.writing_sample_id,
    v_issue.micro_skill_key,
    jsonb_build_object(
      'observed_text', v_misspelling_normalized,
      'suggested_replacement', v_correct_spelling_normalized,
      'source_misspelling_instance_id', v_issue.source_misspelling_instance_id
    ),
    case when v_has_known_route then 'accepted' else 'overridden' end,
    case when v_has_known_route then null else v_issue.micro_skill_key end,
    case
      when v_has_known_route then 'Parent approved a resolver-known spelling occurrence.'
      else 'Parent approved a spelling occurrence with governed admin handoff.'
    end,
    jsonb_build_object(
      'r8b_occurrence_source_version', 1,
      'writing_issue_id', v_issue.id,
      'source_misspelling_instance_id', v_issue.source_misspelling_instance_id,
      'known_canonical_mapping_id', v_known_mapping_id
    ),
    v_now,
    v_now,
    v_now
    ) returning id into v_parent_verification_id;
  end if;

  insert into public.parent_verified_spelling_candidate_mappings (
    parent_user_id,
    child_id,
    parent_verification_id,
    task_submission_id,
    writing_sample_id,
    source_suggestion_id,
    source_misspelling_instance_id,
    source_provenance,
    reviewed_event_source_entity_id,
    original_child_spelling,
    original_correct_spelling,
    misspelling_normalized,
    correct_spelling_normalized,
    micro_skill_key,
    candidate_status,
    promotion_scope,
    canonical_intake_handoff_state,
    metadata,
    created_at,
    updated_at
  ) values (
    p_parent_user_id,
    p_child_id,
    v_parent_verification_id,
    v_source_submission_id,
    v_misspelling.writing_sample_id,
    v_issue.source_suggestion_id,
    v_issue.source_misspelling_instance_id,
    v_source_provenance,
    v_source_entity_id,
    v_misspelling_normalized,
    v_correct_spelling_normalized,
    v_misspelling_normalized,
    v_correct_spelling_normalized,
    v_issue.micro_skill_key,
    'parent_local_promoted',
    'parent_local',
    'awaiting_r8c_exact_id_handoff',
    jsonb_build_object(
      'r8b_occurrence_source_version', 1,
      'r8b_occurrence_source_materialized_at', v_now,
      'r8b_handoff_state', 'awaiting_r8c_exact_id_handoff',
      'writing_issue_id', v_issue.id,
      'source_misspelling_instance_id', v_issue.source_misspelling_instance_id,
      'route_authority', case
        when v_has_known_route then 'known_canonical_match'
        else 'admin_handoff'
      end,
      'known_canonical_mapping_id', v_known_mapping_id,
      'final_classification', p_final_classification
    ),
    v_now,
    v_now
  ) returning id into v_candidate_id;

  return jsonb_build_object(
    'candidate_mapping_id', v_candidate_id,
    'action', 'materialized',
    'known_canonical_mapping_id', v_known_mapping_id
  );
end;
$$;

revoke all on function public.ensure_parent_approved_spelling_occurrence_source(
  uuid, uuid, uuid, text
) from public, anon, authenticated;

create or replace function public.materialize_spelling_occurrence_source_on_finalisation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.issue_status = 'finalised'
    and new.final_classification is not null
  then
    if tg_op = 'INSERT'
      or old.issue_status is distinct from new.issue_status
      or old.final_classification is distinct from new.final_classification
    then
      perform public.ensure_parent_approved_spelling_occurrence_source(
        new.id,
        new.parent_user_id,
        new.child_id,
        new.final_classification
      );
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.materialize_spelling_occurrence_source_on_finalisation()
  from public, anon, authenticated;

create trigger writing_issues_materialize_spelling_occurrence_source
after update of issue_status, final_classification on public.writing_issues
for each row
execute function public.materialize_spelling_occurrence_source_on_finalisation();

create trigger writing_issues_materialize_inserted_spelling_occurrence_source
after insert on public.writing_issues
for each row
execute function public.materialize_spelling_occurrence_source_on_finalisation();

create or replace function public.collect_submission_thread_occurrence_sources(
  p_task_id uuid,
  p_parent_user_id uuid,
  p_child_id uuid
) returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'writing_issue_id', issue.id,
        'source_misspelling_instance_id', issue.source_misspelling_instance_id,
        'candidate_mapping_id', candidate.id,
        'misspelling_normalized', candidate.misspelling_normalized,
        'correct_spelling_normalized', candidate.correct_spelling_normalized,
        'micro_skill_key', candidate.micro_skill_key,
        'candidate_status', candidate.candidate_status,
        'canonical_intake_handoff_state', candidate.canonical_intake_handoff_state
      ) order by issue.id
    ),
    '[]'::jsonb
  )
  from public.writing_issues issue
  join public.parent_verified_spelling_candidate_mappings candidate
    on candidate.parent_user_id = issue.parent_user_id
    and candidate.child_id = issue.child_id
    and candidate.source_misspelling_instance_id = issue.source_misspelling_instance_id
    and candidate.candidate_status in (
      'pending_parent_promotion',
      'parent_local_promoted',
      'admin_review_requested',
      'global_canonical_promoted'
    )
  where issue.parent_user_id = p_parent_user_id
    and issue.child_id = p_child_id
    and issue.issue_status = 'finalised'
    and issue.final_classification in (
      'fragile_knowledge',
      'concept_gap',
      'transfer_failure'
    )
    and issue.source_misspelling_instance_id is not null
    and exists (
      select 1
      from public.writing_issue_correction_attempts attempt
      join public.task_submissions attempt_submission
        on attempt_submission.id = attempt.task_submission_id
      where attempt.writing_issue_id = issue.id
        and attempt.parent_user_id = p_parent_user_id
        and attempt.child_id = p_child_id
        and attempt_submission.parent_user_id = p_parent_user_id
        and attempt_submission.child_id = p_child_id
        and attempt_submission.task_id = p_task_id
    );
$$;

revoke all on function public.collect_submission_thread_occurrence_sources(
  uuid, uuid, uuid
) from public, anon, authenticated;

create or replace function public.approve_task_submission_with_reason_drafts(
  p_submission_id uuid,
  p_parent_user_id uuid,
  p_child_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission public.task_submissions%rowtype;
  v_issue public.writing_issues%rowtype;
  v_issue_result jsonb;
  v_issue_results jsonb := '[]'::jsonb;
  v_governed_sources jsonb := '[]'::jsonb;
  v_issue_count integer := 0;
  v_learning_issue_count integer := 0;
  v_candidate_mapping_id uuid;
  v_now timestamptz := timezone('utc', now());
  v_is_learning_reason boolean;
  v_requires_spelling_occurrence boolean;
  v_has_known_route boolean;
  v_has_admin_handoff boolean;
begin
  if auth.uid() is not null and auth.uid() <> p_parent_user_id then
    raise exception 'Submissions may only be approved by the owning parent.';
  end if;

  select *
  into v_submission
  from public.task_submissions
  where id = p_submission_id
    and parent_user_id = p_parent_user_id
    and child_id = p_child_id
  for update;

  if not found then
    raise exception 'That submission no longer exists.';
  end if;

  if v_submission.parent_review_status = 'approved' then
    v_governed_sources := public.collect_submission_thread_occurrence_sources(
      v_submission.task_id,
      p_parent_user_id,
      p_child_id
    );
    return jsonb_build_object(
      'submission_id', v_submission.id,
      'already_approved', true,
      'issue_results', v_issue_results,
      'governed_occurrence_sources', v_governed_sources
    );
  end if;

  for v_issue in
    select issue.*
    from public.writing_issues issue
    where issue.parent_user_id = p_parent_user_id
      and issue.child_id = p_child_id
      and issue.issue_status = 'child_responded'
      and issue.final_classification is null
      and exists (
        select 1
        from public.writing_issue_correction_attempts attempt
        join public.task_submissions attempt_submission
          on attempt_submission.id = attempt.task_submission_id
        where attempt.writing_issue_id = issue.id
          and attempt.parent_user_id = p_parent_user_id
          and attempt.child_id = p_child_id
          and attempt_submission.parent_user_id = p_parent_user_id
          and attempt_submission.child_id = p_child_id
          and attempt_submission.task_id = v_submission.task_id
      )
    order by issue.id
    for update of issue
  loop
    v_issue_count := v_issue_count + 1;

    if v_issue.draft_final_classification is null then
      raise exception 'Every returned correction needs a saved reason before approval.';
    end if;

    v_is_learning_reason := v_issue.draft_final_classification in (
      'fragile_knowledge',
      'concept_gap',
      'transfer_failure'
    );
    v_requires_spelling_occurrence :=
      v_issue.source_misspelling_instance_id is not null
      or exists (
        select 1
        from public.micro_skill_catalog catalog
        where catalog.micro_skill_key = v_issue.micro_skill_key
          and catalog.mastery_domain_key = 'D4'
      );

    if v_is_learning_reason and v_requires_spelling_occurrence then
      v_learning_issue_count := v_learning_issue_count + 1;
      v_has_known_route :=
        coalesce(v_issue.metadata -> 'known_match_auto_resolution' ->> 'authority', '') = 'known_match'
        and coalesce(v_issue.metadata -> 'known_match_auto_resolution' ->> 'micro_skill_key', '') = v_issue.micro_skill_key
        and exists (
          select 1
          from public.spelling_canonical_mappings mapping
          join public.micro_skill_catalog micro_skill
            on micro_skill.micro_skill_key = mapping.micro_skill_key
            and micro_skill.is_active = true
            and micro_skill.is_assignable = true
          where mapping.id::text = v_issue.metadata -> 'known_match_auto_resolution' ->> 'canonical_mapping_id'
            and mapping.mapping_status = 'active'
            and mapping.resolver_visibility_status = 'visible'
            and mapping.micro_skill_key = v_issue.micro_skill_key
        );

      v_has_admin_handoff := exists (
        select 1
        from public.spelling_catalog_review_cases review_case
        where review_case.parent_user_id = p_parent_user_id
          and review_case.child_id = p_child_id
          and review_case.source_misspelling_instance_id = v_issue.source_misspelling_instance_id
          and review_case.case_status = 'open'
      ) or exists (
        select 1
        from public.spelling_canonical_mapping_recommendations recommendation
        join public.parent_verified_spelling_candidate_mappings candidate
          on candidate.id = recommendation.candidate_mapping_id
        where candidate.parent_user_id = p_parent_user_id
          and candidate.child_id = p_child_id
          and candidate.source_misspelling_instance_id = v_issue.source_misspelling_instance_id
          and recommendation.recommendation_status in ('recommended', 'pending_admin_review', 'accepted')
      );

      if not v_has_known_route and not v_has_admin_handoff then
        raise exception 'Every learning reason needs a durable known route or admin handoff before approval.';
      end if;
    end if;
  end loop;

  for v_issue in
    select issue.*
    from public.writing_issues issue
    where issue.parent_user_id = p_parent_user_id
      and issue.child_id = p_child_id
      and issue.issue_status = 'child_responded'
      and issue.final_classification is null
      and exists (
        select 1
        from public.writing_issue_correction_attempts attempt
        join public.task_submissions attempt_submission
          on attempt_submission.id = attempt.task_submission_id
        where attempt.writing_issue_id = issue.id
          and attempt.parent_user_id = p_parent_user_id
          and attempt.child_id = p_child_id
          and attempt_submission.parent_user_id = p_parent_user_id
          and attempt_submission.child_id = p_child_id
          and attempt_submission.task_id = v_submission.task_id
      )
    order by issue.id
  loop
    select public.finalise_writing_issue_classification_and_learning_item(
      v_issue.id,
      p_parent_user_id,
      p_child_id,
      v_issue.draft_final_classification
    )
    into v_issue_result;

    update public.writing_issues
    set draft_final_classification = null
    where id = v_issue.id
      and parent_user_id = p_parent_user_id
      and child_id = p_child_id
      and final_classification = v_issue.draft_final_classification;

    v_candidate_mapping_id := null;
    v_requires_spelling_occurrence :=
      v_issue.source_misspelling_instance_id is not null
      or exists (
        select 1
        from public.micro_skill_catalog catalog
        where catalog.micro_skill_key = v_issue.micro_skill_key
          and catalog.mastery_domain_key = 'D4'
      );
    if v_issue.draft_final_classification in (
        'fragile_knowledge',
        'concept_gap',
        'transfer_failure'
      )
      and v_requires_spelling_occurrence
    then
      select candidate.id
      into v_candidate_mapping_id
      from public.parent_verified_spelling_candidate_mappings candidate
      where candidate.parent_user_id = p_parent_user_id
        and candidate.child_id = p_child_id
        and candidate.source_misspelling_instance_id = v_issue.source_misspelling_instance_id
        and candidate.candidate_status in (
          'pending_parent_promotion',
          'parent_local_promoted',
          'admin_review_requested',
          'global_canonical_promoted'
        );

      if v_candidate_mapping_id is null then
        raise exception 'Final parent approval did not produce a governed spelling occurrence source.';
      end if;
    end if;

    v_issue_results := v_issue_results || jsonb_build_array(
      coalesce(v_issue_result, '{}'::jsonb) || jsonb_build_object(
        'writing_issue_id', v_issue.id,
        'final_classification', v_issue.draft_final_classification,
        'candidate_mapping_id', v_candidate_mapping_id
      )
    );
  end loop;

  v_governed_sources := public.collect_submission_thread_occurrence_sources(
    v_submission.task_id,
    p_parent_user_id,
    p_child_id
  );

  if jsonb_array_length(v_governed_sources) < v_learning_issue_count then
    raise exception 'Final parent approval produced an incomplete governed spelling occurrence source set.';
  end if;

  update public.task_submissions
  set
    parent_review_status = 'approved',
    parent_reviewed_at = v_now
  where id = v_submission.id
    and parent_user_id = p_parent_user_id
    and child_id = p_child_id;

  return jsonb_build_object(
    'submission_id', v_submission.id,
    'already_approved', false,
    'finalised_issue_count', v_issue_count,
    'issue_results', v_issue_results,
    'governed_occurrence_sources', v_governed_sources,
    'approved_at', v_now
  );
end;
$$;

revoke all on function public.approve_task_submission_with_reason_drafts(
  uuid, uuid, uuid
) from public, anon;
grant execute on function public.approve_task_submission_with_reason_drafts(
  uuid, uuid, uuid
) to authenticated, service_role;

commit;
