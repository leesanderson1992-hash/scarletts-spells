-- One first-submission ledger, with independent reward/proficiency delivery.
-- Cohort controls are service-managed and default off. No historical awards.
begin;
create table public.authentic_use_controls (
  child_id uuid primary key references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null default 'off' check(mode in ('off','shadow','enabled')),
  gold_enabled boolean not null default false,
  proficiency_enabled boolean not null default false,
  proficiency_checked_at timestamptz,
  activation_cutoff timestamptz not null default now()
);
create table public.authentic_use_submission_chains (
  id uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  task_id uuid not null references public.course_tasks(id) on delete cascade,
  first_submission_id uuid not null unique references public.task_submissions(id) on delete cascade,
  unique(parent_user_id,child_id,task_id)
);
alter table public.task_submissions add column authentic_use_chain_id uuid references public.authentic_use_submission_chains(id) on delete cascade;
create function public.attach_authentic_use_chain() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare chain_id uuid;
begin
  -- Keep the feature entirely inert for children outside the canary. Historical
  -- rows are attached explicitly, one enabled child at a time, by the service.
  if not exists(select 1 from authentic_use_controls where child_id=new.child_id and parent_user_id=new.parent_user_id and mode<>'off') then return new; end if;
  if not exists(select 1 from children where id=new.child_id and parent_user_id=new.parent_user_id) then raise exception 'AUTHENTIC_USE_PARENT_OWNERSHIP'; end if;
  perform pg_advisory_xact_lock(hashtextextended('authentic-use-parent:'||new.parent_user_id::text,0));
  insert into authentic_use_submission_chains(parent_user_id,child_id,task_id,first_submission_id)
    values(new.parent_user_id,new.child_id,new.task_id,new.id) on conflict(parent_user_id,child_id,task_id) do nothing;
  select id into chain_id from authentic_use_submission_chains where parent_user_id=new.parent_user_id and child_id=new.child_id and task_id=new.task_id;
  update task_submissions set authentic_use_chain_id=chain_id where id=new.id;
  return new;
end $$;
create trigger attach_authentic_use_chain after insert on public.task_submissions for each row execute function public.attach_authentic_use_chain();

create function public.backfill_authentic_use_chains_for_child(p_child_id uuid) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare ctrl authentic_use_controls%rowtype; attached_count integer;
begin
  select * into ctrl from authentic_use_controls where child_id=p_child_id for update;
  if ctrl.child_id is null or ctrl.mode='off' then raise exception 'AUTHENTIC_USE_CONTROL_DISABLED'; end if;
  if not exists(select 1 from children where id=p_child_id and parent_user_id=ctrl.parent_user_id) then raise exception 'AUTHENTIC_USE_PARENT_OWNERSHIP'; end if;
  perform pg_advisory_xact_lock(hashtextextended('authentic-use-parent:'||ctrl.parent_user_id::text,0));
  insert into authentic_use_submission_chains(parent_user_id,child_id,task_id,first_submission_id)
    select distinct on(s.parent_user_id,s.child_id,s.task_id) s.parent_user_id,s.child_id,s.task_id,s.id
    from task_submissions s
    where s.child_id=p_child_id and s.parent_user_id=ctrl.parent_user_id
    order by s.parent_user_id,s.child_id,s.task_id,s.submitted_at,s.created_at,s.id
    on conflict(parent_user_id,child_id,task_id) do nothing;
  update task_submissions s set authentic_use_chain_id=c.id
    from authentic_use_submission_chains c
    where s.child_id=p_child_id and s.parent_user_id=ctrl.parent_user_id
      and c.parent_user_id=s.parent_user_id and c.child_id=s.child_id and c.task_id=s.task_id
      and s.authentic_use_chain_id is null;
  get diagnostics attached_count=row_count;
  return attached_count;
end $$;

