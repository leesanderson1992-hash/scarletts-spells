-- R8D: reconcile a later parent spelling decision without rewriting the
-- teaching, scheduling, assignment, Review, or evidence history it produced.
-- R8B/R8C remain immutable; this migration is the only post-handoff authority
-- transition boundary.

begin;

alter table public.parent_verified_spelling_candidate_mappings
  add column authority_version bigint not null default 1;

alter table public.parent_verified_spelling_candidate_mappings
  add constraint parent_verified_spelling_candidate_mappings_authority_version_check
  check (authority_version >= 1);

create table public.adle_spelling_decision_reconciliations (
  id uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null references auth.users(id) on delete restrict,
  child_id uuid not null references public.children(id) on delete restrict,
  writing_issue_id uuid not null references public.writing_issues(id) on delete restrict,
  source_candidate_mapping_id uuid not null
    references public.parent_verified_spelling_candidate_mappings(id) on delete restrict,
  replacement_candidate_mapping_id uuid
    references public.parent_verified_spelling_candidate_mappings(id) on delete restrict,
  old_learning_item_id uuid references public.adle_learning_items(id) on delete restrict,
  idempotency_key text not null,
  request_fingerprint text not null,
  expected_authority_version bigint not null,
  old_final_classification text,
  new_final_classification text not null,
  old_correct_spelling_normalized text not null,
  new_correct_spelling_normalized text,
  old_micro_skill_key text not null,
  new_micro_skill_key text,
  reconciliation_class text not null,
  authoritative_source_count_after integer not null,
  target_action text not null,
  schedule_action text not null,
  protected_history_counts jsonb not null,
  reason text not null,
  result_payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint adle_spelling_decision_reconciliations_idempotency_unique
    unique (parent_user_id, child_id, idempotency_key),
  constraint adle_spelling_decision_reconciliations_key_check
    check (btrim(idempotency_key) <> ''),
  constraint adle_spelling_decision_reconciliations_fingerprint_check
    check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint adle_spelling_decision_reconciliations_version_check
    check (expected_authority_version >= 1),
  constraint adle_spelling_decision_reconciliations_reason_check
    check (btrim(reason) <> ''),
  constraint adle_spelling_decision_reconciliations_count_check
    check (authoritative_source_count_after >= 0),
  constraint adle_spelling_decision_reconciliations_history_check
    check (jsonb_typeof(protected_history_counts) = 'object'),
  constraint adle_spelling_decision_reconciliations_result_check
    check (jsonb_typeof(result_payload) = 'object')
);

create index adle_spelling_decision_reconciliations_source_idx
  on public.adle_spelling_decision_reconciliations(
    source_candidate_mapping_id, created_at, id
  );
create index adle_spelling_decision_reconciliations_issue_idx
  on public.adle_spelling_decision_reconciliations(
    writing_issue_id, created_at, id
  );

create or replace function public.prevent_adle_spelling_reconciliation_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  raise exception 'R8D spelling decision reconciliation receipts are append-only';
end;
$$;

create trigger adle_spelling_decision_reconciliations_append_only
before update or delete on public.adle_spelling_decision_reconciliations
for each row execute function public.prevent_adle_spelling_reconciliation_mutation();

-- Current authority is the conjunction of live lineage, live parent authority,
-- and a non-superseded canonical intake row when one exists. Lineage itself is
-- never deleted.
create or replace function public.adle_authoritative_learning_source_count_r8d(
  p_learning_item_id uuid
) returns bigint
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select count(*)::bigint
  from public.adle_learning_item_sources source
  join public.parent_verified_spelling_candidate_mappings candidate
    on candidate.id = source.parent_verified_candidate_mapping_id
  left join public.adle_canonical_intake_candidates intake
    on intake.source_candidate_mapping_id = candidate.id
  where source.learning_item_id = p_learning_item_id
    and source.row_status = 'active'
    and candidate.candidate_status in (
      'parent_local_promoted', 'global_canonical_promoted'
    )
    and candidate.canonical_intake_handoff_state
      is distinct from 'awaiting_r8c_exact_id_handoff'
    and (intake.id is null or intake.candidate_state = 'activated');
$$;

revoke all on function public.adle_authoritative_learning_source_count_r8d(uuid)
  from public, anon, authenticated;
grant execute on function public.adle_authoritative_learning_source_count_r8d(uuid)
  to service_role;

