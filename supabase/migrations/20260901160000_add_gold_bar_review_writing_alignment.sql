-- GB.2-GB.4: add a reward-owned, append-only qualification ledger and an
-- atomic Word Treasure consumer for governed Review-writing evidence.
-- This migration is inert until the application GB.5 release gate is opened;
-- it does not alter Review finalization, scheduling, reducers or proficiency.

begin;

create table if not exists public.child_word_treasure_review_use_qualifications (
  id uuid primary key default gen_random_uuid(),
  treasure_id uuid not null,
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  canonical_word_id uuid not null
    references public.canonical_teaching_dictionary_words(id) on delete restrict,
  source_authentic_use_event_id uuid not null unique
    references public.adle_authentic_use_events(id) on delete restrict,
  review_session_id uuid not null
    references public.adle_review_sessions(id) on delete restrict,
  review_encounter_id uuid not null unique
    references public.adle_review_word_encounters(id) on delete restrict,
  evidence_source_class text not null default 'REVIEW_WRITING_AUTHENTIC_USE',
  qualification_status text not null,
  answer_visibility_status text not null,
  context_validation_status text not null,
  context_validator_version text not null,
  reason_codes text[] not null,
  reward_policy_version text not null,
  policy_effective_at timestamptz not null,
  occurred_at timestamptz not null,
  evaluated_at timestamptz not null default timezone('utc', now()),
  request_fingerprint text not null,
  credited_reward_event_id uuid
    references public.child_word_treasure_events(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  constraint child_word_treasure_review_qual_treasure_fkey
    foreign key (treasure_id, child_id, parent_user_id)
    references public.child_word_treasures(id, child_id, parent_user_id)
    on delete cascade,
  constraint child_word_treasure_review_qual_source_class_check
    check (evidence_source_class = 'REVIEW_WRITING_AUTHENTIC_USE'),
  constraint child_word_treasure_review_qual_status_check
    check (qualification_status in ('ELIGIBLE', 'INELIGIBLE', 'UNCERTAIN')),
  constraint child_word_treasure_review_qual_visibility_check
    check (answer_visibility_status in ('HIDDEN', 'VISIBLE', 'UNKNOWN')),
  constraint child_word_treasure_review_qual_context_check
    check (context_validation_status in ('NOT_REQUIRED', 'VALID', 'INVALID', 'UNCERTAIN')),
  constraint child_word_treasure_review_qual_validator_check
    check (btrim(context_validator_version) <> ''),
  constraint child_word_treasure_review_qual_reasons_check
    check (cardinality(reason_codes) > 0),
  constraint child_word_treasure_review_qual_policy_check
    check (reward_policy_version = 'WORD_TREASURE_AUTHENTIC_USE_V2'),
  constraint child_word_treasure_review_qual_fingerprint_check
    check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint child_word_treasure_review_qual_credit_shape_check
    check ((qualification_status = 'ELIGIBLE') = (credited_reward_event_id is not null)),
  constraint child_word_treasure_review_qual_task_unique
    unique (treasure_id, review_session_id)
);

create index if not exists child_word_treasure_review_qual_parent_child_idx
  on public.child_word_treasure_review_use_qualifications(
    parent_user_id, child_id, evaluated_at desc
  );
create index if not exists child_word_treasure_review_qual_treasure_idx
  on public.child_word_treasure_review_use_qualifications(
    treasure_id, evaluated_at desc
  );

create or replace function public.prevent_child_word_treasure_review_qualification_rewrite()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  raise exception 'Gold Bar Review-writing qualifications are append-only';
end;
$$;

drop trigger if exists child_word_treasure_review_qualifications_immutable
  on public.child_word_treasure_review_use_qualifications;
create trigger child_word_treasure_review_qualifications_immutable
before update or delete on public.child_word_treasure_review_use_qualifications
for each row execute function public.prevent_child_word_treasure_review_qualification_rewrite();

alter table public.child_word_treasure_review_use_qualifications enable row level security;
revoke all on table public.child_word_treasure_review_use_qualifications
  from public, anon, authenticated;
grant select on table public.child_word_treasure_review_use_qualifications
  to authenticated;
grant all on table public.child_word_treasure_review_use_qualifications
  to service_role;

drop policy if exists child_word_treasure_review_qualifications_parent_select
  on public.child_word_treasure_review_use_qualifications;
create policy child_word_treasure_review_qualifications_parent_select
on public.child_word_treasure_review_use_qualifications
for select
to authenticated
using (auth.uid() = parent_user_id);

create or replace function public.record_review_writing_gold_bar_use_v2(
  p_source_authentic_use_event_id uuid,
  p_treasure_id uuid,
  p_qualification_status text,
  p_answer_visibility_status text,
  p_context_validation_status text,
  p_context_validator_version text,
  p_reason_codes text[],
  p_reward_policy_version text,
  p_policy_effective_at timestamptz,
  p_request_fingerprint text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_treasure public.child_word_treasures%rowtype;
  v_source public.adle_authentic_use_events%rowtype;
  v_session public.adle_review_sessions%rowtype;
  v_encounter public.adle_review_word_encounters%rowtype;
  v_dictionary public.canonical_teaching_dictionary_words%rowtype;
  v_existing public.child_word_treasure_review_use_qualifications%rowtype;
  v_qualification public.child_word_treasure_review_use_qualifications%rowtype;
  v_reward_event public.child_word_treasure_events%rowtype;
  v_final_status text := p_qualification_status;
  v_reasons text[] := p_reason_codes;
  v_next_count integer;
  v_awards_bar boolean := false;
  v_inserted_credit boolean := false;
  v_inserted_bar boolean := false;
begin
  if p_source_authentic_use_event_id is null
    or p_treasure_id is null
    or p_qualification_status not in ('ELIGIBLE', 'INELIGIBLE', 'UNCERTAIN')
    or p_answer_visibility_status not in ('HIDDEN', 'VISIBLE', 'UNKNOWN')
    or p_context_validation_status not in ('NOT_REQUIRED', 'VALID', 'INVALID', 'UNCERTAIN')
    or nullif(btrim(p_context_validator_version), '') is null
    or coalesce(cardinality(p_reason_codes), 0) = 0
    or p_reward_policy_version <> 'WORD_TREASURE_AUTHENTIC_USE_V2'
    or p_policy_effective_at is null
    or p_request_fingerprint !~ '^[a-f0-9]{64}$'
  then raise exception 'gold_bar_review_use_envelope_malformed'; end if;

  -- The treasure lock serializes counter/threshold transitions and also makes
  -- a concurrent retry observe the first transaction's qualification row.
  select * into v_treasure
  from public.child_word_treasures treasure
  where treasure.id = p_treasure_id
  for update;
  if not found then raise exception 'gold_bar_review_use_treasure_missing'; end if;

  select * into v_existing
  from public.child_word_treasure_review_use_qualifications qualification
  where qualification.source_authentic_use_event_id = p_source_authentic_use_event_id;
  if found then
    if v_existing.request_fingerprint <> p_request_fingerprint
    then raise exception 'gold_bar_review_use_idempotency_conflict'; end if;
    return jsonb_build_object(
      'status', 'already_persisted',
      'qualificationId', v_existing.id,
      'qualificationStatus', v_existing.qualification_status,
      'credited', v_existing.credited_reward_event_id is not null,
      'goldenBarAwarded', false
    );
  end if;

  select * into v_source
  from public.adle_authentic_use_events evidence
  where evidence.id = p_source_authentic_use_event_id
  for share;
  if not found
    or v_source.provenance_kind <> 'prompted_review_writing_application'
    or v_source.row_status <> 'active'
    or v_source.use_kind <> 'authentic_correct_use'
    or v_source.parent_verified is true
    or v_source.verified_at is not null
    or v_source.review_session_id is null
    or v_source.review_encounter_id is null
    or v_source.writing_submitted_at is null
  then raise exception 'gold_bar_review_use_source_invalid'; end if;

  select * into v_session
  from public.adle_review_sessions session
  where session.id = v_source.review_session_id
  for share;
  if not found
    or v_session.stage <> 'completed'
    or v_session.completed_at is null
    or v_session.submitted_writing_text is null
    or v_session.writing_submitted_at is null
    or v_session.child_id <> v_source.child_id
    or v_session.writing_submitted_at is distinct from v_source.writing_submitted_at
    or v_session.snapshot_fingerprint is distinct from v_source.snapshot_fingerprint
    or v_session.selected_prompt_version_id is distinct from v_source.prompt_version_id
    or v_session.daily_assignment_id is distinct from v_source.daily_assignment_id
    or v_session.assignment_item_id is distinct from v_source.assignment_item_id
  then raise exception 'gold_bar_review_use_session_lineage_invalid'; end if;

  select * into v_encounter
  from public.adle_review_word_encounters encounter
  where encounter.id = v_source.review_encounter_id
  for share;
  if not found
    or v_encounter.review_session_id <> v_session.id
    or v_encounter.canonical_word_id <> v_source.canonical_word_id
    or v_encounter.writing_disposition <> 'correct_in_writing'
    or v_encounter.original_outcome <> 'success'
    or v_encounter.original_outcome_source <> 'writing'
    or v_encounter.repair_state <> 'not_required'
  then raise exception 'gold_bar_review_use_encounter_lineage_invalid'; end if;

  select * into v_dictionary
  from public.canonical_teaching_dictionary_words word
  where word.id = v_source.canonical_word_id
  for share;
  if not found
    or v_treasure.child_id <> v_source.child_id
    or v_treasure.parent_user_id <> v_session.parent_user_id
    or v_treasure.corrected_word_normalized <> v_dictionary.normalised_word
    or (v_treasure.canonical_word_id is not null
      and v_treasure.canonical_word_id <> v_source.canonical_word_id)
  then raise exception 'gold_bar_review_use_treasure_lineage_invalid'; end if;

  if v_source.writing_submitted_at < p_policy_effective_at then
    v_final_status := 'INELIGIBLE';
    v_reasons := array_append(v_reasons, 'BEFORE_POLICY_EFFECTIVE_AT');
  end if;
  if v_treasure.entered_forge_at is null then
    v_final_status := 'INELIGIBLE';
    v_reasons := array_append(v_reasons, 'WORD_NOT_IN_FORGE_AT_OCCURRENCE');
  elsif v_source.writing_submitted_at < v_treasure.entered_forge_at then
    v_final_status := 'INELIGIBLE';
    v_reasons := array_append(v_reasons, 'USE_BEFORE_FORGE_ENTRY');
  end if;
  if v_treasure.status <> 'in_forge' then
    v_final_status := 'INELIGIBLE';
    v_reasons := array_append(v_reasons, case
      when v_treasure.status = 'golden_bar' then 'GOLD_BAR_ALREADY_AWARDED'
      else 'TREASURE_NOT_IN_FORGE'
    end);
  end if;
  if p_answer_visibility_status = 'VISIBLE'
    or p_context_validation_status = 'INVALID'
  then
    v_final_status := 'INELIGIBLE';
  elsif v_final_status = 'ELIGIBLE' and (
    p_answer_visibility_status = 'UNKNOWN'
    or p_context_validation_status = 'UNCERTAIN'
  ) then
    v_final_status := 'UNCERTAIN';
  end if;
  if v_final_status = 'ELIGIBLE' and (
    p_answer_visibility_status <> 'HIDDEN'
    or p_context_validation_status not in ('NOT_REQUIRED', 'VALID')
  ) then raise exception 'gold_bar_review_use_eligible_shape_invalid'; end if;

  if v_final_status = 'ELIGIBLE' then
    v_next_count := v_treasure.authentic_correct_uses_after_forge + 1;
    v_awards_bar := v_next_count >= v_treasure.required_uses_for_bar;
    insert into public.child_word_treasure_events(
      treasure_id, child_id, parent_user_id, event_type, source_type,
      source_entity_id, previous_status, new_status,
      authentic_use_increment, metadata
    ) values (
      v_treasure.id, v_treasure.child_id, v_treasure.parent_user_id,
      'authentic_correct_use_recorded', 'review_writing_authentic_use',
      v_session.id::text, v_treasure.status,
      case when v_awards_bar then 'golden_bar' else 'in_forge' end,
      1,
      jsonb_build_object(
        'evidenceSourceClass', 'REVIEW_WRITING_AUTHENTIC_USE',
        'sourceAuthenticUseEventId', v_source.id,
        'reviewSessionId', v_session.id,
        'reviewEncounterId', v_encounter.id,
        'prompted', true,
        'parentApprovalRequired', false,
        'rewardPolicyVersion', p_reward_policy_version,
        'contextValidationStatus', p_context_validation_status,
        'contextValidatorVersion', p_context_validator_version
      )
    )
    on conflict (treasure_id, event_type, source_type, source_entity_id)
      where source_entity_id is not null
    do nothing
    returning * into v_reward_event;

    if found then
      v_inserted_credit := true;
      update public.child_word_treasures
      set authentic_correct_uses_after_forge = v_next_count,
          status = case when v_awards_bar then 'golden_bar' else status end,
          golden_bar_at = case
            when v_awards_bar then coalesce(golden_bar_at, timezone('utc', now()))
            else golden_bar_at
          end
      where id = v_treasure.id;

      if v_awards_bar then
        insert into public.child_word_treasure_events(
          treasure_id, child_id, parent_user_id, event_type, source_type,
          source_entity_id, previous_status, new_status,
          authentic_use_increment, metadata
        ) values (
          v_treasure.id, v_treasure.child_id, v_treasure.parent_user_id,
          'golden_bar_awarded', 'word_treasure', v_treasure.id::text,
          'in_forge', 'golden_bar', 0,
          jsonb_build_object(
            'requiredUses', v_treasure.required_uses_for_bar,
            'rewardPolicyVersion', p_reward_policy_version,
            'triggerSourceType', 'review_writing_authentic_use',
            'triggerReviewSessionId', v_session.id
          )
        )
        on conflict (treasure_id, event_type, source_type, source_entity_id)
          where source_entity_id is not null
        do nothing;
        v_inserted_bar := found;
      end if;
    else
      select * into v_reward_event
      from public.child_word_treasure_events event
      where event.treasure_id = v_treasure.id
        and event.event_type = 'authentic_correct_use_recorded'
        and event.source_type = 'review_writing_authentic_use'
        and event.source_entity_id = v_session.id::text;
      if not found then raise exception 'gold_bar_review_use_credit_conflict'; end if;
    end if;
  end if;

  insert into public.child_word_treasure_review_use_qualifications(
    treasure_id, child_id, parent_user_id, canonical_word_id,
    source_authentic_use_event_id, review_session_id, review_encounter_id,
    evidence_source_class, qualification_status, answer_visibility_status,
    context_validation_status, context_validator_version, reason_codes,
    reward_policy_version, policy_effective_at, occurred_at, request_fingerprint,
    credited_reward_event_id
  ) values (
    v_treasure.id, v_treasure.child_id, v_treasure.parent_user_id,
    v_source.canonical_word_id, v_source.id, v_session.id, v_encounter.id,
    'REVIEW_WRITING_AUTHENTIC_USE', v_final_status,
    p_answer_visibility_status, p_context_validation_status,
    p_context_validator_version,
    (select array_agg(distinct reason order by reason) from unnest(v_reasons) reason),
    p_reward_policy_version, p_policy_effective_at, v_source.writing_submitted_at,
    p_request_fingerprint,
    case when v_final_status = 'ELIGIBLE' then v_reward_event.id else null end
  ) returning * into v_qualification;

  return jsonb_build_object(
    'status', 'persisted',
    'qualificationId', v_qualification.id,
    'qualificationStatus', v_qualification.qualification_status,
    'credited', v_qualification.credited_reward_event_id is not null,
    'creditInserted', v_inserted_credit,
    'goldenBarAwarded', v_inserted_bar
  );
end;
$$;

revoke all on function public.record_review_writing_gold_bar_use_v2(
  uuid, uuid, text, text, text, text, text[], text, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.record_review_writing_gold_bar_use_v2(
  uuid, uuid, text, text, text, text, text[], text, timestamptz, text
) to service_role;

commit;
