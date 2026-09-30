-- Adult-writing API retention approval. Existing ZDR approvals remain historical facts.
-- No approval, rate card, credential, policy or activation is seeded here.
begin;

alter table public.writing_context_provider_approvals
  add column retention_mode text not null default 'ZDR';
alter table public.writing_context_provider_approvals
  add constraint context_provider_retention_mode_check
    check (retention_mode in ('ZDR','STANDARD_API'));
alter table public.writing_context_provider_approvals
  drop constraint writing_context_provider_approvals_zdr_verified_check;
alter table public.writing_context_provider_approvals
  add constraint context_provider_retention_evidence_check
    check ((retention_mode='ZDR' and zdr_verified) or
           (retention_mode='STANDARD_API' and not zdr_verified));

-- Reservation and final admission both call this function. A standard-retention
-- approval cannot masquerade as a ZDR approval, and old approvals cannot be
-- silently reused with the new runtime fingerprint.
create or replace function public.context_shadow_execution_ready(p_revision uuid,p_dispatch uuid default null) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.writing_context_shadow_policy%rowtype; a public.writing_context_provider_approvals%rowtype; begin
  select * into p from public.writing_context_shadow_policy where singleton and revision_id=p_revision;
  if p.singleton is null or exists(select 1 from public.writing_context_bootstrap_failures where provider_approval_id=p.provider_approval_id) then return false; end if;
  select * into a from public.writing_context_provider_approvals where id=p.provider_approval_id;
  if a.id is null or not a.data_sharing_disabled
    or (p.dispatch_scope='REAL_LEARNER' and (a.retention_mode<>'STANDARD_API' or a.zdr_verified))
    or a.expires_at<=clock_timestamp()
    or exists(select 1 from public.writing_context_approval_revocations where provider_approval_id=a.id)
    then return false; end if;
  if p.execution_policy_kind='MEASURED' then
    return p.thresholds ?& array['window_seconds','minimum_calls','error_rate','timeout_rate','malformed_rate','gate_failure_rate','p95_ms','max_queue_age_seconds'];
  end if;
  if p.execution_policy_kind='ADULT_RELEASE' then
    return p.dispatch_scope='REAL_LEARNER' and a.dispatch_scope='REAL_LEARNER'
      and a.environment='production' and p.approved_by is not null and p.evidence_ref is not null
      and p.rate_card_version is not null and p.learner_policy_version is not null
      and p.max_concurrent=1 and p.max_requests_per_day>0
      and p.max_usd_per_day>0 and p.max_usd_per_day<=0.50
      and p.max_usd_per_request>0 and p.max_usd_per_request<=p.max_usd_per_day
      and not exists(select 1 from public.writing_context_shadow_dispatches d
        where d.budget_environment='production' and (p_dispatch is null or d.id<>p_dispatch)
          and (d.state in ('reserved','sent') or d.sent_at is not null and not exists(
            select 1 from public.writing_context_ai_attempts x where x.dispatch_id=d.id)));
  end if;
  if p.dispatch_scope<>'DISPOSABLE_PROVIDER_PROOF' or a.dispatch_scope is distinct from p.dispatch_scope
    or a.environment is distinct from 'production'
    or p.bootstrap_expires_at<=clock_timestamp() or p.approved_by is null or p.evidence_ref is null
    or p.max_concurrent<>1 or p.max_requests_per_day is null or p.max_usd_per_day is null or p.max_usd_per_request is null
    or p.rate_card_version is null or p.learner_policy_version is null
    or exists(select 1 from public.writing_context_bootstrap_failures where provider_approval_id=a.id)
    then return false; end if;
  if exists(select 1 from public.writing_context_shadow_dispatches d where d.budget_environment='production'
      and (p_dispatch is null or d.id<>p_dispatch) and
      (d.state in ('reserved','sent') or d.sent_at is not null and not exists(
        select 1 from public.writing_context_ai_attempts x where x.dispatch_id=d.id))) then return false; end if;
  return true;
end $$;

-- Adult release policy must never exceed the owner-specified shared UTC cap.
alter table public.writing_context_shadow_policy
  add constraint context_adult_daily_spend_cap check (
    dispatch_scope<>'REAL_LEARNER' or
    (max_usd_per_day is not null and max_usd_per_day<=0.50 and max_concurrent=1
      and max_usd_per_request is not null and max_requests_per_day is not null
      and max_requests_per_day<=floor(max_usd_per_day/max_usd_per_request)));
alter table public.writing_context_shadow_policy
  drop constraint writing_context_shadow_policy_execution_policy_kind_check;
alter table public.writing_context_shadow_policy
  add constraint context_execution_policy_kind_check
    check(execution_policy_kind in ('MEASURED','DISPOSABLE_BOOTSTRAP','ADULT_RELEASE'));
alter table public.writing_context_shadow_policy
  drop constraint context_bootstrap_proof_only;