-- A source requires downstream reconciliation once it has either an explicit
-- R8C handoff or durable canonical-intake/learning-lineage state. In
-- particular, the legacy production form (NULL handoff plus downstream state)
-- is consumed, while a NULL source with neither intake nor lineage remains a
-- backwards-compatible pre-consumption source.
create function public.adle_spelling_source_requires_reconciliation_r8d(
  p_source_candidate_mapping_id uuid
) returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.parent_verified_spelling_candidate_mappings candidate
    where candidate.id = p_source_candidate_mapping_id
      and (
        candidate.canonical_intake_handoff_state is not null
        or exists (
          select 1
          from public.adle_canonical_intake_candidates intake
          where intake.source_candidate_mapping_id = candidate.id
        )
        or exists (
          select 1
          from public.adle_learning_item_sources source
          where source.parent_verified_candidate_mapping_id = candidate.id
        )
      )
  );
$$;

revoke all on function public.adle_spelling_source_requires_reconciliation_r8d(uuid)
  from public, anon;
grant execute on function public.adle_spelling_source_requires_reconciliation_r8d(uuid)
  to authenticated, service_role;

create function public.adle_spelling_occurrence_requires_reconciliation_r8d(
  p_parent_user_id uuid,
  p_child_id uuid,
  p_source_misspelling_instance_id uuid
) returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.parent_verified_spelling_candidate_mappings candidate
    where candidate.parent_user_id = p_parent_user_id
      and candidate.child_id = p_child_id
      and candidate.source_misspelling_instance_id
        = p_source_misspelling_instance_id
      and public.adle_spelling_source_requires_reconciliation_r8d(candidate.id)
  );
$$;

revoke all on function public.adle_spelling_occurrence_requires_reconciliation_r8d(
  uuid, uuid, uuid
) from public, anon;
grant execute on function public.adle_spelling_occurrence_requires_reconciliation_r8d(
  uuid, uuid, uuid
) to authenticated, service_role;

-- Replace the released R8C trigger implementation without changing its
-- migration. R8C handoff control remains intact; R8D additionally protects any
-- consumed legacy source from identity/status mutation or deletion. The R8D
-- security-definer transaction remains the governed escape hatch.
create or replace function public.protect_r8b_canonical_intake_handoff_state()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_handoff_authority_owner name;
  v_reconciler_owner name;
  v_requires_reconciliation boolean;
begin
  select pg_get_userbyid(procedure.proowner)
  into v_handoff_authority_owner
  from pg_proc procedure
  where procedure.oid =
    'public.adle_authorize_parent_approval_exact_id_handoff(uuid,uuid,uuid,uuid[])'::regprocedure;

  select pg_get_userbyid(procedure.proowner)
  into v_reconciler_owner
  from pg_proc procedure
  where procedure.oid =
    'public.adle_reconcile_parent_spelling_decision_r8d(uuid,uuid,uuid,uuid,bigint,text,text,text,uuid,uuid,text,text)'::regprocedure;

  if tg_op = 'UPDATE'
    and new.canonical_intake_handoff_state
      is distinct from old.canonical_intake_handoff_state
  then
    if current_user is distinct from v_handoff_authority_owner then
      raise exception 'Canonical intake handoff state is server-controlled.';
    end if;

    if old.canonical_intake_handoff_state
        is distinct from 'awaiting_r8c_exact_id_handoff'
      or new.canonical_intake_handoff_state
        is distinct from 'r8c_exact_id_handed_off'
    then
      raise exception 'Canonical intake handoff state has no authorised transition.';
    end if;
  end if;

  v_requires_reconciliation :=
    public.adle_spelling_source_requires_reconciliation_r8d(old.id);

  if tg_op = 'UPDATE'
    and v_requires_reconciliation
    and current_user is distinct from v_reconciler_owner
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
    raise exception 'A consumed spelling source requires the governed R8D reconciliation path.';
  end if;

  if tg_op = 'DELETE' and v_requires_reconciliation then
    raise exception 'A consumed spelling source cannot be deleted.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.protect_r8b_canonical_intake_handoff_state()
  from public, anon, authenticated;