create table public.authentic_use_review_preparations (
  id uuid primary key default gen_random_uuid(), submission_id uuid not null references public.task_submissions(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade, child_id uuid not null references public.children(id) on delete cascade, facts_fingerprint text not null,
  preview jsonb not null, manual_review boolean not null, created_at timestamptz not null default now()
);
create table public.authentic_use_reviews (
  id uuid primary key default gen_random_uuid(), chain_id uuid not null unique references public.authentic_use_submission_chains(id) on delete cascade,
  snapshot_id uuid references public.writing_source_snapshots(id) on delete cascade, parent_user_id uuid not null references auth.users(id) on delete cascade, child_id uuid not null references public.children(id) on delete cascade,
  parent_action text not null check(parent_action in ('returned','approved')),
  mode text not null check(mode in ('shadow','enabled')), preview jsonb not null,
  manual_review boolean not null, policy_version text not null, verified_at timestamptz not null default now()
);
create table public.authentic_use_credits (
  id uuid primary key default gen_random_uuid(), review_id uuid not null references public.authentic_use_reviews(id) on delete cascade,
  chain_id uuid not null references public.authentic_use_submission_chains(id) on delete cascade, snapshot_id uuid not null references public.writing_source_snapshots(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade, child_id uuid not null references public.children(id) on delete cascade, word_key text not null check(btrim(word_key)<>''), observed_word text not null,
  occurrence_ids text[] not null check(cardinality(occurrence_ids)>0), supplied_spelling boolean not null,
  occurred_at timestamptz not null, verified_at timestamptz not null,
  canonical_word_id uuid references public.canonical_teaching_dictionary_words(id),
  unique(child_id,chain_id,word_key)
);
create index authentic_use_credits_child_idx on public.authentic_use_credits(child_id,id);
create index authentic_use_credits_word_idx on public.authentic_use_credits(word_key,child_id);
create index authentic_use_dictionary_surface_idx on public.canonical_teaching_dictionary_words
  ((lower(replace(replace(normalize(coalesce(nullif(display_word,''),normalised_word),NFC),'’',''''),'ʼ',''''))))
  where row_status='active' and dialect_code='en-GB';
create table public.authentic_use_deliveries (
  credit_id uuid not null references public.authentic_use_credits(id) on delete cascade, consumer text not null check(consumer in ('gold','proficiency')),
  parent_user_id uuid not null references auth.users(id) on delete cascade, child_id uuid not null references public.children(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','processing','delivered','ineligible','failed')),
  reason text, attempts integer not null default 0, claim_token uuid, claimed_at timestamptz,
  next_retry_at timestamptz not null default now(), delivered_at timestamptz,
  result jsonb, primary key(credit_id,consumer)
);
create index authentic_use_delivery_pending_idx on public.authentic_use_deliveries(next_retry_at) where status in ('pending','failed','processing');
create table public.authentic_use_proficiency_calculations (
  id uuid primary key default gen_random_uuid(), parent_user_id uuid not null references auth.users(id) on delete cascade, child_id uuid not null references public.children(id) on delete cascade,
  micro_skill_key text not null, source_credit_ids uuid[] not null, calculation_fingerprint text not null,
  policy_version text not null, prior_report jsonb, report jsonb not null,
  calculated_at timestamptz not null default now(), unique(child_id,micro_skill_key,calculation_fingerprint)
);
create index authentic_use_proficiency_latest_idx on public.authentic_use_proficiency_calculations(child_id,micro_skill_key,calculated_at desc,id desc);

create table public.authentic_use_review_action_events (
  id uuid primary key default gen_random_uuid(), parent_user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  submission_id uuid not null references public.task_submissions(id) on delete cascade,
  review_id uuid not null references public.authentic_use_reviews(id) on delete cascade,
  action text not null check(action in ('approved','returned')),
  outcome text not null check(outcome in ('FINALISED','DUPLICATE_SUPPRESSED','RETRY_NO_CREDIT')),
  created_at timestamptz not null default clock_timestamp()
);
create index authentic_use_review_action_events_child_idx on public.authentic_use_review_action_events(child_id,created_at);

-- Mark authenticated original lesson capture before either immutable capture
-- trigger runs. Existing shadow capture can then remain untouched.
create function public.mark_authentic_use_capture() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists(select 1 from task_submissions s join course_tasks t on t.id=s.task_id
    join authentic_use_controls c on c.child_id=s.child_id and c.parent_user_id=s.parent_user_id
    where s.id=new.submission_id and t.task_type='lesson' and c.mode<>'off') then
    new.payload:=jsonb_set(coalesce(new.payload,'{}'::jsonb),'{authenticUseCapture}','true'::jsonb,true);
  end if;
  return new;
end $$;
create trigger mark_authentic_use_capture before insert on public.task_submission_processing_jobs for each row execute function mark_authentic_use_capture();

-- Preserve the existing immutable snapshot when another capture route already ran.
create function public.capture_authentic_use_source() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare s task_submissions%rowtype; t course_tasks%rowtype; capture jsonb;
begin
  select * into s from task_submissions where id=new.submission_id;
  if not exists(select 1 from authentic_use_controls where child_id=s.child_id and parent_user_id=s.parent_user_id and mode<>'off') then return new; end if;
  select * into t from course_tasks where id=s.task_id;
  capture:=coalesce(new.payload->'writingSourceCapture','{}'::jsonb);
  insert into writing_source_snapshots(submission_id,parent_user_id,child_id,task_id,occurred_at,source_purpose,envelope)
  values(s.id,s.parent_user_id,s.child_id,s.task_id,s.submitted_at,'REAL_LEARNER',jsonb_build_object(
    'schemaVersion',1,'authenticUseCapture',t.task_type='lesson','rawSubmissionText',capture->'rawSubmissionText','draftPayload',capture->'draftPayload',
    'captureMetadata',capture-'rawSubmissionText'-'draftPayload','legacySubmissionText',s.submission_text,
    'processingPayload',new.payload-'writingSourceCapture',
    'structuredPayloads',coalesce((select jsonb_agg(jsonb_build_object('type',p.payload_type,'version',p.payload_version,'value',p.payload_json) order by p.id)
      from task_submission_payloads p where p.submission_id=s.id),'[]'::jsonb),
    'taskContext',jsonb_build_object('kind','saved_definition_at_submission','title',t.title,'instructions',t.instructions,'lessonSchema',t.lesson_schema)))
  on conflict(submission_id) do nothing;
  return new;
end $$;
create trigger zz_capture_authentic_use_source after insert on public.task_submission_processing_jobs for each row execute function public.capture_authentic_use_source();

-- Serialized parent review inputs prevent findings from changing between the
-- service preparation check and the parent action's atomic commit.
create function public.lock_authentic_use_review_input() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare row_data jsonb; parent_id text;
begin
  row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  parent_id:=row_data->>'parent_user_id';
  if parent_id is null and row_data->>'submission_id' is not null then
    select parent_user_id::text into parent_id from task_submissions where id=(row_data->>'submission_id')::uuid;
  end if;
  if parent_id is null and row_data->>'snapshot_id' is not null then
    select parent_user_id::text into parent_id from writing_source_snapshots where id=(row_data->>'snapshot_id')::uuid;
  end if;
  if parent_id is not null then perform pg_advisory_xact_lock(hashtextextended('authentic-use-parent:'||parent_id,0)); end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
do $$ declare tab text; begin
  foreach tab in array array['writing_issues','writing_issue_suggestions','misspelling_instances','parent_verifications',
    'writing_context_advisory_observations','writing_context_passage_findings','writing_context_passage_review_events','writing_context_parent_decisions',
    'writing_context_ai_attempts','task_submission_processing_jobs'] loop
    if to_regclass('public.'||tab) is not null then
      execute format('create trigger authentic_use_review_lock before insert or update or delete on public.%I for each row execute function public.lock_authentic_use_review_input()',tab);
    end if;
  end loop;
end $$;

-- This single read is fingerprinted. No browser-supplied eligibility lists are
-- accepted; only service-created preparations can be consumed by the parent RPC.
create function public.authentic_use_review_facts(p_submission_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s task_submissions%rowtype; chain authentic_use_submission_chains%rowtype; snapshot writing_source_snapshots%rowtype; result jsonb;
begin
  select * into s from task_submissions where id=p_submission_id;
  select * into chain from authentic_use_submission_chains where id=s.authentic_use_chain_id;
  select * into snapshot from writing_source_snapshots where submission_id=chain.first_submission_id;
  result:=jsonb_build_object('submission',to_jsonb(s),'chain',to_jsonb(chain),'snapshot',case when snapshot.id is null then null else to_jsonb(snapshot) end,
    'review',(select to_jsonb(r) from authentic_use_reviews r where r.chain_id=chain.id),
    'issues',coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from writing_issues i where i.task_submission_id=chain.first_submission_id),'[]'::jsonb),
    'suggestions',coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from writing_issue_suggestions i where i.task_submission_id=chain.first_submission_id),'[]'::jsonb),
    'misspellings',coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from misspelling_instances i join writing_samples w on w.id=i.writing_sample_id where w.task_submission_id=chain.first_submission_id),'[]'::jsonb),
    'verifications',coalesce((select jsonb_agg(to_jsonb(v) order by v.verified_at,v.id) from parent_verifications v where v.task_submission_id=chain.first_submission_id),'[]'::jsonb),
    'passage_findings',coalesce((select jsonb_agg(to_jsonb(f) order by f.id) from writing_context_passage_findings f where f.snapshot_id=snapshot.id),'[]'::jsonb),
    'passage_decisions',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at,e.id) from writing_context_passage_review_events e join writing_context_passage_findings f on f.id=e.finding_id where f.snapshot_id=snapshot.id),'[]'::jsonb),
    'context_observations',coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at,o.id) from writing_context_advisory_observations o where o.snapshot_id=snapshot.id),'[]'::jsonb),
    'context_decisions',coalesce((select jsonb_agg(to_jsonb(d) order by d.id) from writing_context_current_parent_decisions d join writing_occurrences o on o.id=d.occurrence_id where o.snapshot_id=snapshot.id),'[]'::jsonb),
    'ai_attempts',coalesce((select jsonb_agg(jsonb_build_object('window_fingerprint',a.window_fingerprint,'result_status',a.result_status) order by a.id)
      from writing_context_ai_attempts a where a.snapshot_id=snapshot.id and a.family_key='PASSAGE_SCAN'),'[]'::jsonb),
    'processing_complete',exists(select 1 from task_submission_processing_jobs j where j.submission_id=chain.first_submission_id and j.status='completed'));
  return result;