alter table public.writing_context_shadow_policy
  add constraint context_execution_scope_check check (
    (execution_policy_kind='MEASURED' and bootstrap_expires_at is null) or
    (execution_policy_kind='DISPOSABLE_BOOTSTRAP' and dispatch_scope='DISPOSABLE_PROVIDER_PROOF'
      and bootstrap_expires_at is not null) or
    (execution_policy_kind='ADULT_RELEASE' and dispatch_scope='REAL_LEARNER'
      and bootstrap_expires_at is null));

-- An adult submission is the user action authorising this scan. The database
-- records its lineage automatically; there is no separate guardian approval.
alter table public.writing_context_learner_authorisations
  drop constraint writing_context_learner_authorisations_authorisation_kind_check;
alter table public.writing_context_learner_authorisations
  add constraint context_authorisation_kind_check
    check(authorisation_kind in ('GUARDIAN','OPERATOR_PROOF','ADULT_SUBMISSION'));

create or replace function public.context_shadow_scope_authorised(p_snapshot uuid,p_authorisation uuid default null) returns boolean
language sql volatile security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.writing_source_snapshots s
    join public.writing_context_shadow_policy p on p.singleton and p.dispatch_scope=s.source_purpose
    join public.writing_context_provider_approvals a on a.id=p.provider_approval_id
      and a.environment='production' and a.dispatch_scope=p.dispatch_scope
    join public.writing_context_learner_authorisations l on l.child_id=s.child_id and l.parent_user_id=s.parent_user_id
      and l.policy_version=p.learner_policy_version and l.approved_at<=s.occurred_at and l.expires_at>clock_timestamp()
      and (p_authorisation is null or l.id=p_authorisation)
    where s.id=p_snapshot and p.dispatch_scope<>'DENY'
      and not exists(select 1 from public.writing_context_approval_revocations r where r.learner_authorisation_id=l.id)
      and ((s.source_purpose='REAL_LEARNER' and l.authorisation_kind='ADULT_SUBMISSION'
          and l.approved_by=s.parent_user_id and a.retention_mode='STANDARD_API'
          and not public.context_provider_proof_child(s.child_id))
        or (s.source_purpose='DISPOSABLE_PROVIDER_PROOF' and l.authorisation_kind='OPERATOR_PROOF'
          and l.approved_by=s.parent_user_id and exists(select 1 from public.writing_context_provider_proof_learners f
            where f.child_id=s.child_id and f.parent_user_id=s.parent_user_id and f.task_id=s.task_id
              and f.approved_at<=s.occurred_at and f.expires_at>clock_timestamp()))));
$$;

create or replace function public.stamp_context_source_purpose() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.writing_context_shadow_policy%rowtype; a public.writing_context_provider_approvals%rowtype; begin
  perform 1 from public.children where id=new.child_id for update;
  new.source_purpose:=case when public.context_provider_proof_child(new.child_id)
    then 'DISPOSABLE_PROVIDER_PROOF' else 'REAL_LEARNER' end;
  select * into p from public.writing_context_shadow_policy where singleton;
  if p.dispatch_scope<>new.source_purpose or p.dispatch_scope='DENY' then
    new.envelope:=new.envelope || jsonb_build_object('contextAiShadowCapture',false,'contextAiModeAtCapture','disabled');
    return new;
  end if;
  if new.source_purpose='REAL_LEARNER' and new.envelope->>'contextAiShadowCapture'='true' then
    select * into a from public.writing_context_provider_approvals where id=p.provider_approval_id;
    if a.id is null or a.retention_mode<>'STANDARD_API' or a.zdr_verified or not a.data_sharing_disabled
      or a.dispatch_scope<>'REAL_LEARNER' or a.expires_at<=clock_timestamp()
      or new.occurred_at<a.approved_at
      or exists(select 1 from public.writing_context_approval_revocations r where r.provider_approval_id=a.id)
      or exists(select 1 from public.writing_context_approval_revocations r
        join public.writing_context_learner_authorisations l on l.id=r.learner_authorisation_id
        where l.child_id=new.child_id and l.parent_user_id=new.parent_user_id
          and l.policy_version=p.learner_policy_version)
      then
      new.envelope:=new.envelope || jsonb_build_object('contextAiShadowCapture',false,'contextAiModeAtCapture','disabled');
      return new;
    end if;
    if not exists(select 1 from public.writing_context_learner_authorisations l
      where l.child_id=new.child_id and l.parent_user_id=new.parent_user_id
        and l.policy_version=p.learner_policy_version and l.authorisation_kind='ADULT_SUBMISSION'
        and l.expires_at>clock_timestamp()) then
      insert into public.writing_context_learner_authorisations(child_id,parent_user_id,policy_version,
        evidence_ref,approved_by,approved_at,expires_at,authorisation_kind)
      values(new.child_id,new.parent_user_id,p.learner_policy_version,
        'adult-writing/submission-v1',new.parent_user_id,new.occurred_at,a.expires_at,'ADULT_SUBMISSION');
    end if;
  end if;
  return new;
end $$;
revoke all on function public.context_shadow_scope_authorised(uuid,uuid),
  public.stamp_context_source_purpose() from public,anon,authenticated;

-- The passage scanner stores only validated, occurrence-linked suggestions.
alter table public.writing_context_detector_runs
  drop constraint writing_context_detector_runs_eligible_scope_check;
