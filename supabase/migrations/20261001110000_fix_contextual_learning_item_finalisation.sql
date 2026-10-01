-- Contextual word-choice learning needs have a writing occurrence, not a
-- spelling-instance source. Keep the spelling finaliser strict and give the
-- already-governed contextual bridge its own durable learning-item path.
create or replace function public.finalise_contextual_learning_item(
  p_writing_issue_id uuid,p_parent_user_id uuid,p_child_id uuid,
  p_final_classification text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_issue public.writing_issues%rowtype;
  v_catalog public.micro_skill_catalog%rowtype;
  v_existing public.learning_items%rowtype;
  v_now timestamptz := timezone('utc',now());
  v_learning_item_id uuid;
  v_created boolean := false;
  v_reused boolean := false;
  v_competency integer;
  v_evidence_type text;
  v_issue_evidence_count integer := 0;
  v_attempt_evidence_count integer := 0;
begin
  if auth.uid() is not null and auth.uid() <> p_parent_user_id then
    raise exception 'contextual_learning_parent_scope_invalid';
  end if;
  if p_final_classification not in ('concept_gap','fragile_knowledge','transfer_failure') then
    raise exception 'contextual_learning_outcome_invalid';
  end if;

  select * into v_issue from public.writing_issues
  where id=p_writing_issue_id and parent_user_id=p_parent_user_id and child_id=p_child_id
  for update;
  if v_issue.id is null or v_issue.metadata->>'source_kind'<>'contextual_advisory_v4'
      or v_issue.issue_status<>'child_responded' or v_issue.final_classification is not null
      or v_issue.source_writing_occurrence_id is null
      or v_issue.source_misspelling_instance_id is not null then
    raise exception 'contextual_learning_item_source_invalid';
  end if;

  select * into v_catalog from public.micro_skill_catalog
  where micro_skill_key=v_issue.micro_skill_key and mastery_domain_key='D4'
    and is_active=true and is_assignable=true
  limit 1;
  if v_catalog.id is null then raise exception 'contextual_micro_skill_not_governed'; end if;

  v_competency:=public.initial_learning_item_competency_for_final_classification(p_final_classification);
  v_evidence_type:=public.learning_item_evidence_type_for_final_classification(p_final_classification);
  if v_competency is null or v_evidence_type is null then
    raise exception 'contextual_learning_outcome_invalid';
  end if;

  update public.writing_issues
  set final_classification=p_final_classification,issue_status='finalised',
    final_classified_at=v_now,
    metadata=metadata||jsonb_build_object(
      'contextual_learning_source','PARENT_CONFIRMED_ORIGINAL_WRITING',
      'retry_evidence_kind','REPAIR_ONLY'
    ),updated_at=v_now
  where id=v_issue.id;

  select * into v_existing from public.learning_items
  where child_id=v_issue.child_id and parent_user_id=v_issue.parent_user_id
    and is_active=true and micro_skill_key=v_issue.micro_skill_key
    and practice_route=v_catalog.practice_route
  order by updated_at desc,created_at desc,id desc limit 1 for update;
  if v_existing.id is not null then
    v_learning_item_id:=v_existing.id;
    v_reused:=true;
    update public.learning_items set updated_at=v_now where id=v_learning_item_id;
    insert into public.learning_item_issue_links(
      learning_item_id,writing_issue_id,child_id,parent_user_id,link_role,metadata,created_at,updated_at
    ) values (
      v_learning_item_id,v_issue.id,v_issue.child_id,v_issue.parent_user_id,'supporting',
      jsonb_build_object('created_from_final_classification',p_final_classification,
        'source_kind','contextual_advisory_v4'),v_now,v_now
    ) on conflict (learning_item_id,writing_issue_id) do nothing;
  else
    insert into public.learning_items(
      child_id,parent_user_id,source_writing_issue_id,micro_skill_key,mastery_domain_key,
      skill_family_key,skill_cluster_key,practice_route,current_competency_level,
      theme_key,progress_state,is_active,metadata,created_at,updated_at
    ) values (
      v_issue.child_id,v_issue.parent_user_id,v_issue.id,v_issue.micro_skill_key,
      v_catalog.mastery_domain_key,v_catalog.skill_family_key,v_catalog.skill_cluster_key,
      v_catalog.practice_route,v_competency,v_issue.theme_key,'golden_nugget',true,
      jsonb_build_object('created_from_final_classification',p_final_classification,
        'source_issue_status_at_creation','finalised','source_kind','contextual_advisory_v4'),v_now,v_now
    ) on conflict (source_writing_issue_id) do nothing returning id into v_learning_item_id;
    if v_learning_item_id is null then
      select id into v_learning_item_id from public.learning_items
      where source_writing_issue_id=v_issue.id and parent_user_id=p_parent_user_id limit 1;
    else
      v_created:=true;
      insert into public.learning_item_issue_links(
        learning_item_id,writing_issue_id,child_id,parent_user_id,link_role,metadata,created_at,updated_at
      ) values (
        v_learning_item_id,v_issue.id,v_issue.child_id,v_issue.parent_user_id,'origin',
        jsonb_build_object('created_from_final_classification',p_final_classification,
          'source_kind','contextual_advisory_v4'),v_now,v_now
      ) on conflict (learning_item_id,writing_issue_id) do nothing;
    end if;
  end if;

  insert into public.learning_item_evidence(
    learning_item_id,child_id,parent_user_id,writing_issue_id,task_submission_id,
    evidence_type,competency_signal,source_context,metadata,created_at,updated_at
  ) values (
    v_learning_item_id,v_issue.child_id,v_issue.parent_user_id,v_issue.id,v_issue.task_submission_id,
    v_evidence_type,v_competency,'finalised_issue_outcome',
    jsonb_build_object('final_classification',p_final_classification,
      'micro_skill_key',v_issue.micro_skill_key,'linked_learning_item_id',v_learning_item_id,
      'evidence_kind','PARENT_CONFIRMED_CONTEXTUAL_NEED'),v_now,v_now
  );
  get diagnostics v_issue_evidence_count=row_count;
  perform public.apply_learning_item_review_state_from_evidence(
    v_learning_item_id,v_evidence_type,v_competency,v_now,'finalised_issue_outcome'
  );

  insert into public.learning_item_evidence(
    learning_item_id,child_id,parent_user_id,writing_issue_id,task_submission_id,
    evidence_type,competency_signal,source_context,metadata,created_at,updated_at
  ) select
    v_learning_item_id,v_issue.child_id,v_issue.parent_user_id,attempt.writing_issue_id,
    attempt.task_submission_id,
    public.learning_item_evidence_type_for_correction_attempt(
      coalesce((attempt.metadata->>'marked_fixed')::boolean,false),attempt.reflection,
      attempt.corrected_independently
    ),null,'child_correction_attempt',
    jsonb_build_object('corrected_independently',attempt.corrected_independently,
      'reflection',attempt.reflection,'marked_fixed',coalesce((attempt.metadata->>'marked_fixed')::boolean,false),
      'reflection_source',attempt.metadata->>'reflection_source','evidence_kind','REPAIR_ONLY')
      ||coalesce(attempt.metadata,'{}'::jsonb),attempt.created_at,v_now
  from public.writing_issue_correction_attempts attempt
  where attempt.writing_issue_id=v_issue.id and attempt.parent_user_id=p_parent_user_id
    and attempt.child_id=p_child_id;
  get diagnostics v_attempt_evidence_count=row_count;

  return jsonb_build_object('created_learning_item',v_created,'reused_learning_item',v_reused,
    'learning_item_id',v_learning_item_id,'issue_evidence_rows_created',v_issue_evidence_count,
    'child_correction_evidence_rows_created',v_attempt_evidence_count);
end $$;
revoke all on function public.finalise_contextual_learning_item(uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.finalise_contextual_learning_item(uuid,uuid,uuid,text) to service_role;

create or replace function public.finalise_parent_confirmed_contextual_learning_need(
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
  v_result:=public.finalise_contextual_learning_item(
    p_writing_issue_id,p_parent_user_id,p_child_id,p_final_classification
  );
  if v_result->>'learning_item_id' is null then
    raise exception 'contextual_learning_item_not_created';
  end if;
  v_adle:=public.reconcile_contextual_adle_learning_need(
    p_writing_issue_id,p_parent_user_id,p_child_id
  );
  return v_result||v_adle||jsonb_build_object('evidence_kind','PARENT_CONFIRMED_CONTEXTUAL_NEED',
    'retry_evidence_kind','REPAIR_ONLY');
end $$;
revoke all on function public.finalise_parent_confirmed_contextual_learning_need(uuid,uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.finalise_parent_confirmed_contextual_learning_need(uuid,uuid,uuid,text,text)
  to service_role;
