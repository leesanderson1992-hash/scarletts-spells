-- Production pgcrypto lives in extensions. Preserve frozen function behaviour and ACLs.
-- No extension relocation, search-path broadening, grant change, seed or activation.
begin;

create or replace function public.assert_context_rate_card() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin
  if new.fingerprint<>encode(extensions.digest(concat_ws('|',new.version,new.provider,new.model,new.endpoint,new.service_tier,
    new.currency,new.unit_tokens::text,new.input_rate::text,new.cached_input_rate::text,new.cache_write_rate::text,
    new.output_rate::text,new.calculation_version),'sha256'),'hex') then raise exception 'rate_card_fingerprint_invalid'; end if;
  return new;
end $$;

create or replace function public.record_parent_added_contextual_occurrence(
  p_occurrence_id text,p_parent_user_id uuid,p_field_hash text,
  p_observed_text text,p_intended_member text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_occurrence public.writing_occurrences%rowtype;
        v_snapshot public.writing_source_snapshots%rowtype;
        v_observed text; v_intended text; v_family text; v_members text[];
        v_issue_id uuid; v_decision_id uuid; v_case_id uuid; v_attempt_id uuid;
        v_detector_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_occurrence_id,0));
  select * into v_occurrence from public.writing_occurrences where id=p_occurrence_id;
  select * into v_snapshot from public.writing_source_snapshots where id=v_occurrence.snapshot_id;
  if v_snapshot.id is null or v_snapshot.parent_user_id<>p_parent_user_id or
     v_occurrence.provenance<>'learner_response' or v_occurrence.field_hash<>p_field_hash or
     v_occurrence.observed_text<>p_observed_text or
     exists(select 1 from public.writing_context_parent_added_cases where occurrence_id=p_occurrence_id) or
     exists(select 1 from public.writing_context_current_parent_decisions where occurrence_id=p_occurrence_id) or
     exists(select 1 from public.writing_issues where source_writing_occurrence_id=p_occurrence_id
       and metadata->>'source_kind'='contextual_advisory_v4') then
    raise exception 'parent_added_context_scope_invalid';
  end if;
  v_observed:=lower(replace(replace(v_occurrence.observed_text,'’',chr(39)),'ʼ',chr(39)));
  v_intended:=lower(replace(replace(btrim(p_intended_member),'’',chr(39)),'ʼ',chr(39)));
  if v_intended is null or length(v_intended)>60 or
     v_intended !~ '^[[:alpha:]][[:alpha:]''-]*$' or
     v_observed=v_intended then raise exception 'parent_added_context_replacement_invalid'; end if;
  case
    when v_observed=any(array['there','their','they''re']) then
      v_family:='THERE_THEIR_THEYRE'; v_members:=array['there','their','they''re'];
    when v_observed=any(array['to','too','two']) then
      v_family:='TO_TOO_TWO'; v_members:=array['to','too','two'];
    when v_observed=any(array['your','you''re']) then
      v_family:='YOUR_YOURE'; v_members:=array['your','you''re'];
    when v_observed=any(array['its','it''s']) then
      v_family:='ITS_ITS'; v_members:=array['its','it''s'];
    else v_family:=null;
  end case;
  if v_family is not null and not v_intended=any(v_members) then
    raise exception 'parent_added_context_cross_family'; end if;
  select id into v_attempt_id from public.writing_context_ai_attempts
    where occurrence_id=p_occurrence_id and snapshot_id=v_snapshot.id
      and mode='shadow' and created_at<=clock_timestamp()
    order by created_at desc,id desc limit 1;
  if v_attempt_id is not null then
    select detector_run_id into v_detector_id from public.writing_context_ai_attempts
      where id=v_attempt_id;
  else
    select id into v_detector_id from public.writing_context_detector_runs
      where snapshot_id=v_snapshot.id and run_status='COMPLETE'
      order by created_at desc,id desc limit 1;
  end if;
  insert into public.writing_issues(child_id,parent_user_id,task_submission_id,
    issue_status,observed_text,suggested_replacement,approved_replacement,
    context_text,source_field_key,micro_skill_key,parent_marked_at,metadata,
    source_writing_occurrence_id)
  values(v_snapshot.child_id,p_parent_user_id,v_snapshot.submission_id,
    'pending_parent_review',v_occurrence.observed_text,v_intended,v_intended,
    v_occurrence.observed_text,v_occurrence.field_path,'unknown',clock_timestamp(),
    jsonb_build_object('source_kind','contextual_advisory_v4',
      'feedback_origin','parent_added','evidence_kind','REPAIR_ONLY',
      'source_writing_occurrence_id',p_occurrence_id,
      'snapshot_field_path',v_occurrence.field_path),p_occurrence_id)
  returning id into v_issue_id;
  if v_family is not null then
    insert into public.writing_context_parent_decisions(occurrence_id,observation_id,
      parent_user_id,child_id,family_key,classification,intended_member,
      reason_code,writing_issue_id,ai_attempt_id,detector_run_id)
    values(p_occurrence_id,null,p_parent_user_id,v_snapshot.child_id,v_family,
      'INVALID',v_intended,'PARENT_ADDED_MISS',v_issue_id,v_attempt_id,v_detector_id)
    returning id into v_decision_id;
  end if;
  insert into public.writing_context_parent_added_cases(occurrence_id,snapshot_id,
    parent_user_id,child_id,intended_member,pair_fingerprint,governed_family_key,
    parent_decision_id,detector_run_id,ai_attempt_id,writing_issue_id)
  values(p_occurrence_id,v_snapshot.id,p_parent_user_id,v_snapshot.child_id,
    v_intended,encode(extensions.digest(least(v_observed,v_intended)||':'||greatest(v_observed,v_intended),'sha256'),'hex'),
    v_family,v_decision_id,
    v_detector_id,
    v_attempt_id,v_issue_id) returning id into v_case_id;
  if v_family is null then
    insert into public.writing_context_catalog_review_cases(parent_added_case_id) values(v_case_id);
  end if;
  return v_case_id;
end $$;

commit;