alter table public.writing_context_detector_runs
  add constraint context_detector_eligible_scope_check
    check(eligible_scope in ('INDEXED_LEARNER_RESPONSE_FOUR_FAMILIES','INDEXED_ADULT_PASSAGE_WINDOWS'));
alter table public.writing_context_detector_members
  drop constraint writing_context_detector_members_family_key_check;
alter table public.writing_context_detector_members
  add constraint context_detector_member_family_check
    check(family_key in ('THERE_THEIR_THEYRE','TO_TOO_TWO','YOUR_YOURE','ITS_ITS','PASSAGE_SCAN'));
alter table public.writing_context_ai_attempts
  drop constraint writing_context_ai_attempts_family_key_check;
alter table public.writing_context_ai_attempts
  add constraint context_attempt_family_check
    check(family_key in ('THERE_THEIR_THEYRE','TO_TOO_TWO','YOUR_YOURE','ITS_ITS','PASSAGE_SCAN'));
alter table public.writing_context_ai_attempts
  drop constraint writing_context_ai_attempts_result_status_check;
alter table public.writing_context_ai_attempts
  add constraint context_attempt_status_check
    check(result_status in ('VALID','INVALID','UNCERTAIN','NOT_ASSESSED','SCANNED'));

create table public.writing_context_passage_findings (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.writing_context_ai_attempts(id) on delete cascade,
  occurrence_id text not null references public.writing_occurrences(id) on delete cascade,
  snapshot_id uuid not null references public.writing_source_snapshots(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  field_hash text not null check(field_hash ~ '^[a-f0-9]{64}$'),
  start_utf16 integer not null check(start_utf16>=0),
  end_utf16 integer not null check(end_utf16>start_utf16),
  observed_text text not null,
  correction text not null check(length(correction) between 1 and 60),
  created_at timestamptz not null default clock_timestamp(),
  unique(attempt_id,occurrence_id),
  unique(occurrence_id)
);
create function public.assert_context_passage_finding() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.writing_context_ai_attempts a
    join public.writing_occurrences o on o.id=new.occurrence_id
    where a.id=new.attempt_id and a.snapshot_id=new.snapshot_id
      and a.parent_user_id=new.parent_user_id and a.child_id=new.child_id
      and a.family_key='PASSAGE_SCAN' and a.result_status='SCANNED'
      and o.snapshot_id=new.snapshot_id and o.provenance='learner_response'
      and o.field_hash=new.field_hash and o.start_utf16=new.start_utf16
      and o.end_utf16=new.end_utf16 and o.observed_text=new.observed_text)
    then raise exception 'context_passage_finding_scope_invalid'; end if;
  return new;
end $$;
create trigger context_passage_finding_scope before insert on public.writing_context_passage_findings
  for each row execute function public.assert_context_passage_finding();
create trigger context_passage_finding_immutable before update on public.writing_context_passage_findings
  for each row execute function public.reject_writing_fact_update();
alter table public.writing_context_passage_findings enable row level security;
revoke all on public.writing_context_passage_findings from public,anon,authenticated;
grant select,insert on public.writing_context_passage_findings to service_role;
revoke all on function public.assert_context_passage_finding() from public,anon,authenticated;

create table public.writing_context_passage_review_events (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.writing_context_passage_findings(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check(action in ('DISMISS','RESTORE','EDIT')),
  correction text check(correction is null or length(correction) between 1 and 60),
  created_at timestamptz not null default clock_timestamp(),
  check((action='EDIT')=(correction is not null))
);
create function public.assert_context_passage_review_event() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_occurrence text; begin
  select occurrence_id into v_occurrence from public.writing_context_passage_findings where id=new.finding_id;
  if v_occurrence is null then raise exception 'context_passage_finding_missing'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_occurrence,0));
  if not exists(select 1 from public.writing_context_passage_findings f
    join public.writing_source_snapshots s on s.id=f.snapshot_id
    join public.task_submissions t on t.id=s.submission_id
    where f.id=new.finding_id and f.parent_user_id=new.parent_user_id
      and s.parent_user_id=new.parent_user_id and t.parent_user_id=new.parent_user_id
      and t.parent_review_status='pending'
      and not exists(select 1 from public.writing_issues i where i.source_writing_occurrence_id=f.occurrence_id))
    then raise exception 'context_passage_review_not_editable'; end if;
  if new.correction is not null and (new.correction !~ '^[[:alpha:]][[:alpha:]''-]*$'
      or exists(select 1 from public.writing_context_passage_findings f
        where f.id=new.finding_id and lower(f.observed_text)=lower(new.correction)))
    then raise exception 'context_passage_correction_invalid'; end if;
  return new;
end $$;
create trigger context_passage_review_event_scope before insert on public.writing_context_passage_review_events
  for each row execute function public.assert_context_passage_review_event();
create trigger context_passage_review_event_immutable before update on public.writing_context_passage_review_events
  for each row execute function public.reject_writing_fact_update();
alter table public.writing_context_passage_review_events enable row level security;
revoke all on public.writing_context_passage_review_events from public,anon,authenticated;
grant select,insert on public.writing_context_passage_review_events to service_role;
revoke all on function public.assert_context_passage_review_event() from public,anon,authenticated;

