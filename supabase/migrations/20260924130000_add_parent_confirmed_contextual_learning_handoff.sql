-- Parent-confirmed word choice is a learning-need source, never a spelling
-- mapping. The advisory kill switch remains the one global intake control.
alter table public.adle_learning_items
  drop constraint adle_learning_items_source_kind_check;
alter table public.adle_learning_items
  add constraint adle_learning_items_source_kind_check
  check (source_kind = any (array[
    'verified_misspelling','probe_miss','review_ejection',
    'slippage_reentry','stretch_selection','transfer_confirmation',
    'parent_verified_contextual_choice'
  ]));

create table public.writing_context_learning_handoffs (
  writing_issue_id uuid primary key references public.writing_issues(id) on delete restrict,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  occurrence_id text not null references public.writing_occurrences(id) on delete restrict,
  canonical_word_id uuid references public.canonical_teaching_dictionary_words(id),
  adle_learning_item_id uuid references public.adle_learning_items(id),
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key),
  handoff_state text not null check (handoff_state in
    ('PENDING_CANONICAL_WORD','PENDING_WORD_SUPPORT','PENDING_TEACHING_CONTENT',
     'PENDING_EXISTING_ITEM_REVIEW','READY')),
  blocker_code text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check ((handoff_state='READY')=(adle_learning_item_id is not null))
);
create index writing_context_learning_handoffs_child_idx
  on public.writing_context_learning_handoffs(child_id,handoff_state,updated_at);
alter table public.writing_context_learning_handoffs enable row level security;
create policy writing_context_learning_handoffs_parent_read
  on public.writing_context_learning_handoffs for select to authenticated
  using (parent_user_id=auth.uid());
revoke all on public.writing_context_learning_handoffs from public,anon,authenticated;
grant select on public.writing_context_learning_handoffs to authenticated;
grant all on public.writing_context_learning_handoffs to service_role;