-- Once an occurrence has crossed R8C or has durable downstream consumption,
-- authority changes must not silently invoke the pre-downstream R8B
-- finalisation trigger. Only the R8D transaction may change the current parent
-- decision represented by that writing issue.
create or replace function public.protect_r8d_handed_off_writing_issue_authority()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_reconciler_owner name;
begin
  if old.issue_status = 'finalised'
    and old.source_misspelling_instance_id is not null
    and (
      new.issue_status is distinct from old.issue_status
      or new.final_classification is distinct from old.final_classification
      or new.observed_text is distinct from old.observed_text
      or new.approved_replacement is distinct from old.approved_replacement
      or new.suggested_replacement is distinct from old.suggested_replacement
      or new.micro_skill_key is distinct from old.micro_skill_key
      or new.source_misspelling_instance_id
        is distinct from old.source_misspelling_instance_id
      or new.task_submission_id is distinct from old.task_submission_id
    )
    and public.adle_spelling_occurrence_requires_reconciliation_r8d(
      old.parent_user_id,
      old.child_id,
      old.source_misspelling_instance_id
    )
  then
    select pg_get_userbyid(procedure.proowner)
    into v_reconciler_owner
    from pg_proc procedure
    where procedure.oid =
      'public.adle_reconcile_parent_spelling_decision_r8d(uuid,uuid,uuid,uuid,bigint,text,text,text,uuid,uuid,text,text)'::regprocedure;

    if current_user is distinct from v_reconciler_owner then
      raise exception 'A consumed spelling decision requires the governed R8D reconciliation path.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_r8d_handed_off_writing_issue_authority()
  from public, anon, authenticated;

create trigger writing_issues_protect_r8d_handed_off_authority
before update of issue_status, final_classification, observed_text,
  approved_replacement, suggested_replacement, micro_skill_key,
  source_misspelling_instance_id, task_submission_id
on public.writing_issues
for each row execute function public.protect_r8d_handed_off_writing_issue_authority();