end $$;
create function public.prepare_authentic_use_review(p_submission_id uuid,p_fingerprint text,p_preview jsonb,p_manual_review boolean)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare s task_submissions%rowtype; prep_id uuid; facts jsonb;
begin
  select * into s from task_submissions where id=p_submission_id;
  if s.id is null then raise exception 'AUTHENTIC_USE_SOURCE_MISSING'; end if;
  perform pg_advisory_xact_lock(hashtextextended('authentic-use-parent:'||s.parent_user_id::text,0));
  facts:=authentic_use_review_facts(s.id);
  if md5(facts::text)<>p_fingerprint then raise exception 'AUTHENTIC_USE_STALE_REVIEW'; end if;
  if jsonb_typeof(p_preview)<>'object' or p_preview->>'policyVersion'<>'FIRST_SUBMISSION_AUTHENTIC_USE_V1_2026_10_05' then raise exception 'AUTHENTIC_USE_INVALID_PREVIEW'; end if;
  if coalesce((p_preview->>'requiresManualReview')::boolean,true) and not p_manual_review then raise exception 'AUTHENTIC_USE_MANUAL_REVIEW_REQUIRED'; end if;
  insert into authentic_use_review_preparations(submission_id,parent_user_id,child_id,facts_fingerprint,preview,manual_review)
    values(s.id,s.parent_user_id,s.child_id,p_fingerprint,p_preview,p_manual_review) returning id into prep_id;
  return prep_id;