-- Idempotent source-to-ADLE admission. Missing curriculum facts remain an
-- inspectable pending handoff; they never become invented spelling mappings.
create function public.reconcile_contextual_adle_learning_need(
  p_writing_issue_id uuid,p_parent_user_id uuid,p_child_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_issue public.writing_issues%rowtype;
        v_word public.canonical_teaching_dictionary_words%rowtype;
        v_item_id uuid; v_state text; v_blocker text;
begin
  perform pg_advisory_xact_lock(hashtextextended('context-adle:'||p_writing_issue_id::text,0));
  select * into v_issue from public.writing_issues where id=p_writing_issue_id
    and parent_user_id=p_parent_user_id and child_id=p_child_id for update;
  if v_issue.id is null or v_issue.metadata->>'source_kind'<>'contextual_advisory_v4'
     or v_issue.final_classification not in ('concept_gap','fragile_knowledge','transfer_failure')
     or v_issue.source_writing_occurrence_id is null then
    raise exception 'contextual_adle_source_not_parent_confirmed';
  end if;
  select * into v_word from public.canonical_teaching_dictionary_words
    where normalised_word=lower(replace(replace(v_issue.approved_replacement,'’',chr(39)),'ʼ',chr(39)))
      and row_status='active' and review_status='approved_for_first_exposure'
    order by id limit 1;
  if v_word.id is null then
    v_state:='PENDING_CANONICAL_WORD'; v_blocker:='CANONICAL_WORD_NOT_READY';
  elsif not exists (
    select 1 from public.canonical_teaching_dictionary_word_support support
    where support.canonical_word_id=v_word.id and support.micro_skill_key=v_issue.micro_skill_key
      and support.row_status='active' and support.review_status='approved_for_first_exposure'
  ) then
    v_state:='PENDING_WORD_SUPPORT'; v_blocker:='WORD_SKILL_SUPPORT_NOT_READY';
  elsif not exists (
    select 1 from public.canonical_teaching_dictionary_content_versions content
    where content.micro_skill_key=v_issue.micro_skill_key and content.is_active=true
      and content.version_status='active' and content.final_readiness_review_status='signed_off'
  ) then
    v_state:='PENDING_TEACHING_CONTENT'; v_blocker:='TEACHING_CONTENT_NOT_READY';
  elsif exists (
    select 1 from public.adle_learning_items item
    where item.child_id=p_child_id and item.canonical_word_id=v_word.id
      and item.micro_skill_key=v_issue.micro_skill_key and item.row_status='active'
      and item.item_status='resolved'
  ) then
    v_state:='PENDING_EXISTING_ITEM_REVIEW';
    v_blocker:='RESOLVED_ITEM_REENTRY_REQUIRES_GOVERNED_REVIEW';
  else
    select id into v_item_id from public.adle_learning_items
    where child_id=p_child_id and canonical_word_id=v_word.id
      and micro_skill_key=v_issue.micro_skill_key and row_status='active'
    order by created_at,id limit 1 for update;
    if v_item_id is null then
      insert into public.adle_learning_items(child_id,canonical_word_id,micro_skill_key,
        item_status,source_kind,source_ref,source_attempt_text,reteach_priority,intake_on,row_status)
      values(p_child_id,v_word.id,v_issue.micro_skill_key,'pending',
        'parent_verified_contextual_choice','contextual_writing_issue:'||v_issue.id,
        null,false,coalesce((select submitted_at::date from public.task_submissions
          where id=v_issue.task_submission_id),current_date),'active')
      on conflict do nothing returning id into v_item_id;
      if v_item_id is null then
        select id into v_item_id from public.adle_learning_items
        where child_id=p_child_id and canonical_word_id=v_word.id
          and micro_skill_key=v_issue.micro_skill_key and row_status='active'
        order by created_at,id limit 1;
      end if;
    end if;
    if v_item_id is null then raise exception 'contextual_adle_item_not_durable'; end if;
    v_state:='READY'; v_blocker:=null;
  end if;
  insert into public.writing_context_learning_handoffs(writing_issue_id,parent_user_id,
    child_id,occurrence_id,canonical_word_id,adle_learning_item_id,micro_skill_key,
    handoff_state,blocker_code)
  values(v_issue.id,p_parent_user_id,p_child_id,v_issue.source_writing_occurrence_id,
    v_word.id,v_item_id,v_issue.micro_skill_key,v_state,v_blocker)
  on conflict(writing_issue_id) do update set
    canonical_word_id=excluded.canonical_word_id,
    adle_learning_item_id=excluded.adle_learning_item_id,
    handoff_state=excluded.handoff_state,blocker_code=excluded.blocker_code,
    updated_at=clock_timestamp();
  return jsonb_build_object('handoff_state',v_state,'blocker_code',v_blocker,
    'adle_learning_item_id',v_item_id,'canonical_word_id',v_word.id);
end $$;
revoke all on function public.reconcile_contextual_adle_learning_need(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.reconcile_contextual_adle_learning_need(uuid,uuid,uuid)
  to service_role;

create function public.finalise_parent_confirmed_contextual_learning_need(
  p_writing_issue_id uuid,p_parent_user_id uuid,p_child_id uuid,
  p_final_classification text,p_micro_skill_key text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_issue public.writing_issues%rowtype; v_expected_skill text;
        v_result jsonb; v_adle jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('context-finalise:'||p_writing_issue_id::text,0));
  select * into v_issue from public.writing_issues where id=p_writing_issue_id
    and parent_user_id=p_parent_user_id and child_id=p_child_id for update;
  if v_issue.id is null or v_issue.metadata->>'source_kind'<>'contextual_advisory_v4'
      or v_issue.issue_status<>'child_responded' or v_issue.final_classification is not null
      or v_issue.source_writing_occurrence_id is null then
    raise exception 'contextual_learning_issue_not_reviewable';
  end if;
  if not exists (
    select 1 from public.writing_context_current_parent_decisions decision
    where decision.occurrence_id=v_issue.source_writing_occurrence_id
      and decision.classification='INVALID'
      and decision.intended_member=lower(replace(replace(v_issue.approved_replacement,'’',chr(39)),'ʼ',chr(39)))
      and decision.parent_user_id=p_parent_user_id
  ) then raise exception 'contextual_parent_decision_not_current'; end if;
  if p_final_classification not in ('concept_gap','fragile_knowledge','transfer_failure') then
    raise exception 'contextual_learning_outcome_invalid';
  end if;
  select case family_key
    when 'THERE_THEIR_THEYRE' then 'D4_HOM_FUNCTION_WORD_HOMOPHONES_THERE_THEIR_THEYRE'
    when 'TO_TOO_TWO' then 'D4_HOM_FUNCTION_WORD_HOMOPHONES_TO_TOO_TWO'
    when 'YOUR_YOURE' then 'D4_HOM_CONTRACTION_POSSESSIVE_YOUR_YOURE'
    when 'ITS_ITS' then 'D4_HOM_CONTRACTION_POSSESSIVE_ITS_ITS'
  end into v_expected_skill
  from public.writing_context_current_parent_decisions
  where occurrence_id=v_issue.source_writing_occurrence_id;
  if p_micro_skill_key is distinct from v_expected_skill or not exists (
    select 1 from public.micro_skill_catalog catalog
    where catalog.micro_skill_key=p_micro_skill_key and catalog.mastery_domain_key='D4'
      and catalog.is_active=true and catalog.is_assignable=true
  ) then raise exception 'contextual_micro_skill_not_governed'; end if;
  update public.writing_issues set micro_skill_key=p_micro_skill_key,
    metadata=metadata||jsonb_build_object('contextual_learning_source','PARENT_CONFIRMED_ORIGINAL_WRITING',
      'retry_evidence_kind','REPAIR_ONLY'),updated_at=clock_timestamp()
  where id=v_issue.id;
  v_result:=public.finalise_writing_issue_classification_and_learning_item_pre_context_advisory(
    p_writing_issue_id,p_parent_user_id,p_child_id,p_final_classification);
  if v_result->>'learning_item_id' is null then
    raise exception 'contextual_legacy_learning_item_not_created';
  end if;
  -- The legacy finaliser can call an "easy" prompted correction independently
  -- corrected. That label is not valid for this word-only contextual retry.
  update public.learning_item_evidence set evidence_type='corrected_after_prompt',
    metadata=metadata||jsonb_build_object('evidence_kind','REPAIR_ONLY',
      'legacy_attempt_evidence_type','corrected_independently'),
    updated_at=clock_timestamp()
  where writing_issue_id=p_writing_issue_id
    and source_context='child_correction_attempt'
    and evidence_type='corrected_independently';
  v_adle:=public.reconcile_contextual_adle_learning_need(
    p_writing_issue_id,p_parent_user_id,p_child_id);
  return v_result||v_adle||jsonb_build_object('evidence_kind','PARENT_CONFIRMED_CONTEXTUAL_NEED',
    'retry_evidence_kind','REPAIR_ONLY');
end $$;
revoke all on function public.finalise_parent_confirmed_contextual_learning_need(uuid,uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.finalise_parent_confirmed_contextual_learning_need(uuid,uuid,uuid,text,text)
  to service_role;

-- A learning-relevant contextual outcome may not enter the old repair-only
-- route, including when a stale Review Work form submits directly to the RPC.
create or replace function public.finalise_contextual_repair_only(
  p_writing_issue_id uuid,p_parent_user_id uuid,p_child_id uuid,p_outcome text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_issue public.writing_issues%rowtype;
begin
  if p_outcome not in ('checking_only','not_an_issue') then
    raise exception 'contextual_learning_requires_parent_micro_skill_confirmation';
  end if;
  select * into v_issue from public.writing_issues where id=p_writing_issue_id
    and parent_user_id=p_parent_user_id and child_id=p_child_id for update;
  if v_issue.id is null or v_issue.metadata->>'source_kind'<>'contextual_advisory_v4'
     or v_issue.issue_status<>'child_responded' or v_issue.final_classification is not null then
    raise exception 'contextual_repair_scope_invalid';
  end if;
  update public.writing_issues set issue_status='finalised',
    final_classification=p_outcome,final_classified_at=clock_timestamp(),
    metadata=metadata||jsonb_build_object('evidence_kind','REPAIR_ONLY',
      'learning_projection','NOT_APPLICABLE'),updated_at=clock_timestamp()
  where id=p_writing_issue_id;
  return p_writing_issue_id;
end $$;

-- Generic callers may close non-learning contextual repairs, but cannot
-- accidentally turn a learning-relevant contextual outcome into repair-only.
create or replace function public.finalise_writing_issue_classification_and_learning_item(
  p_writing_issue_id uuid,p_parent_user_id uuid,p_child_id uuid,
  p_final_classification text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_issue public.writing_issues%rowtype;
begin
  if auth.uid() is not null and auth.uid()<>p_parent_user_id then
    raise exception 'writing_issue_parent_scope_invalid';
  end if;
  select * into v_issue from public.writing_issues where id=p_writing_issue_id
    and parent_user_id=p_parent_user_id and child_id=p_child_id;
  if v_issue.metadata->>'source_kind'='contextual_advisory_v4' then
    if p_final_classification in ('concept_gap','fragile_knowledge','transfer_failure') then
      raise exception 'contextual_learning_requires_parent_micro_skill_confirmation';
    end if;
    perform public.finalise_contextual_repair_only(p_writing_issue_id,p_parent_user_id,
      p_child_id,p_final_classification);
    return jsonb_build_object('writing_issue_id',p_writing_issue_id,
      'learning_item_id',null,'created_learning_item',false,
      'reused_learning_item',false,'evidence_kind','REPAIR_ONLY');
  end if;
  return public.finalise_writing_issue_classification_and_learning_item_pre_context_advisory(
    p_writing_issue_id,p_parent_user_id,p_child_id,p_final_classification);
end $$;

-- Emergency rollback changes only the singleton switch. Existing source,
-- parent decisions, repairs, learning items and rewards remain durable.
create function public.disable_writing_context_advisory(p_actor uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_actor is null then raise exception 'rollback_actor_required'; end if;
  update public.writing_context_advisory_control
  set enabled=false,updated_by=p_actor where singleton=true and enabled=true;
  return true;
end $$;
revoke all on function public.disable_writing_context_advisory(uuid)
  from public,anon,authenticated;
grant execute on function public.disable_writing_context_advisory(uuid) to service_role;