create function public.adle_reconcile_parent_spelling_decision_r8d(
  p_writing_issue_id uuid,
  p_source_candidate_mapping_id uuid,
  p_parent_user_id uuid,
  p_child_id uuid,
  p_expected_authority_version bigint,
  p_new_final_classification text,
  p_new_correct_spelling_normalized text,
  p_new_micro_skill_key text,
  p_replacement_canonical_mapping_id uuid,
  p_approval_submission_id uuid,
  p_reason text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_source public.parent_verified_spelling_candidate_mappings%rowtype;
  v_issue public.writing_issues%rowtype;
  v_approval_submission public.task_submissions%rowtype;
  v_receipt public.adle_spelling_decision_reconciliations%rowtype;
  v_learning_item public.adle_learning_items%rowtype;
  v_replacement_candidate_id uuid;
  v_replacement_result jsonb;
  v_governed_sources jsonb := '[]'::jsonb;
  v_governed_ids uuid[] := '{}'::uuid[];
  v_request_fingerprint text;
  v_new_correct text := lower(btrim(coalesce(p_new_correct_spelling_normalized, '')));
  v_new_skill text := btrim(coalesce(p_new_micro_skill_key, ''));
  v_is_learning boolean;
  v_active_lineage_count integer := 0;
  v_other_authoritative_count integer := 0;
  v_teaching_event_count integer := 0;
  v_schedule_count integer := 0;
  v_review_encounter_count integer := 0;
  v_schedule_routes_superseded integer := 0;
  v_schedule_words_superseded integer := 0;
  v_shared_schedule_count integer := 0;
  v_reconciliation_class text;
  v_target_action text := 'no_target';
  v_schedule_action text := 'none';
  v_protected_counts jsonb := '{}'::jsonb;
  v_result jsonb;
  v_now timestamptz := timezone('utc', now());
begin
  if auth.uid() is not null and auth.uid() <> p_parent_user_id then
    raise exception 'R8D reconciliation may only be performed by the owning parent.';
  end if;
  if p_expected_authority_version is null or p_expected_authority_version < 1 then
    raise exception 'R8D reconciliation requires a valid expected authority version.';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'R8D reconciliation requires an audited reason.';
  end if;
  if nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'R8D reconciliation requires an idempotency key.';
  end if;
  if p_new_final_classification not in (
    'checking_only', 'fragile_knowledge', 'concept_gap',
    'transfer_failure', 'not_an_issue'
  ) then
    raise exception 'R8D reconciliation received an invalid final classification.';
  end if;

  v_is_learning := p_new_final_classification in (
    'fragile_knowledge', 'concept_gap', 'transfer_failure'
  );
  if v_is_learning and (
    v_new_correct = '' or v_new_skill = ''
    or p_replacement_canonical_mapping_id is null
    or p_approval_submission_id is null
  ) then
    raise exception 'R8D learning authority requires an exact replacement word, micro-skill, canonical mapping, and approved submission.';
  end if;
  if not v_is_learning and (
    nullif(v_new_correct, '') is not null
    or nullif(v_new_skill, '') is not null
    or p_replacement_canonical_mapping_id is not null
  ) then
    raise exception 'R8D non-learning authority cannot carry a replacement learning target.';
  end if;

  v_request_fingerprint := encode(extensions.digest(convert_to(
    jsonb_build_object(
      'writingIssueId', p_writing_issue_id,
      'sourceCandidateMappingId', p_source_candidate_mapping_id,
      'parentUserId', p_parent_user_id,
      'childId', p_child_id,
      'expectedAuthorityVersion', p_expected_authority_version,
      'newFinalClassification', p_new_final_classification,
      'newCorrectSpellingNormalized', nullif(v_new_correct, ''),
      'newMicroSkillKey', nullif(v_new_skill, ''),
      'replacementCanonicalMappingId', p_replacement_canonical_mapping_id,
      'approvalSubmissionId', p_approval_submission_id,
      'reason', btrim(p_reason)
    )::text,
    'UTF8'
  ), 'sha256'), 'hex');

  -- The source lock serialises different correction keys; the idempotency lock
  -- makes a same-key retry wait for and then reuse the first committed receipt.
  perform pg_advisory_xact_lock(hashtextextended(
    'r8d-source:' || p_source_candidate_mapping_id::text, 0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'r8d-idempotency:' || p_parent_user_id::text || ':'
      || p_child_id::text || ':' || p_idempotency_key, 0
  ));

  select * into v_receipt
  from public.adle_spelling_decision_reconciliations receipt
  where receipt.parent_user_id = p_parent_user_id
    and receipt.child_id = p_child_id
    and receipt.idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.request_fingerprint <> v_request_fingerprint then
      raise exception 'R8D reconciliation idempotency conflict.';
    end if;
    return v_receipt.result_payload || jsonb_build_object('replayed', true);
  end if;

  select * into v_source
  from public.parent_verified_spelling_candidate_mappings candidate
  where candidate.id = p_source_candidate_mapping_id
    and candidate.parent_user_id = p_parent_user_id
    and candidate.child_id = p_child_id
  for update;
  if not found then
    raise exception 'R8D reconciliation source is missing or belongs to another learner.';
  end if;
  if v_source.source_misspelling_instance_id is null then
    raise exception 'R8D reconciliation requires an occurrence-complete source.';
  end if;
  if v_source.authority_version <> p_expected_authority_version then
    raise exception 'R8D reconciliation source authority version is stale.';
  end if;
  if v_source.candidate_status not in (
    'pending_parent_promotion', 'parent_local_promoted',
    'admin_review_requested', 'global_canonical_promoted', 'superseded'
  ) then
    raise exception 'R8D reconciliation source is not in a reconcilable authority state.';
  end if;

  select * into v_issue
  from public.writing_issues issue
  where issue.id = p_writing_issue_id
    and issue.parent_user_id = p_parent_user_id
    and issue.child_id = p_child_id
    and issue.source_misspelling_instance_id
      = v_source.source_misspelling_instance_id
    and issue.issue_status = 'finalised'
  for update;
  if not found then
    raise exception 'R8D reconciliation writing issue identity changed.';
  end if;

  if exists (
    select 1
    from public.parent_verified_spelling_candidate_mappings live
    where live.parent_user_id = p_parent_user_id
      and live.child_id = p_child_id
      and live.source_misspelling_instance_id = v_source.source_misspelling_instance_id
      and live.id <> v_source.id
      and live.candidate_status in (
        'pending_parent_promotion', 'parent_local_promoted',
        'admin_review_requested', 'global_canonical_promoted'
      )
  ) then
    raise exception 'R8D reconciliation found an unexpected competing live occurrence source.';
  end if;

  if v_is_learning then
    if v_new_correct = lower(btrim(coalesce(v_issue.observed_text, ''))) then
      raise exception 'R8D replacement target cannot equal the observed misspelling.';
    end if;
    if not exists (
      select 1
      from public.micro_skill_catalog skill
      where skill.micro_skill_key = v_new_skill
        and skill.mastery_domain_key = 'D4'
        and skill.is_active = true
        and skill.is_assignable = true
    ) then
      raise exception 'R8D replacement micro-skill is not an active assignable D4 route.';
    end if;
    if not exists (
      select 1
      from public.spelling_canonical_mappings mapping
      where mapping.id = p_replacement_canonical_mapping_id
        and mapping.misspelling_normalized = v_source.misspelling_normalized
        and mapping.correct_spelling_normalized = v_new_correct
        and mapping.micro_skill_key = v_new_skill
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
    ) then
      raise exception 'R8D replacement canonical mapping is not active, visible, exact, and unambiguous.';
    end if;

    select * into v_approval_submission
    from public.task_submissions submission
    where submission.id = p_approval_submission_id
      and submission.parent_user_id = p_parent_user_id
      and submission.child_id = p_child_id
      and submission.parent_review_status = 'approved'
      and submission.task_id = (
        select issue_submission.task_id
        from public.task_submissions issue_submission
        where issue_submission.id = v_issue.task_submission_id
      )
    for update;
    if not found then
      raise exception 'R8D replacement requires the owning approved task-thread submission.';
    end if;
  end if;

  select count(*)
  into v_active_lineage_count
  from public.adle_learning_item_sources source
  where source.parent_verified_candidate_mapping_id = v_source.id
    and source.row_status = 'active';
  if v_active_lineage_count > 1 then
    raise exception 'R8D source has ambiguous active learning-item lineage.';
  end if;
  select source.learning_item_id
  into v_learning_item.id
  from public.adle_learning_item_sources source
  where source.parent_verified_candidate_mapping_id = v_source.id
    and source.row_status = 'active'
  limit 1;
  if v_learning_item.id is not null then
    select * into v_learning_item
    from public.adle_learning_items item
    where item.id = v_learning_item.id
    for update;
    if not found
      or v_learning_item.child_id <> p_child_id
      or v_learning_item.micro_skill_key <> v_source.micro_skill_key
    then
      raise exception 'R8D learning target lineage identity disagrees with its governed source.';
    end if;

    select count(*) into v_other_authoritative_count
    from public.adle_learning_item_sources source
    join public.parent_verified_spelling_candidate_mappings candidate
      on candidate.id = source.parent_verified_candidate_mapping_id
    left join public.adle_canonical_intake_candidates intake
      on intake.source_candidate_mapping_id = candidate.id
    where source.learning_item_id = v_learning_item.id
      and source.parent_verified_candidate_mapping_id <> v_source.id
      and source.row_status = 'active'
      and candidate.candidate_status in (
        'parent_local_promoted', 'global_canonical_promoted'
      )
      and candidate.canonical_intake_handoff_state
        is distinct from 'awaiting_r8c_exact_id_handoff'
      and (intake.id is null or intake.candidate_state = 'activated');

    select count(*) into v_teaching_event_count
    from public.adle_assignment_attempt_event_routes route
    where route.learning_item_id = v_learning_item.id;
    select count(*) into v_schedule_count
    from public.adle_review_schedule_word_routes route
    where route.learning_item_id = v_learning_item.id;
    select count(*) into v_review_encounter_count
    from public.adle_review_word_encounters encounter
    where exists (
      select 1
      from public.adle_review_schedule_word_routes route
      where route.schedule_word_id = encounter.schedule_word_id
        and route.learning_item_id = v_learning_item.id
    );

    if v_other_authoritative_count > 0 then
      v_reconciliation_class := 'shared_active_target';
    elsif v_review_encounter_count > 0 then
      v_reconciliation_class := 'protected_review_history';
    elsif v_schedule_count > 0 then
      v_reconciliation_class := 'schedule_without_review_history';
    elsif v_teaching_event_count > 0 then
      v_reconciliation_class := 'teaching_without_schedule';
    else
      v_reconciliation_class := 'intake_without_teaching';
    end if;

    if v_other_authoritative_count = 0 and exists (
      select 1
      from public.adle_review_schedule_words schedule
      where schedule.child_id = p_child_id
        and schedule.canonical_word_id = v_learning_item.canonical_word_id
        and schedule.row_status = 'active'
        and not exists (
          select 1
          from public.adle_review_schedule_word_routes route
          where route.schedule_word_id = schedule.id
            and route.row_status = 'active'
        )
    ) then
      raise exception 'R8D cannot safely reconcile an active legacy schedule without route authority.';
    end if;
  else
    if exists (
      select 1
      from public.adle_canonical_intake_candidates intake
      where intake.source_candidate_mapping_id = v_source.id
        and intake.candidate_state = 'pending_content'
    ) then
      v_reconciliation_class := 'content_blocked';
    elsif v_source.candidate_status = 'superseded' then
      v_reconciliation_class := 'historical_reactivation';
    else
      v_reconciliation_class := 'not_consumed_downstream';
    end if;
  end if;

  -- Capture only counts here. The proof suite separately hashes every protected
  -- row before and after to demonstrate byte-for-byte historical preservation.
  v_protected_counts := jsonb_build_object(
    'teachingAttemptRoutes', case when v_learning_item.id is null then 0 else (
      select count(*) from public.adle_assignment_attempt_event_routes route
      where route.learning_item_id = v_learning_item.id
    ) end,
    'taughtWordHistory', case when v_learning_item.id is null then 0 else (
      select count(*) from public.adle_taught_word_history history
      where history.child_id = p_child_id
        and history.canonical_word_id = v_learning_item.canonical_word_id
    ) end,
    'scheduleRows', case when v_learning_item.id is null then 0 else (
      select count(*) from public.adle_review_schedule_words schedule
      where schedule.child_id = p_child_id
        and schedule.canonical_word_id = v_learning_item.canonical_word_id
    ) end,
    'assignments', case when v_learning_item.id is null then 0 else (
      select count(distinct session.daily_assignment_id)
      from public.adle_review_sessions session
      join public.adle_review_word_encounters encounter
        on encounter.review_session_id = session.id
      join public.adle_review_schedule_word_routes route
        on route.schedule_word_id = encounter.schedule_word_id
      where route.learning_item_id = v_learning_item.id
    ) end,
    'reviewSessions', case when v_learning_item.id is null then 0 else (
      select count(distinct encounter.review_session_id)
      from public.adle_review_word_encounters encounter
      join public.adle_review_schedule_word_routes route
        on route.schedule_word_id = encounter.schedule_word_id
      where route.learning_item_id = v_learning_item.id
    ) end,
    'reviewEncounters', v_review_encounter_count,
    'reviewOutcomes', case when v_learning_item.id is null then 0 else (
      select count(*) from public.adle_review_outcome_event_routes route
      where route.learning_item_id = v_learning_item.id
    ) end
  );

  -- Supersede only current authority. Handoff state and all identity/history
  -- columns remain unchanged.
  if v_source.candidate_status <> 'superseded' then
    update public.parent_verified_spelling_candidate_mappings candidate
    set candidate_status = 'superseded',
        authority_version = candidate.authority_version + 1,
        metadata = coalesce(candidate.metadata, '{}'::jsonb) || jsonb_build_object(
          'r8d_superseded_at', v_now,
          'r8d_superseded_by_final_classification', p_new_final_classification,
          'r8d_idempotency_key', p_idempotency_key
        ),
        updated_at = v_now
    where candidate.id = v_source.id;
  else
    update public.parent_verified_spelling_candidate_mappings candidate
    set authority_version = candidate.authority_version + 1,
        metadata = coalesce(candidate.metadata, '{}'::jsonb) || jsonb_build_object(
          'r8d_last_reconsidered_at', v_now,
          'r8d_idempotency_key', p_idempotency_key
        ),
        updated_at = v_now
    where candidate.id = v_source.id;
  end if;

  update public.adle_canonical_intake_candidates intake
  set candidate_state = 'superseded',
      resolved_at = coalesce(intake.resolved_at, v_now),
      next_retry_at = null,
      lock_version = intake.lock_version + 1,
      updated_at = v_now
  where intake.source_candidate_mapping_id = v_source.id
    and intake.candidate_state <> 'superseded';

  update public.adle_canonical_intake_candidate_demands link
  set link_status = 'superseded',
      resolved_at = coalesce(link.resolved_at, v_now),
      updated_at = v_now
  where link.candidate_id in (
      select intake.id
      from public.adle_canonical_intake_candidates intake
      where intake.source_candidate_mapping_id = v_source.id
    )
    and link.link_status = 'waiting';

  update public.adle_canonical_intake_demands demand
  set lifecycle_status = 'superseded',
      notification_status = 'resolved',
      notification_resolved_at = coalesce(demand.notification_resolved_at, v_now),
      last_reconciled_at = v_now,
      last_reconciliation_outcome = 'source_authority_superseded_r8d',
      resolution_note = coalesce(demand.resolution_note, btrim(p_reason)),
      updated_at = v_now
  where exists (
      select 1
      from public.adle_canonical_intake_candidate_demands link
      join public.adle_canonical_intake_candidates intake
        on intake.id = link.candidate_id
      where link.demand_id = demand.id
        and intake.source_candidate_mapping_id = v_source.id
    )
    and not exists (
      select 1
      from public.adle_canonical_intake_candidate_demands other_link
      join public.adle_canonical_intake_candidates other_intake
        on other_intake.id = other_link.candidate_id
      join public.parent_verified_spelling_candidate_mappings other_source
        on other_source.id = other_intake.source_candidate_mapping_id
      where other_link.demand_id = demand.id
        and other_link.link_status = 'waiting'
        and other_source.candidate_status in (
          'parent_local_promoted', 'global_canonical_promoted'
        )
    );

  update public.adle_canonical_intake_reconciliation_queue queue
  set job_status = 'completed',
      completed_at = coalesce(queue.completed_at, v_now),
      lease_owner = null,
      lease_expires_at = null,
      last_error_code = 'source_authority_superseded_r8d',
      updated_at = v_now
  where queue.candidate_id in (
      select intake.id
      from public.adle_canonical_intake_candidates intake
      where intake.source_candidate_mapping_id = v_source.id
    )
    and queue.job_status in ('pending', 'leased', 'retry');

  update public.adle_learning_item_sources source
  set row_status = 'superseded'
  where source.parent_verified_candidate_mapping_id = v_source.id
    and source.row_status = 'active';

  if v_learning_item.id is not null then
    if v_other_authoritative_count > 0 then
      v_target_action := 'kept_active_other_sources';
      v_schedule_action := 'kept_active_other_sources';
    else
      update public.adle_learning_items item
      set row_status = 'superseded', updated_at = v_now
      where item.id = v_learning_item.id and item.row_status = 'active';
      v_target_action := 'superseded_last_source';

      update public.adle_review_schedule_word_routes route
      set row_status = 'superseded'
      where route.learning_item_id = v_learning_item.id
        and route.row_status = 'active';
      get diagnostics v_schedule_routes_superseded = row_count;

      select count(*) into v_shared_schedule_count
      from public.adle_review_schedule_words schedule
      where schedule.child_id = p_child_id
        and schedule.canonical_word_id = v_learning_item.canonical_word_id
        and schedule.row_status = 'active'
        and exists (
          select 1 from public.adle_review_schedule_word_routes route
          where route.schedule_word_id = schedule.id
            and route.row_status = 'active'
        );

      update public.adle_review_schedule_words schedule
      set row_status = 'superseded', updated_at = v_now
      where schedule.child_id = p_child_id
        and schedule.canonical_word_id = v_learning_item.canonical_word_id
        and schedule.row_status = 'active'
        and not exists (
          select 1 from public.adle_review_schedule_word_routes route
          where route.schedule_word_id = schedule.id
            and route.row_status = 'active'
        );
      get diagnostics v_schedule_words_superseded = row_count;

      if v_schedule_words_superseded > 0 then
        v_schedule_action := 'future_review_stopped';
      elsif v_shared_schedule_count > 0 then
        v_schedule_action := 'route_superseded_shared_word_kept';
      elsif v_schedule_routes_superseded > 0 then
        v_schedule_action := 'route_superseded_no_active_schedule';
      else
        v_schedule_action := 'no_schedule';
      end if;
    end if;
  end if;

  -- The writing issue is the latest parent view. The old immutable candidate
  -- and this receipt preserve the previously believed word/skill/classification.
  update public.writing_issues issue
  set final_classification = p_new_final_classification,
      approved_replacement = case when v_is_learning then v_new_correct
        else issue.approved_replacement end,
      suggested_replacement = case when v_is_learning then v_new_correct
        else issue.suggested_replacement end,
      micro_skill_key = case when v_is_learning then v_new_skill
        else issue.micro_skill_key end,
      final_classified_at = v_now,
      metadata = case when v_is_learning then
        jsonb_set(
          coalesce(issue.metadata, '{}'::jsonb),
          '{known_match_auto_resolution}',
          jsonb_build_object(
            'authority', 'known_match',
            'canonical_mapping_id', p_replacement_canonical_mapping_id,
            'micro_skill_key', v_new_skill,
            'r8d_reconciled_at', v_now
          ),
          true
        )
      else coalesce(issue.metadata, '{}'::jsonb) end
        || jsonb_build_object(
          'r8d_latest_decision_at', v_now,
          'r8d_latest_idempotency_key', p_idempotency_key
        )
  where issue.id = v_issue.id;

  if v_is_learning then
    select public.ensure_parent_approved_spelling_occurrence_source(
      v_issue.id,
      p_parent_user_id,
      p_child_id,
      p_new_final_classification
    ) into v_replacement_result;
    begin
      v_replacement_candidate_id :=
        (v_replacement_result ->> 'candidate_mapping_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'R8D replacement source returned an invalid candidate identity.';
    end;
    if v_replacement_candidate_id is null
      or v_replacement_candidate_id = v_source.id
    then
      raise exception 'R8D replacement did not create a distinct governed occurrence source.';
    end if;

    v_governed_sources := public.collect_submission_thread_occurrence_sources(
      v_approval_submission.task_id, p_parent_user_id, p_child_id
    );
    begin
      select coalesce(array_agg(candidate_id order by candidate_id), '{}'::uuid[])
      into v_governed_ids
      from (
        select distinct (source ->> 'candidate_mapping_id')::uuid candidate_id
        from jsonb_array_elements(v_governed_sources) source
      ) governed;
    exception when invalid_text_representation then
      raise exception 'R8D replacement governed source set contains an invalid candidate identity.';
    end;
    if not v_replacement_candidate_id = any(v_governed_ids) then
      raise exception 'R8D replacement source is absent from the governed task-thread source set.';
    end if;

    perform public.adle_authorize_parent_approval_exact_id_handoff(
      p_approval_submission_id,
      p_parent_user_id,
      p_child_id,
      v_governed_ids
    );

    update public.parent_verified_spelling_candidate_mappings candidate
    set metadata = coalesce(candidate.metadata, '{}'::jsonb) || jsonb_build_object(
      'r8d_replaces_candidate_mapping_id', v_source.id,
      'r8d_reconciliation_idempotency_key', p_idempotency_key
    )
    where candidate.id = v_replacement_candidate_id;
    update public.parent_verified_spelling_candidate_mappings candidate
    set metadata = coalesce(candidate.metadata, '{}'::jsonb) || jsonb_build_object(
      'r8d_replaced_by_candidate_mapping_id', v_replacement_candidate_id
    )
    where candidate.id = v_source.id;
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'replayed', false,
    'writingIssueId', v_issue.id,
    'sourceCandidateMappingId', v_source.id,
    'replacementCandidateMappingId', v_replacement_candidate_id,
    'replacementCandidateMappingIds', case when v_is_learning
      then to_jsonb(v_governed_ids) else '[]'::jsonb end,
    'newFinalClassification', p_new_final_classification,
    'reconciliationClass', v_reconciliation_class,
    'authoritativeSourceCountAfter', v_other_authoritative_count,
    'targetAction', v_target_action,
    'scheduleAction', v_schedule_action,
    'protectedHistoryCounts', v_protected_counts,
    'nextAuthorityVersion', p_expected_authority_version + 1,
    'replacementRequiresCanonicalIntake', v_is_learning
  );

  insert into public.adle_spelling_decision_reconciliations (
    parent_user_id, child_id, writing_issue_id,
    source_candidate_mapping_id, replacement_candidate_mapping_id,
    old_learning_item_id, idempotency_key, request_fingerprint,
    expected_authority_version, old_final_classification,
    new_final_classification, old_correct_spelling_normalized,
    new_correct_spelling_normalized, old_micro_skill_key,
    new_micro_skill_key, reconciliation_class,
    authoritative_source_count_after, target_action, schedule_action,
    protected_history_counts, reason, result_payload
  ) values (
    p_parent_user_id, p_child_id, v_issue.id,
    v_source.id, v_replacement_candidate_id,
    v_learning_item.id, p_idempotency_key, v_request_fingerprint,
    p_expected_authority_version, v_issue.final_classification,
    p_new_final_classification, v_source.correct_spelling_normalized,
    nullif(v_new_correct, ''), v_source.micro_skill_key,
    nullif(v_new_skill, ''), v_reconciliation_class,
    v_other_authoritative_count, v_target_action, v_schedule_action,
    v_protected_counts, btrim(p_reason), v_result
  );

  return v_result;
end;
$$;

revoke all on function public.adle_reconcile_parent_spelling_decision_r8d(
  uuid, uuid, uuid, uuid, bigint, text, text, text, uuid, uuid, text, text
) from public, anon;
grant execute on function public.adle_reconcile_parent_spelling_decision_r8d(
  uuid, uuid, uuid, uuid, bigint, text, text, text, uuid, uuid, text, text
) to authenticated, service_role;

alter table public.adle_spelling_decision_reconciliations enable row level security;
revoke all on table public.adle_spelling_decision_reconciliations
  from anon, authenticated;
grant all on table public.adle_spelling_decision_reconciliations to service_role;

commit;