-- Serialize review edits/dismissals with Send back for the exact occurrence.
-- A stale browser state cannot turn a newly dismissed finding into a repair.
-- Keep the historical parent-added route, but never attach a passage-wide
-- SCANNED attempt to a four-family linguistic decision. The finding itself
-- is the immutable system detection evidence.
create or replace function public.record_parent_added_contextual_occurrence(
  p_occurrence_id text,p_parent_user_id uuid,p_field_hash text,
  p_observed_text text,p_intended_member text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_occurrence public.writing_occurrences%rowtype;
        v_snapshot public.writing_source_snapshots%rowtype;
        v_observed text; v_intended text; v_family text; v_members text[];
        v_issue_id uuid; v_decision_id uuid; v_case_id uuid; v_attempt_id uuid;
        v_detector_id uuid; v_luna boolean;
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
  select exists(select 1 from public.writing_context_passage_findings
    where occurrence_id=p_occurrence_id) into v_luna;
  if v_family is not null and not v_intended=any(v_members) then
    if v_luna then v_family:=null;
    else raise exception 'parent_added_context_cross_family'; end if;
  end if;
  select id into v_attempt_id from public.writing_context_ai_attempts
    where occurrence_id=p_occurrence_id and snapshot_id=v_snapshot.id
      and mode='shadow' and family_key=v_family
      and result_status in ('VALID','INVALID','UNCERTAIN')
      and created_at<=clock_timestamp()
    order by created_at desc,id desc limit 1;
  if v_attempt_id is not null then
    select detector_run_id into v_detector_id from public.writing_context_ai_attempts
      where id=v_attempt_id;
  else
    select id into v_detector_id from public.writing_context_detector_runs
      where snapshot_id=v_snapshot.id and run_status='COMPLETE'
        and eligible_scope='INDEXED_LEARNER_RESPONSE_FOUR_FAMILIES'
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
      'feedback_origin','parent_added','detection_origin',
      case when v_luna then 'LUNA_PASSAGE' else 'PARENT_IDENTIFIED' end,
      'evidence_kind','REPAIR_ONLY',
      'source_writing_occurrence_id',p_occurrence_id,
      'snapshot_field_path',v_occurrence.field_path),p_occurrence_id)
  returning id into v_issue_id;
  if v_family is not null then
    insert into public.writing_context_parent_decisions(occurrence_id,observation_id,
      parent_user_id,child_id,family_key,classification,intended_member,
      reason_code,writing_issue_id,ai_attempt_id,detector_run_id)
    values(p_occurrence_id,null,p_parent_user_id,v_snapshot.child_id,v_family,
      'INVALID',v_intended,case when v_luna then 'PARENT_CONFIRMED_LUNA_PASSAGE'
        else 'PARENT_ADDED_MISS' end,v_issue_id,v_attempt_id,v_detector_id)
    returning id into v_decision_id;
  end if;
  insert into public.writing_context_parent_added_cases(occurrence_id,snapshot_id,
    parent_user_id,child_id,intended_member,pair_fingerprint,governed_family_key,
    parent_decision_id,detector_run_id,ai_attempt_id,writing_issue_id)
  values(p_occurrence_id,v_snapshot.id,p_parent_user_id,v_snapshot.child_id,
    v_intended,encode(extensions.digest(least(v_observed,v_intended)||':'||greatest(v_observed,v_intended),'sha256'),'hex'),
    v_family,v_decision_id,v_detector_id,v_attempt_id,v_issue_id)
  returning id into v_case_id;
  if v_family is null then
    insert into public.writing_context_catalog_review_cases(parent_added_case_id) values(v_case_id);
  end if;
  return v_case_id;
end $$;