end $$;
-- Return the PostgreSQL JSON fingerprint, not a differently serialized JS hash.
create function public.load_authentic_use_review(p_submission_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare facts jsonb; begin facts:=authentic_use_review_facts(p_submission_id); return jsonb_build_object('facts',facts,'fingerprint',md5(facts::text)); end $$;

create function public.finalise_authentic_use_parent_action(p_submission_id uuid,p_preparation_id uuid,p_action text,p_parent_note text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s task_submissions%rowtype; chain authentic_use_submission_chains%rowtype; ctrl authentic_use_controls%rowtype;
  prep authentic_use_review_preparations%rowtype; snapshot writing_source_snapshots%rowtype; review_id uuid; candidate jsonb; credit_id uuid; result jsonb; review_was_existing boolean;
begin
  select * into s from task_submissions where id=p_submission_id;
  if s.id is null or auth.uid() is null or auth.uid()<>s.parent_user_id then raise exception 'AUTHENTIC_USE_PARENT_OWNERSHIP'; end if;
  if p_action not in ('approved','returned') then raise exception 'AUTHENTIC_USE_ACTION_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('authentic-use-parent:'||s.parent_user_id::text,0));
  select * into s from task_submissions where id=p_submission_id for update;
  select * into chain from authentic_use_submission_chains where id=s.authentic_use_chain_id for update;
  select * into ctrl from authentic_use_controls where child_id=s.child_id and parent_user_id=s.parent_user_id for share;
  if ctrl.child_id is null or ctrl.mode='off' then raise exception 'AUTHENTIC_USE_CONTROL_DISABLED'; end if;
  select id into review_id from authentic_use_reviews where chain_id=chain.id;
  review_was_existing:=review_id is not null;
  if review_id is null then
    -- Never award a retry when its original attempt was reviewed by older code.
    select * into prep from authentic_use_review_preparations where id=p_preparation_id and submission_id=s.id and parent_user_id=auth.uid() and child_id=s.child_id;
    if prep.id is null or prep.created_at<now()-interval '10 minutes' or prep.facts_fingerprint<>md5(authentic_use_review_facts(s.id)::text) then raise exception 'AUTHENTIC_USE_STALE_REVIEW'; end if;
    select * into snapshot from writing_source_snapshots where submission_id=chain.first_submission_id;
    insert into authentic_use_reviews(chain_id,snapshot_id,parent_user_id,child_id,parent_action,mode,preview,manual_review,policy_version)
      values(chain.id,snapshot.id,s.parent_user_id,s.child_id,p_action,ctrl.mode,prep.preview,prep.manual_review,prep.preview->>'policyVersion') returning id into review_id;
    if ctrl.mode='enabled' and s.id=chain.first_submission_id and snapshot.occurred_at>=ctrl.activation_cutoff then
      for candidate in select value from jsonb_array_elements(prep.preview->'candidates') loop
        if exists(select 1 from jsonb_array_elements_text(candidate->'occurrenceIds') i where not exists(
          select 1 from writing_occurrences o where o.id=i.value and o.snapshot_id=snapshot.id and o.provenance='learner_response')) then raise exception 'AUTHENTIC_USE_OCCURRENCE_SCOPE'; end if;
        insert into authentic_use_credits(review_id,chain_id,snapshot_id,parent_user_id,child_id,word_key,observed_word,occurrence_ids,supplied_spelling,occurred_at,verified_at)
          values(review_id,chain.id,snapshot.id,s.parent_user_id,s.child_id,candidate->>'wordKey',candidate->>'observedWord',
            array(select jsonb_array_elements_text(candidate->'occurrenceIds')),(candidate->>'suppliedSpelling')::boolean,snapshot.occurred_at,now()) returning id into credit_id;
        insert into authentic_use_deliveries(credit_id,consumer,parent_user_id,child_id)
          values(credit_id,'gold',s.parent_user_id,s.child_id),(credit_id,'proficiency',s.parent_user_id,s.child_id);
      end loop;
    end if;
  end if;
  if p_action='approved' then result:=approve_task_submission_with_reason_drafts(s.id,s.parent_user_id,s.child_id);
  else
    if s.parent_review_status='approved' then raise exception 'AUTHENTIC_USE_ALREADY_APPROVED'; end if;
    update task_submissions set parent_review_status='returned',parent_review_note=p_parent_note,parent_reviewed_at=now() where id=s.id;
    result:=jsonb_build_object('submission_id',s.id,'returned',true);
  end if;
  insert into authentic_use_review_action_events(parent_user_id,child_id,submission_id,review_id,action,outcome)
    values(s.parent_user_id,s.child_id,s.id,review_id,p_action,case when s.id<>chain.first_submission_id then 'RETRY_NO_CREDIT' when review_was_existing then 'DUPLICATE_SUPPRESSED' else 'FINALISED' end);
  return result||jsonb_build_object('authentic_use_review_id',review_id);
end $$;
-- Enabled cohorts cannot bypass atomic credit finalisation via the legacy RPC.
create function public.guard_authentic_use_parent_action() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then
    if new.parent_review_status in ('returned','approved') and exists(select 1 from authentic_use_controls where child_id=new.child_id and mode<>'off') then raise exception 'AUTHENTIC_USE_ATOMIC_REVIEW_REQUIRED'; end if;
    return new;
  end if;
  if new.parent_review_status is distinct from old.parent_review_status and new.parent_review_status in ('returned','approved')
    and exists(select 1 from authentic_use_controls where child_id=new.child_id and parent_user_id=new.parent_user_id and mode<>'off')
    and not exists(select 1 from authentic_use_reviews where chain_id=new.authentic_use_chain_id) then
    raise exception 'AUTHENTIC_USE_ATOMIC_REVIEW_REQUIRED';
  end if;
  if old.authentic_use_chain_id is not null and new.authentic_use_chain_id is distinct from old.authentic_use_chain_id then raise exception 'AUTHENTIC_USE_CHAIN_IMMUTABLE'; end if;
  return new;
end $$;
create trigger guard_authentic_use_parent_action before insert or update on public.task_submissions for each row execute function public.guard_authentic_use_parent_action();

create function public.claim_authentic_use_deliveries(p_limit integer default 20) returns setof public.authentic_use_deliveries
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update authentic_use_deliveries set status='failed',claim_token=null,next_retry_at=now(),reason='LEASE_EXPIRED'
    where status='processing' and claimed_at<now()-interval '5 minutes';
  return query with selected as (
    select d.credit_id,d.consumer from authentic_use_deliveries d join authentic_use_controls c using(child_id,parent_user_id)
    where c.mode='enabled' and ((d.consumer='gold' and c.gold_enabled) or (d.consumer='proficiency' and c.proficiency_enabled))
      and d.status in ('pending','failed') and d.next_retry_at<=now()
    order by d.next_retry_at,d.credit_id,d.consumer limit greatest(1,least(p_limit,100)) for update of d skip locked
  ) update authentic_use_deliveries d set status='processing',claim_token=gen_random_uuid(),claimed_at=now(),attempts=d.attempts+1
    from selected s where d.credit_id=s.credit_id and d.consumer=s.consumer returning d.*;
end $$;

create function public.deliver_authentic_use_gold(p_credit_id uuid,p_claim_token uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare d authentic_use_deliveries%rowtype; credit authentic_use_credits%rowtype; treasure child_word_treasures%rowtype; bar_event_id uuid; result_payload jsonb; treasure_ids uuid[];
begin
  select * into d from authentic_use_deliveries where credit_id=p_credit_id and consumer='gold' for update;
  if d.status<>'processing' or d.claim_token is distinct from p_claim_token then raise exception 'AUTHENTIC_USE_DELIVERY_LEASE'; end if;
  if not exists(select 1 from authentic_use_controls where child_id=d.child_id and parent_user_id=d.parent_user_id and mode='enabled' and gold_enabled) then raise exception 'AUTHENTIC_USE_CONSUMER_DISABLED'; end if;
  select * into credit from authentic_use_credits where id=p_credit_id;
  select array_agg(id) into treasure_ids from child_word_treasures where child_id=credit.child_id and parent_user_id=credit.parent_user_id
    and lower(replace(replace(normalize(corrected_word_normalized,NFC),'’',''''),'ʼ',''''))=credit.word_key;
  if cardinality(treasure_ids)>1 then
    update authentic_use_deliveries set status='ineligible',reason='AMBIGUOUS_WORD_TREASURE',claim_token=null,delivered_at=now() where credit_id=p_credit_id and consumer='gold';
    return jsonb_build_object('status','ineligible');
  end if;
  select * into treasure from child_word_treasures where id=treasure_ids[1] for update;
  if treasure.id is null or treasure.status<>'in_forge' or treasure.entered_forge_at is null or credit.occurred_at<=treasure.entered_forge_at then
    update authentic_use_deliveries set status='ineligible',reason=case when treasure.id is null then 'NO_WORD_TREASURE' when treasure.entered_forge_at is null or credit.occurred_at<=treasure.entered_forge_at then 'WRITTEN_BEFORE_FORGE' else 'NOT_IN_FORGE' end,
      claim_token=null,delivered_at=now() where credit_id=p_credit_id and consumer='gold';
    return jsonb_build_object('status','ineligible');
  end if;
  -- The stable source ID guards both retries and failure after committing writes.
  if exists(select 1 from child_word_treasure_events where treasure_id=treasure.id and event_type='authentic_correct_use_recorded'
    and source_type='first_submission_authentic_use' and source_entity_id=credit.id::text) then
    update authentic_use_deliveries set status='delivered',reason='ALREADY_DELIVERED',claim_token=null,delivered_at=now() where credit_id=p_credit_id and consumer='gold';
    return jsonb_build_object('status','delivered');
  end if;
  insert into child_word_treasure_events(treasure_id,child_id,parent_user_id,event_type,source_type,source_entity_id,previous_status,new_status,authentic_use_increment,metadata)
    values(treasure.id,credit.child_id,credit.parent_user_id,'authentic_correct_use_recorded','first_submission_authentic_use',credit.id::text,'in_forge','in_forge',1,
      jsonb_build_object('authentic_use_credit_id',credit.id,'chain_id',credit.chain_id,'occurred_at',credit.occurred_at));
  update child_word_treasures set authentic_correct_uses_after_forge=authentic_correct_uses_after_forge+1,updated_at=now() where id=treasure.id returning * into treasure;
  if treasure.authentic_correct_uses_after_forge>=treasure.required_uses_for_bar then
    update child_word_treasures set status='golden_bar',golden_bar_at=now(),updated_at=now() where id=treasure.id;
    if not exists(select 1 from child_word_treasure_events where treasure_id=treasure.id and event_type='golden_bar_awarded') then
    insert into child_word_treasure_events(treasure_id,child_id,parent_user_id,event_type,source_type,source_entity_id,previous_status,new_status,metadata)
      values(treasure.id,credit.child_id,credit.parent_user_id,'golden_bar_awarded','word_treasure',treasure.id::text,'in_forge','golden_bar',jsonb_build_object('authentic_use_credit_id',credit.id)) returning id into bar_event_id;
    insert into child_gold_bar_ledger_events(child_id,parent_user_id,event_type,amount,source,related_entity_type,related_entity_id,notes)
      values(credit.child_id,credit.parent_user_id,'earned',1,'word_treasure','child_word_treasure',treasure.id,'Golden Bar earned from verified original writing.');
    end if;
  end if;
  result_payload:=jsonb_build_object('status','delivered','treasure_id',treasure.id,'uses',treasure.authentic_correct_uses_after_forge,'golden_bar_event_id',bar_event_id);
  update authentic_use_deliveries set status='delivered',result=result_payload,claim_token=null,delivered_at=now() where credit_id=p_credit_id and consumer='gold';
  return result_payload;
end $$;

-- Resolve formerly unmapped words without ever reopening gold delivery.
create function public.reconcile_authentic_use_word_identities() returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare affected integer;
begin
  with matches as (
    select credit.id,min(w.id::text)::uuid word_id from authentic_use_credits credit
    join canonical_teaching_dictionary_words w on lower(replace(replace(normalize(coalesce(nullif(w.display_word,''),w.normalised_word),NFC),'’',''''),'ʼ',''''))=credit.word_key and w.row_status='active' and w.dialect_code='en-GB'
    where credit.canonical_word_id is null group by credit.id having count(*)=1
  ) update authentic_use_credits c set canonical_word_id=m.word_id from matches m where c.id=m.id;
  get diagnostics affected=row_count;
  update authentic_use_deliveries d set status='pending',reason=null,next_retry_at=now()
    from authentic_use_credits c where d.credit_id=c.id and d.consumer='proficiency' and d.status='ineligible' and d.reason='WORD_UNMAPPED' and c.canonical_word_id is not null;
  return affected;
end $$;

alter table public.adle_authentic_use_events drop constraint adle_authentic_use_events_provenance_kind_check;
alter table public.adle_authentic_use_events add constraint adle_authentic_use_events_provenance_kind_check check(provenance_kind in ('independent_or_parent_verified_application','prompted_review_writing_application','parent_verified_supplied_spelling_application'));

create function public.stage_authentic_use_proficiency(p_credit_id uuid,p_claim_token uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare d authentic_use_deliveries%rowtype; credit authentic_use_credits%rowtype;
begin
  select * into d from authentic_use_deliveries where credit_id=p_credit_id and consumer='proficiency' for update;
  if d.status<>'processing' or d.claim_token is distinct from p_claim_token then raise exception 'AUTHENTIC_USE_DELIVERY_LEASE'; end if;
  if not exists(select 1 from authentic_use_controls where child_id=d.child_id and parent_user_id=d.parent_user_id and mode='enabled' and proficiency_enabled) then raise exception 'AUTHENTIC_USE_CONSUMER_DISABLED'; end if;
  select * into credit from authentic_use_credits where id=p_credit_id;
  if credit.canonical_word_id is null then
    update authentic_use_deliveries set status='ineligible',reason='WORD_UNMAPPED',claim_token=null,delivered_at=now() where credit_id=p_credit_id and consumer='proficiency';
    return jsonb_build_object('status','ineligible');
  end if;
  insert into adle_authentic_use_events(child_id,canonical_word_id,occurred_on,verified_at,use_kind,parent_verified,piece_ref,source_ref,row_status,provenance_kind,writing_submitted_at,provenance)
    values(credit.child_id,credit.canonical_word_id,(credit.occurred_at at time zone 'Europe/London')::date,credit.verified_at,'authentic_correct_use',true,
      'first-submission:'||credit.chain_id::text,'authentic-use:'||credit.id::text,'active',
      case when credit.supplied_spelling then 'parent_verified_supplied_spelling_application' else 'independent_or_parent_verified_application' end,credit.occurred_at,
      jsonb_build_object('authentic_use_credit_id',credit.id,'supplied_spelling',credit.supplied_spelling,'authorship','child_original_writing','context_outcome','parent_verified','policy_version','FIRST_SUBMISSION_AUTHENTIC_USE_V1_2026_10_05'))
    on conflict do nothing;
  return jsonb_build_object('status','staged','canonical_word_id',credit.canonical_word_id);
end $$;
create function public.complete_authentic_use_proficiency(p_credit_id uuid,p_claim_token uuid,p_calculations jsonb) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare d authentic_use_deliveries%rowtype; calculation jsonb;
begin
  select * into d from authentic_use_deliveries where credit_id=p_credit_id and consumer='proficiency' for update;
  if d.status<>'processing' or d.claim_token is distinct from p_claim_token then raise exception 'AUTHENTIC_USE_DELIVERY_LEASE'; end if;
  if not exists(select 1 from authentic_use_controls where child_id=d.child_id and parent_user_id=d.parent_user_id and mode='enabled' and proficiency_enabled) then raise exception 'AUTHENTIC_USE_CONSUMER_DISABLED'; end if;
  for calculation in select value from jsonb_array_elements(p_calculations) loop
    insert into authentic_use_proficiency_calculations(parent_user_id,child_id,micro_skill_key,source_credit_ids,calculation_fingerprint,policy_version,prior_report,report)
      values(d.parent_user_id,d.child_id,calculation->>'microSkillKey',
        array(select jsonb_array_elements_text(calculation->'sourceCreditIds'))::uuid[],calculation->>'fingerprint',calculation->>'policyVersion',
        calculation->'priorReport',calculation->'report') on conflict do nothing;
  end loop;
  update authentic_use_deliveries set status='delivered',reason=case when jsonb_array_length(p_calculations)=0 then 'NO_ELIGIBLE_SKILL_MAPPING' else null end,
    result=jsonb_build_object('calculations',jsonb_array_length(p_calculations)),claim_token=null,delivered_at=now() where credit_id=p_credit_id and consumer='proficiency';
  return true;
end $$;
create function public.refresh_authentic_use_proficiency(p_child_id uuid,p_parent_user_id uuid,p_calculations jsonb) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare calculation jsonb; count_written integer:=0; added integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('authentic-use-proficiency:'||p_child_id::text,0));
  if not exists(select 1 from authentic_use_controls where child_id=p_child_id and parent_user_id=p_parent_user_id and mode='enabled' and proficiency_enabled) then raise exception 'AUTHENTIC_USE_CONSUMER_DISABLED'; end if;
  for calculation in select value from jsonb_array_elements(p_calculations) loop
    if exists(select 1 from jsonb_array_elements_text(calculation->'sourceCreditIds') i join authentic_use_credits c on c.id=i.value::uuid where c.child_id<>p_child_id or c.parent_user_id<>p_parent_user_id) then raise exception 'AUTHENTIC_USE_EVIDENCE_OWNERSHIP'; end if;
    insert into authentic_use_proficiency_calculations(parent_user_id,child_id,micro_skill_key,source_credit_ids,calculation_fingerprint,policy_version,prior_report,report)
      values(p_parent_user_id,p_child_id,calculation->>'microSkillKey',array(select jsonb_array_elements_text(calculation->'sourceCreditIds'))::uuid[],
        calculation->>'fingerprint',calculation->>'policyVersion',calculation->'priorReport',calculation->'report') on conflict do nothing;
    get diagnostics added=row_count; count_written:=count_written+added;
  end loop;
  return count_written;
end $$;
create function public.fail_authentic_use_delivery(p_credit_id uuid,p_consumer text,p_claim_token uuid) returns void
language sql security definer set search_path=public,pg_temp as $$
  update authentic_use_deliveries set status='failed',reason='DELIVERY_FAILED',claim_token=null,
    next_retry_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7))::integer))
    where credit_id=p_credit_id and consumer=p_consumer and claim_token=p_claim_token and status='processing';
$$;
create function public.suppress_legacy_authentic_use() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists(select 1 from authentic_use_controls where child_id=new.child_id and mode='enabled') then
    if tg_table_name='adle_authentic_use_events' then
      if new.piece_ref like 'ws:%' then raise exception 'AUTHENTIC_USE_LEGACY_PATH_DISABLED'; end if;
    elsif tg_table_name='child_word_treasure_events' then
      if new.event_type='authentic_correct_use_recorded' and new.source_type<>'first_submission_authentic_use' then raise exception 'AUTHENTIC_USE_LEGACY_PATH_DISABLED'; end if;
    end if;
  end if;
  return new;
end $$;
create trigger suppress_legacy_authentic_use before insert on adle_authentic_use_events for each row execute function suppress_legacy_authentic_use();
create trigger suppress_legacy_authentic_use before insert on child_word_treasure_events for each row execute function suppress_legacy_authentic_use();

-- Producer facts are immutable; identity attachment is the only allowed update.
create function public.protect_authentic_use_fact() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if tg_table_name='authentic_use_credits' and tg_op='UPDATE' and (to_jsonb(new)-'canonical_word_id')=(to_jsonb(old)-'canonical_word_id')
    and to_jsonb(old)->>'canonical_word_id' is null and to_jsonb(new)->>'canonical_word_id' is not null then return new; end if;
  raise exception 'AUTHENTIC_USE_FACT_IMMUTABLE';
end $$;
do $$ declare tab text; begin
  foreach tab in array array['authentic_use_review_action_events','authentic_use_reviews','authentic_use_credits','authentic_use_proficiency_calculations'] loop
    execute format('create trigger authentic_use_fact_immutable before update on %I for each row execute function protect_authentic_use_fact()',tab);
  end loop;
  foreach tab in array array['authentic_use_controls','authentic_use_submission_chains','authentic_use_review_preparations','authentic_use_reviews','authentic_use_credits','authentic_use_deliveries','authentic_use_proficiency_calculations','authentic_use_review_action_events'] loop
    execute format('alter table %I enable row level security',tab);
    execute format('grant all on %I to service_role',tab);
    if tab<>'authentic_use_review_preparations' then
      execute format('create policy owning_parent_read on %I for select to authenticated using(parent_user_id=auth.uid())',tab);
      execute format('grant select on %I to authenticated',tab);
    end if;
  end loop;
end $$;
do $$ declare func record; begin
  for func in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace
    and proname in ('mark_authentic_use_capture','attach_authentic_use_chain','backfill_authentic_use_chains_for_child','capture_authentic_use_source','lock_authentic_use_review_input','authentic_use_review_facts',
      'prepare_authentic_use_review','load_authentic_use_review','finalise_authentic_use_parent_action','guard_authentic_use_parent_action',
      'claim_authentic_use_deliveries','deliver_authentic_use_gold','reconcile_authentic_use_word_identities','protect_authentic_use_fact',
      'refresh_authentic_use_proficiency','stage_authentic_use_proficiency','complete_authentic_use_proficiency','fail_authentic_use_delivery','suppress_legacy_authentic_use') loop
    execute format('revoke all on function %s from public,anon,authenticated',func.signature);
    execute format('grant execute on function %s to service_role',func.signature);
  end loop;
end $$;
create view public.authentic_use_current_proficiency with(security_invoker=true) as
  select distinct on(child_id,micro_skill_key) * from public.authentic_use_proficiency_calculations
  order by child_id,micro_skill_key,calculated_at desc,id desc;
create view public.authentic_use_delivery_health with(security_invoker=true) as
  select parent_user_id,child_id,consumer,status,count(*) delivery_count,min(next_retry_at) next_retry_at,
    min(claimed_at) oldest_claim_at from public.authentic_use_deliveries group by parent_user_id,child_id,consumer,status;
grant select on public.authentic_use_current_proficiency,public.authentic_use_delivery_health to authenticated,service_role;
grant execute on function public.finalise_authentic_use_parent_action(uuid,uuid,text,text) to authenticated;
commit;