create function public.commit_reviewed_context_passage_finding(
  p_finding_id uuid,p_parent_user_id uuid,p_expected_correction text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare f public.writing_context_passage_findings%rowtype; v_action text;
  v_correction text; v_existing public.writing_context_parent_added_cases%rowtype; begin
  select * into f from public.writing_context_passage_findings where id=p_finding_id;
  if f.id is null or f.parent_user_id<>p_parent_user_id then
    raise exception 'context_passage_finding_owner_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended(f.occurrence_id,0));
  if not exists(select 1 from public.writing_source_snapshots s
    join public.task_submissions t on t.id=s.submission_id
    where s.id=f.snapshot_id and s.parent_user_id=p_parent_user_id
      and t.parent_user_id=p_parent_user_id and t.parent_review_status='pending')
    then raise exception 'context_passage_review_closed'; end if;
  select action into v_action
    from public.writing_context_passage_review_events
    where finding_id=f.id order by created_at desc,id desc limit 1;
  if v_action='DISMISS' then raise exception 'context_passage_finding_dismissed'; end if;
  select correction into v_correction from public.writing_context_passage_review_events
    where finding_id=f.id and action='EDIT' order by created_at desc,id desc limit 1;
  v_correction:=coalesce(v_correction,f.correction);
  if v_correction is distinct from p_expected_correction then
    raise exception 'context_passage_review_stale'; end if;
  select * into v_existing from public.writing_context_parent_added_cases
    where occurrence_id=f.occurrence_id;
  if v_existing.id is not null then
    if v_existing.parent_user_id<>p_parent_user_id or
      v_existing.intended_member<>lower(replace(replace(v_correction,'’',chr(39)),'ʼ',chr(39)))
      then raise exception 'context_passage_existing_repair_mismatch'; end if;
    return v_existing.id;
  end if;
  return public.record_parent_added_contextual_occurrence(f.occurrence_id,p_parent_user_id,
    f.field_hash,f.observed_text,v_correction);
end $$;
revoke all on function public.commit_reviewed_context_passage_finding(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.commit_reviewed_context_passage_finding(uuid,uuid,text) to service_role;

create function public.stamp_context_issue_span() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.writing_occurrences%rowtype; begin
  if new.source_writing_occurrence_id is null or
     new.metadata->>'source_kind'<>'contextual_advisory_v4' then return new; end if;
  select * into o from public.writing_occurrences where id=new.source_writing_occurrence_id;
  if o.id is null then raise exception 'context_issue_occurrence_missing'; end if;
  new.source_field_key:=o.field_path;
  new.position_start:=o.start_utf16;
  new.position_end:=o.end_utf16;
  return new;
end $$;
create trigger zz_context_issue_span before insert on public.writing_issues
  for each row execute function public.stamp_context_issue_span();
revoke all on function public.stamp_context_issue_span() from public,anon,authenticated;

-- Explicit user retries are new jobs. The original dispatch and consumption
-- remain immutable; a successful window is never sampled a second time.
alter table public.writing_context_shadow_jobs
  drop constraint writing_context_shadow_jobs_snapshot_id_key;
alter table public.writing_context_shadow_jobs
  add constraint context_shadow_job_run_unique unique(snapshot_id,run_key);

create or replace function public.enqueue_writing_context_shadow(p_submission_id uuid) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; begin
  insert into public.writing_context_shadow_jobs(snapshot_id,run_key)
  select s.id,j.id::text from public.writing_source_snapshots s
  join public.task_submission_processing_jobs j on j.submission_id=s.submission_id
  join public.task_submissions t on t.id=s.submission_id
  join public.writing_context_advisory_control c on c.singleton
  where s.submission_id=p_submission_id and c.enabled=false and c.ai_mode='shadow'
    and s.occurred_at>=c.updated_at and t.parent_review_status='pending'
    and s.envelope->>'contextAiModeAtCapture'='shadow'
    and s.envelope->>'contextAiShadowCapture'='true'
    and s.envelope->>'contextAdvisoryCapture'='false'
    and public.context_shadow_scope_authorised(s.id)
    and s.parent_user_id=t.parent_user_id and s.child_id=t.child_id
  on conflict(snapshot_id,run_key) do nothing returning id into v_id;
  return v_id;
end $$;

create function public.retry_writing_context_passage(p_submission_id uuid,p_parent_user_id uuid) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.writing_source_snapshots%rowtype; j public.writing_context_shadow_jobs%rowtype;
  v_id uuid; begin
  perform 1 from public.writing_context_advisory_control where singleton for update;
  select * into s from public.writing_source_snapshots where submission_id=p_submission_id
    and parent_user_id=p_parent_user_id for update;
  if s.id is null or s.source_purpose<>'REAL_LEARNER'
    or not exists(select 1 from public.writing_context_advisory_control c
      join public.writing_context_shadow_policy p on p.singleton
      where c.singleton and not c.enabled and c.ai_mode='shadow'
        and p.execution_policy_kind='ADULT_RELEASE' and p.dispatch_scope='REAL_LEARNER'
        and s.occurred_at>=c.updated_at)
    or not exists(select 1 from public.task_submissions t where t.id=p_submission_id
      and t.parent_user_id=p_parent_user_id and t.child_id=s.child_id and t.parent_review_status='pending')
    then return null; end if;
  select * into j from public.writing_context_shadow_jobs where snapshot_id=s.id
    order by created_at desc,id desc limit 1 for update;
  if j.id is null or j.status<>'failed' or j.error_code<>'AI_PROVIDER_UNAVAILABLE'
    or exists(select 1 from public.writing_context_shadow_jobs x where x.snapshot_id=s.id
      and x.status in ('pending','processing'))
    or exists(select 1 from public.writing_context_shadow_dispatches d
      join public.writing_context_shadow_jobs x on x.id=d.job_id
      where x.snapshot_id=s.id and d.sent_at is not null and not exists(
        select 1 from public.writing_context_ai_attempts a where a.dispatch_id=d.id
          and a.response_received_at is not null and
          (a.result_status='SCANNED' or a.reason_code ~ '^AI_PROVIDER_HTTP_(429|5[0-9][0-9])$')))
    then return null; end if;
  insert into public.writing_context_shadow_jobs(snapshot_id,run_key)
    values(s.id,gen_random_uuid()::text) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.retry_writing_context_passage(uuid,uuid) from public,anon,authenticated;
grant execute on function public.retry_writing_context_passage(uuid,uuid) to service_role;

create or replace function public.record_writing_context_detector_run(
  p_snapshot_id uuid,p_parent_user_id uuid,p_child_id uuid,p_run_key text,
  p_detector_version text,p_registry_version text,p_occurrence_ids text[]
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_run public.writing_context_detector_runs%rowtype;
        v_id text; v_observed text; v_family text; v_passage boolean;
begin
  v_passage:=p_detector_version='CONTEXT_PASSAGE_WINDOW_V1' and p_registry_version='CONTEXT_PASSAGE_SCAN_V1';
  if nullif(btrim(p_run_key),'') is null or nullif(btrim(p_detector_version),'') is null or
     nullif(btrim(p_registry_version),'') is null or p_occurrence_ids is null or
     cardinality(p_occurrence_ids)>10000 or
     (select count(distinct x) from unnest(p_occurrence_ids) x)<>cardinality(p_occurrence_ids) then
    raise exception 'context_detector_run_invalid';
  end if;
  if not exists(select 1 from public.writing_source_snapshots s where s.id=p_snapshot_id
    and s.parent_user_id=p_parent_user_id and s.child_id=p_child_id) then
    raise exception 'context_detector_snapshot_scope_invalid';
  end if;
  select * into v_run from public.writing_context_detector_runs
    where snapshot_id=p_snapshot_id and run_key=p_run_key and detector_version=p_detector_version;
  if v_run.id is not null then
    if v_run.parent_user_id<>p_parent_user_id or v_run.child_id<>p_child_id or
       v_run.registry_version<>p_registry_version or
       v_run.surfaced_count<>cardinality(p_occurrence_ids) or
       exists(select 1 from unnest(p_occurrence_ids) x where not exists(
         select 1 from public.writing_context_detector_members m
         where m.run_id=v_run.id and m.occurrence_id=x)) then
      raise exception 'context_detector_run_collision';
    end if;
    return v_run.id;
  end if;
  insert into public.writing_context_detector_runs(snapshot_id,parent_user_id,child_id,
    run_key,detector_version,registry_version,eligible_scope,run_status,surfaced_count)
  values(p_snapshot_id,p_parent_user_id,p_child_id,p_run_key,p_detector_version,
    p_registry_version,case when v_passage then 'INDEXED_ADULT_PASSAGE_WINDOWS'
      else 'INDEXED_LEARNER_RESPONSE_FOUR_FAMILIES' end,'COMPLETE',
    cardinality(p_occurrence_ids)) returning * into v_run;
  foreach v_id in array p_occurrence_ids loop
    select lower(replace(replace(o.observed_text,'’',chr(39)),'ʼ',chr(39)))
      into v_observed from public.writing_occurrences o
      where o.id=v_id and o.snapshot_id=p_snapshot_id and o.provenance='learner_response';
    if v_passage and v_observed is not null then v_family:='PASSAGE_SCAN';
    else
      v_family:=case
        when v_observed=any(array['there','their','they''re']) then 'THERE_THEIR_THEYRE'
        when v_observed=any(array['to','too','two']) then 'TO_TOO_TWO'
        when v_observed=any(array['your','you''re']) then 'YOUR_YOURE'
        when v_observed=any(array['its','it''s']) then 'ITS_ITS'
        else null end;
    end if;
    if v_family is null then raise exception 'context_detector_member_out_of_scope'; end if;
    insert into public.writing_context_detector_members(run_id,occurrence_id,family_key)
      values(v_run.id,v_id,v_family);
  end loop;
  return v_run.id;
end $$;

create or replace function public.reserve_writing_context_shadow(p_job_id uuid,p_claim_token uuid,p_occurrence_id text,
  p_detector_run_id uuid,p_window_fingerprint text,p_request_bytes integer,p_environment text,p_project_ref text,
  p_deployment_sha text,p_config_fingerprint text,p_runtime_fingerprint text,p_rate_card_fingerprint text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare ctl public.writing_context_advisory_control%rowtype; p public.writing_context_shadow_policy%rowtype;
  a public.writing_context_provider_approvals%rowtype; s public.writing_source_snapshots%rowtype;
  j public.writing_context_shadow_jobs%rowtype; l uuid; v_id uuid; v_count bigint; v_cost numeric; v_day date; begin
  select * into ctl from public.writing_context_advisory_control where singleton for update;
  if ctl.singleton is null or ctl.enabled or ctl.ai_mode<>'shadow' then return jsonb_build_object('reason','AI_CONTROL_DISABLED'); end if;
  v_day:=(clock_timestamp() at time zone 'UTC')::date;
  select * into p from public.writing_context_shadow_policy where singleton;
  if p.provider_approval_id is null or p.rate_card_version is null or p.learner_policy_version is null or p.revision_id is null
    or p.max_requests_per_day is null or p.max_usd_per_day is null or p.max_usd_per_request is null
    or p.evidence_ref is null or p.approved_by is null
    or (p.execution_policy_kind='MEASURED' and not (p.thresholds ?& array['window_seconds','minimum_calls','error_rate','timeout_rate','malformed_rate','gate_failure_rate','p95_ms','max_queue_age_seconds']))
    then return jsonb_build_object('reason','AI_POLICY_UNAPPROVED'); end if;
  if not public.context_shadow_execution_ready(p.revision_id) then return jsonb_build_object('reason','AI_EXECUTION_POLICY_DENIED'); end if;
  select * into a from public.writing_context_provider_approvals where id=p.provider_approval_id;
  if a.id is null or a.approved_at>clock_timestamp() or a.expires_at<=clock_timestamp()
    or exists(select 1 from public.writing_context_approval_revocations where provider_approval_id=a.id)
    or a.environment<>p_environment or a.project_ref<>p_project_ref or a.deployment_sha<>p_deployment_sha
    or a.config_fingerprint<>p_config_fingerprint or a.runtime_fingerprint<>p_runtime_fingerprint
    then return jsonb_build_object('reason','AI_PROVIDER_APPROVAL_UNAVAILABLE'); end if;
  if not exists(select 1 from public.writing_context_ai_rate_cards where version=p.rate_card_version
    and fingerprint=p_rate_card_fingerprint and effective_at<=clock_timestamp())
    then return jsonb_build_object('reason','AI_RATE_CARD_MISMATCH'); end if;
  select * into j from public.writing_context_shadow_jobs where id=p_job_id and claim_token=p_claim_token
    and status='processing' and claimed_at>clock_timestamp()-interval '60 seconds' for update;
  select * into s from public.writing_source_snapshots where id=j.snapshot_id;
  if j.id is null or s.id is null or s.occurred_at<ctl.updated_at or s.occurred_at<a.approved_at
    or s.envelope->>'contextAiModeAtCapture' is distinct from 'shadow'
    or s.envelope->>'contextAiShadowCapture' is distinct from 'true'
    or s.envelope->>'contextAdvisoryCapture' is distinct from 'false'
    or not exists(select 1 from public.task_submissions t join public.course_tasks k on k.id=t.task_id
      where t.id=s.submission_id and t.parent_user_id=s.parent_user_id and t.child_id=s.child_id
      and t.parent_review_status='pending' and k.task_type in ('lesson','test') and k.parent_user_id=s.parent_user_id
      and not exists(select 1 from public.task_submissions newer where newer.task_id=t.task_id
        and newer.child_id=t.child_id and newer.submitted_at>t.submitted_at))
    then return jsonb_build_object('reason','AI_SOURCE_INELIGIBLE'); end if;
  select x.id into l from public.writing_context_learner_authorisations x
    join public.children ch on ch.id=x.child_id and ch.parent_user_id=x.parent_user_id
    where x.child_id=s.child_id and x.parent_user_id=s.parent_user_id and x.policy_version=p.learner_policy_version
    and x.approved_at<=s.occurred_at and x.expires_at>clock_timestamp()
    and not exists(select 1 from public.writing_context_approval_revocations r where r.learner_authorisation_id=x.id)
    order by x.approved_at desc limit 1;
  if not public.context_shadow_scope_authorised(s.id,l) then return jsonb_build_object('reason','AI_PROOF_SCOPE_DENIED'); end if;
  if l is null then return jsonb_build_object('reason','AI_LEARNER_NOT_AUTHORISED'); end if;
  if not exists(select 1 from public.writing_occurrences o join public.writing_context_detector_members m on m.occurrence_id=o.id
    join public.writing_context_detector_runs r on r.id=m.run_id where o.id=p_occurrence_id and o.snapshot_id=s.id
    and o.provenance='learner_response' and m.run_id=p_detector_run_id and r.snapshot_id=s.id and r.run_key=j.run_key
    and (r.detector_version='CONTEXT_ROUTING_FOUR_FAMILY_V1' and r.registry_version='CONTEXT_FOUR_FAMILY_V1' or r.detector_version='CONTEXT_PASSAGE_WINDOW_V1' and r.registry_version='CONTEXT_PASSAGE_SCAN_V1')
    and r.run_status='COMPLETE') then return jsonb_build_object('reason','AI_OCCURRENCE_INELIGIBLE'); end if;
  if exists(select 1 from public.writing_context_shadow_dispatches where job_id=j.id and occurrence_id=p_occurrence_id)
    then return jsonb_build_object('reason','AI_ALREADY_RESERVED'); end if;
  if exists(select 1 from public.writing_context_ai_rate_cards c where c.version=p.rate_card_version
    and (8000*greatest(c.input_rate,c.cached_input_rate,c.cache_write_rate)+2048*c.output_rate)/c.unit_tokens>p.max_usd_per_request)
    then return jsonb_build_object('reason','AI_REQUEST_COST_CAP_TOO_SMALL'); end if;
  select coalesce(sum(requests_reserved),0),coalesce(sum(reserved_usd),0) into v_count,v_cost
    from public.writing_context_shadow_consumption where environment=a.environment and budget_day=v_day;
  if v_count>=p.max_requests_per_day or v_cost+p.max_usd_per_request>p.max_usd_per_day then
    perform public.disable_writing_context_advisory(p.approved_by);
    return jsonb_build_object('reason','AI_GLOBAL_BUDGET_STOP'); end if;
  if (select count(*) from public.writing_context_shadow_dispatches where job_id=j.id)>=32
    then return jsonb_build_object('reason','AI_SUBMISSION_LIMIT'); end if;
  if exists(select 1 from public.writing_context_shadow_dispatches where state in ('reserved','sent')
    and reserved_at>clock_timestamp()-interval '60 seconds') then return jsonb_build_object('reason','AI_GLOBAL_CONCURRENCY_LIMIT'); end if;
  insert into public.writing_context_shadow_consumption(environment,budget_day,policy_revision_id,requests_reserved,reserved_usd,sequence)
    values(a.environment,v_day,p.revision_id,1,p.max_usd_per_request,1)
    on conflict(environment,budget_day,policy_revision_id) do update
    set requests_reserved=writing_context_shadow_consumption.requests_reserved+1,
      reserved_usd=writing_context_shadow_consumption.reserved_usd+excluded.reserved_usd,
      sequence=writing_context_shadow_consumption.sequence+1;
  insert into public.writing_context_shadow_dispatches(job_id,occurrence_id,detector_run_id,provider_approval_id,
    learner_authorisation_id,rate_card_version,window_fingerprint,request_bytes,reserved_cost_usd,policy_revision_id,budget_environment,budget_day)
    values(j.id,p_occurrence_id,p_detector_run_id,a.id,l,p.rate_card_version,p_window_fingerprint,p_request_bytes,p.max_usd_per_request,p.revision_id,a.environment,v_day)
    returning id into v_id;
  return jsonb_build_object('id',v_id,'reason',null);
end $$;

create or replace function public.monitor_writing_context_shadow() returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.writing_context_shadow_policy%rowtype; o jsonb; t jsonb; n numeric; v_now timestamptz:=clock_timestamp(); begin
  perform 1 from public.writing_context_advisory_control where singleton for update;
  select * into p from public.writing_context_shadow_policy where singleton;
  if p.execution_policy_kind='MEASURED' and not public.context_shadow_execution_ready(p.revision_id) then return false; end if;
  if p.execution_policy_kind in ('DISPOSABLE_BOOTSTRAP','ADULT_RELEASE') and not public.context_shadow_execution_ready(p.revision_id) then
    perform public.stop_writing_context_shadow('AI_OPERATIONAL_THRESHOLD_STOP'); return false; end if;
  o:=public.writing_context_shadow_operations_for_scope(v_now-make_interval(secs=>case when p.execution_policy_kind in ('DISPOSABLE_BOOTSTRAP','ADULT_RELEASE') then 2678400 else (p.thresholds->>'window_seconds')::integer end),v_now,p.dispatch_scope);
  if (o->>'unrecorded_sends')::integer>0 then
    perform public.stop_writing_context_shadow('AI_MISSING_PROVENANCE_STOP'); return false; end if;
  if exists(select 1 from public.writing_context_ai_attempts a join public.writing_context_shadow_dispatches d on d.id=a.dispatch_id
    where a.record_version=1 and d.provider_approval_id=p.provider_approval_id and (a.calculated_cost_usd>d.reserved_cost_usd or a.returned_model is not null and a.returned_model<>a.model
      or a.service_tier is not null and a.service_tier<>'default' or a.cache_write_tokens>0 or a.cached_input_tokens>0)) then
    perform public.stop_writing_context_shadow('AI_CONFIGURATION_STOP'); return false; end if;
  if p.execution_policy_kind in ('DISPOSABLE_BOOTSTRAP','ADULT_RELEASE') then return true; end if;
  t:=o->'measurements'; n:=(t->>'provider_calls')::numeric;
  if (o->>'oldest_queue_seconds')::numeric>(p.thresholds->>'max_queue_age_seconds')::numeric or
    (n>=(p.thresholds->>'minimum_calls')::numeric and (
      (t->>'errors')::numeric/nullif(n,0)>(p.thresholds->>'error_rate')::numeric or
      (t->>'timeouts')::numeric/nullif(n,0)>(p.thresholds->>'timeout_rate')::numeric or
      (t->>'contract_failures')::numeric/nullif(n,0)>(p.thresholds->>'malformed_rate')::numeric or
      (t->>'gate_failures')::numeric/nullif(n,0)>(p.thresholds->>'gate_failure_rate')::numeric or
      (t->>'p95_ms')::numeric>(p.thresholds->>'p95_ms')::numeric)) then
    perform public.stop_writing_context_shadow('AI_OPERATIONAL_THRESHOLD_STOP'); return false; end if;
  return true;
end $$;

create or replace function public.stop_failed_context_bootstrap_attempt() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$ begin
  if new.result_status='NOT_ASSESSED' and exists(select 1 from public.writing_context_shadow_policy p
    where p.singleton and p.execution_policy_kind='DISPOSABLE_BOOTSTRAP'
      and public.context_shadow_source_in_scope(new.snapshot_id,p.dispatch_scope)) then
    perform public.stop_writing_context_shadow('AI_OPERATIONAL_THRESHOLD_STOP');
  end if;
  return new;
end $$;

update public.writing_context_advisory_control set enabled=false,ai_mode='disabled';
commit;
