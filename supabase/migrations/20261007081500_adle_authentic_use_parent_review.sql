-- Source-specific ADLE authentic-use receipts share the existing independent
-- gold/proficiency delivery ledger. No historical writing is awarded here.
begin;

create table public.authentic_use_adle_runtime (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);
insert into public.authentic_use_adle_runtime(singleton,enabled) values(true,false);
alter table public.authentic_use_adle_runtime enable row level security;
revoke all on public.authentic_use_adle_runtime from public,anon,authenticated;
grant select,update on public.authentic_use_adle_runtime to service_role;

create table public.authentic_use_historical_grants (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check(source_type in ('course_lesson','adle_review')),
  source_id uuid not null,
  source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
  parent_user_id uuid not null references auth.users(id) on delete restrict,
  child_id uuid not null references public.children(id) on delete restrict,
  evidence_ref text not null check(btrim(evidence_ref)<>''),
  granted_at timestamptz not null default clock_timestamp(),
  unique(source_type,source_id),
  check(child_id='e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'::uuid)
);
alter table public.authentic_use_historical_grants enable row level security;
revoke all on public.authentic_use_historical_grants from public,anon,authenticated;
grant select,insert on public.authentic_use_historical_grants to service_role;
create trigger authentic_use_historical_grant_immutable before update or delete
  on public.authentic_use_historical_grants for each row execute function public.reject_writing_fact_update();

create function public.guard_authentic_use_historical_grant() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare source public.adle_review_context_sources%rowtype;
  snapshot public.writing_source_snapshots%rowtype;
  submission public.task_submissions%rowtype;
  chain public.authentic_use_submission_chains%rowtype;
begin
  if new.source_type='adle_review' then
    select * into source from public.adle_review_context_sources where id=new.source_id;
    if source.id is null or source.child_id<>new.child_id or source.parent_user_id<>new.parent_user_id
      or source.source_hash<>new.source_hash
      or source.source_hash<>encode(extensions.digest(convert_to(source.submitted_text,'UTF8'),'sha256'),'hex')
      or source.review_session_id not in (
        '77800d2a-26df-5b63-95cc-60ec109376dd'::uuid,
        '040c5b18-5bbd-5b0d-abe2-ce12bd00d022'::uuid,
        '5a402c85-e57c-563e-91db-2f7af0e35d8c'::uuid,
        '1295de22-3296-51b1-a349-32e01b6d8b55'::uuid,
        '65173144-7342-50ee-a616-1b57630c51b8'::uuid,
        'af4be051-d2aa-5182-9463-6e1b8c09f3aa'::uuid,
        '34aa9b1c-a40d-5a43-8f49-206b7d1810bd'::uuid)
      or not exists(select 1 from public.adle_review_sessions s where s.id=source.review_session_id
        and s.completed_at is not null and s.submitted_writing_text=source.submitted_text)
      or exists(select 1 from public.adle_review_parent_reviews r where r.review_session_id=source.review_session_id)
      then raise exception 'AUTHENTIC_USE_HISTORICAL_SOURCE_INELIGIBLE'; end if;
  else
    select * into snapshot from public.writing_source_snapshots where id=new.source_id;
    select * into submission from public.task_submissions where id=snapshot.submission_id;
    select * into chain from public.authentic_use_submission_chains where id=submission.authentic_use_chain_id;
    if snapshot.id is null or snapshot.child_id<>new.child_id or snapshot.parent_user_id<>new.parent_user_id
      or new.source_hash<>encode(extensions.digest(convert_to(snapshot.envelope::text,'UTF8'),'sha256'),'hex')
      or submission.id not in ('01e68c85-8da9-4b11-b7a6-04378f300fa0'::uuid,
        '9d31cd23-9c45-44f0-94f6-1555601589b2'::uuid)
      or submission.parent_review_status<>'pending' or chain.first_submission_id<>submission.id
      or exists(select 1 from public.authentic_use_reviews r where r.chain_id=chain.id)
      then raise exception 'AUTHENTIC_USE_HISTORICAL_SOURCE_INELIGIBLE'; end if;
  end if;
  return new;
end $$;
create trigger guard_authentic_use_historical_grant before insert on public.authentic_use_historical_grants
  for each row execute function public.guard_authentic_use_historical_grant();

-- Only two first attempts have a saved structured response and an unchanged
-- lesson definition. A retry, changed schema, or edited payload fails closed.
create function public.reconstruct_named_historical_lesson_source(p_submission_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare submission public.task_submissions%rowtype; task public.course_tasks%rowtype;
  payload public.task_submission_payloads%rowtype; chain public.authentic_use_submission_chains%rowtype;
  processing public.task_submission_processing_jobs%rowtype; capture jsonb; answer jsonb;
  snapshot_id uuid; snapshot_hash text;
begin
  if p_submission_id not in ('01e68c85-8da9-4b11-b7a6-04378f300fa0'::uuid,
    '9d31cd23-9c45-44f0-94f6-1555601589b2'::uuid) then raise exception 'AUTHENTIC_USE_HISTORICAL_SOURCE_NOT_ALLOWLISTED'; end if;
  select * into submission from public.task_submissions where id=p_submission_id for update;
  select * into task from public.course_tasks where id=submission.task_id;
  select * into chain from public.authentic_use_submission_chains where id=submission.authentic_use_chain_id;
  select * into payload from public.task_submission_payloads where submission_id=p_submission_id
    and payload_type='structured_lesson_response';
  if submission.id is null or submission.child_id<>'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'::uuid
    or submission.parent_review_status<>'pending' or chain.first_submission_id<>submission.id
    or task.id is null or task.task_type<>'lesson' or not task.is_active
    or task.updated_at>submission.submitted_at
    or not exists(select 1 from public.courses c where c.id=task.course_id and not c.is_archived)
    or exists(select 1 from public.task_submissions later where later.task_id=task.id
      and later.child_id=submission.child_id and later.id<>submission.id)
    or payload.id is null or payload.parent_user_id<>submission.parent_user_id
    or payload.child_id<>submission.child_id or payload.task_id<>submission.task_id
    or payload.payload_version<>1 or payload.updated_at<>payload.created_at
    or payload.created_at<submission.submitted_at-interval '5 minutes'
    or (payload.created_at>submission.submitted_at+interval '5 minutes' and not (
      jsonb_array_length(payload.payload_json->'answers')=1
      and payload.payload_json#>>'{answers,0,value}'=submission.submission_text))
    or jsonb_typeof(payload.payload_json->'answers')<>'array'
    or jsonb_array_length(payload.payload_json->'answers')=0
    or jsonb_typeof(task.lesson_schema->'blocks')<>'array'
    then raise exception 'AUTHENTIC_USE_HISTORICAL_AUTHORSHIP_UNVERIFIED'; end if;
  if exists(select 1 from public.writing_source_snapshots where submission_id=p_submission_id)
    then raise exception 'AUTHENTIC_USE_HISTORICAL_SNAPSHOT_ALREADY_EXISTS'; end if;
  if (select count(*) from jsonb_array_elements(payload.payload_json->'answers'))<>
    (select count(distinct a->>'block_id') from jsonb_array_elements(payload.payload_json->'answers') a)
    then raise exception 'AUTHENTIC_USE_HISTORICAL_DUPLICATE_BLOCK'; end if;
  for answer in select value from jsonb_array_elements(payload.payload_json->'answers') loop
    if jsonb_typeof(answer->'value')<>'string' or not exists(
      select 1 from jsonb_array_elements(task.lesson_schema->'blocks') block
      where block->>'block_id'=answer->>'block_id'
        and block->>'block_type' in ('question_text','question_textarea')
        and coalesce((block->>'authentic_use_excluded')::boolean,false)=false
        and coalesce((block->>'copied')::boolean,false)=false
        and coalesce((block->>'dictated')::boolean,false)=false)
      then raise exception 'AUTHENTIC_USE_HISTORICAL_FIELD_UNVERIFIED'; end if;
  end loop;
  select * into processing from public.task_submission_processing_jobs where submission_id=p_submission_id
    order by created_at limit 1;
  capture:=coalesce(processing.payload->'writingSourceCapture','{}'::jsonb);
  insert into public.writing_source_snapshots(submission_id,parent_user_id,child_id,task_id,
    occurred_at,source_purpose,source_revision,envelope)
  values(submission.id,submission.parent_user_id,submission.child_id,submission.task_id,
    submission.submitted_at,'REAL_LEARNER','historical-authentic-v1',jsonb_build_object(
      'schemaVersion',1,'authenticUseCapture',true,'historicalReconstruction',true,
      'historicalProvenance',case when payload.created_at>submission.submitted_at+interval '5 minutes'
        then 'single_answer_matches_original_submission_text' else 'contemporaneous_structured_payload' end,
      'rawSubmissionText',capture->'rawSubmissionText','draftPayload',coalesce(capture->'draftPayload','{}'::jsonb),
      'captureMetadata',(capture-'rawSubmissionText'-'draftPayload')||jsonb_build_object('structuredResponseOrigin','submitted_structured_payload'),
      'legacySubmissionText',submission.submission_text,'processingPayload',coalesce(processing.payload,'{}'::jsonb)-'writingSourceCapture',
      'structuredPayloads',jsonb_build_array(jsonb_build_object('type',payload.payload_type,'version',payload.payload_version,'value',payload.payload_json)),
      'taskContext',jsonb_build_object('kind','historical_verified_definition','title',task.title,
        'instructions',task.instructions,'lessonSchema',task.lesson_schema))) returning id into snapshot_id;
  select encode(extensions.digest(convert_to(s.envelope::text,'UTF8'),'sha256'),'hex') into snapshot_hash
    from public.writing_source_snapshots s where s.id=snapshot_id;
  return jsonb_build_object('snapshot_id',snapshot_id,'source_hash',snapshot_hash);
end $$;
revoke all on function public.reconstruct_named_historical_lesson_source(uuid) from public,anon,authenticated;
grant execute on function public.reconstruct_named_historical_lesson_source(uuid) to service_role;

create table public.authentic_use_adle_reviews (
  id uuid primary key default gen_random_uuid(),
  review_session_id uuid not null unique references public.adle_review_sessions(id) on delete restrict,
  source_id uuid not null unique references public.adle_review_context_sources(id) on delete restrict,
  source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
  parent_user_id uuid not null references auth.users(id) on delete restrict,
  child_id uuid not null references public.children(id) on delete restrict,
  preview jsonb not null,
  manual_review boolean not null,
  policy_version text not null,
  verified_at timestamptz not null default clock_timestamp()
);
alter table public.authentic_use_adle_reviews enable row level security;
revoke all on public.authentic_use_adle_reviews from public,anon,authenticated;
grant select,insert on public.authentic_use_adle_reviews to service_role;
create trigger authentic_use_adle_review_immutable before update or delete
  on public.authentic_use_adle_reviews for each row execute function public.reject_writing_fact_update();

alter table public.authentic_use_credits
  alter column review_id drop not null,
  alter column chain_id drop not null,
  alter column snapshot_id drop not null,
  add column adle_review_id uuid references public.authentic_use_adle_reviews(id) on delete restrict,
  add column adle_source_id uuid references public.adle_review_context_sources(id) on delete restrict;
alter table public.authentic_use_credits add constraint authentic_use_credit_one_source_check
  check((review_id is not null and chain_id is not null and snapshot_id is not null
    and adle_review_id is null and adle_source_id is null)
    or (review_id is null and chain_id is null and snapshot_id is null
    and adle_review_id is not null and adle_source_id is not null));
create unique index authentic_use_adle_credit_unique on public.authentic_use_credits(child_id,adle_source_id,word_key)
  where adle_source_id is not null;

create table public.authentic_use_adle_preparations (
  id uuid primary key default gen_random_uuid(),
  review_session_id uuid not null references public.adle_review_sessions(id) on delete restrict,
  source_id uuid not null references public.adle_review_context_sources(id) on delete restrict,
  source_hash text not null,
  parent_user_id uuid not null references auth.users(id) on delete restrict,
  child_id uuid not null references public.children(id) on delete restrict,
  facts_fingerprint text not null,
  preview jsonb not null,
  occurrences jsonb not null,
  manual_review boolean not null,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.authentic_use_adle_preparations enable row level security;
revoke all on public.authentic_use_adle_preparations from public,anon,authenticated;
grant select,insert on public.authentic_use_adle_preparations to service_role;
create trigger authentic_use_adle_preparation_immutable before update or delete
  on public.authentic_use_adle_preparations for each row execute function public.reject_writing_fact_update();
alter table public.authentic_use_adle_reviews add column preparation_id uuid unique
  references public.authentic_use_adle_preparations(id) on delete restrict;

create function public.authentic_use_adle_facts(p_review_session_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare source public.adle_review_context_sources%rowtype;
begin
  select * into source from public.adle_review_context_sources where review_session_id=p_review_session_id;
  if source.id is null then return '{}'::jsonb; end if;
  return jsonb_build_object(
    'source',to_jsonb(source),
    'runtime',(select to_jsonb(r) from public.authentic_use_adle_runtime r where r.singleton),
    'control',(select to_jsonb(c) from public.authentic_use_controls c where c.child_id=source.child_id and c.parent_user_id=source.parent_user_id),
    'review',(select to_jsonb(r) from public.authentic_use_adle_reviews r where r.source_id=source.id),
    'receipt',(select to_jsonb(r) from public.adle_review_parent_reviews r where r.review_session_id=p_review_session_id),
    'historical_grant',(select to_jsonb(g) from public.authentic_use_historical_grants g
      where g.source_type='adle_review' and g.source_id=source.id and g.source_hash=source.source_hash),
    'job',(select to_jsonb(j) from public.adle_review_context_jobs j where j.source_id=source.id),
    'context_findings',coalesce((select jsonb_agg(to_jsonb(f) order by f.id) from public.adle_review_context_findings f
      where f.source_id=source.id),'[]'::jsonb),
    'context_decisions',coalesce((select jsonb_agg(to_jsonb(d) order by d.id) from public.adle_review_context_decisions d
      where d.source_id=source.id),'[]'::jsonb),
    'context_attempts',coalesce((select jsonb_agg(jsonb_build_object('window_fingerprint',a.window_fingerprint,
      'result_status',a.result_status) order by a.id) from public.adle_review_context_attempts a
      where a.source_id=source.id),'[]'::jsonb),
    'parent_issues',coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from public.adle_review_parent_issue_links i
      where i.review_session_id=p_review_session_id),'[]'::jsonb));
end $$;
create function public.load_adle_authentic_use_review(p_review_session_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare facts jsonb;
begin
  facts:=public.authentic_use_adle_facts(p_review_session_id);
  return jsonb_build_object('facts',facts,'fingerprint',md5(facts::text));
end $$;
revoke all on function public.authentic_use_adle_facts(uuid),public.load_adle_authentic_use_review(uuid)
  from public,anon,authenticated;
grant execute on function public.authentic_use_adle_facts(uuid),public.load_adle_authentic_use_review(uuid)
  to service_role;

create function public.authentic_use_utf16_prefix(p_text text,p_offset integer) returns text
language plpgsql immutable strict set search_path=public,pg_temp as $$
declare low integer:=0; high integer:=char_length(p_text); middle integer; prefix text;
begin
  if p_offset<0 then raise exception 'ADLE_AUTHENTIC_USE_SPAN_INVALID'; end if;
  while low<high loop
    middle:=(low+high+1)/2;
    if public.context_utf16_length(left(p_text,middle))<=p_offset then low:=middle;
    else high:=middle-1; end if;
  end loop;
  prefix:=left(p_text,low);
  if public.context_utf16_length(prefix)<>p_offset then raise exception 'ADLE_AUTHENTIC_USE_SPAN_INVALID'; end if;
  return prefix;
end $$;
revoke all on function public.authentic_use_utf16_prefix(text,integer) from public,anon,authenticated;
grant execute on function public.authentic_use_utf16_prefix(text,integer) to service_role;

create function public.prepare_adle_authentic_use_review(
  p_review_session_id uuid,p_parent_user_id uuid,p_child_id uuid,p_fingerprint text,
  p_preview jsonb,p_occurrences jsonb,p_manual_review boolean) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare source public.adle_review_context_sources%rowtype;
  ctrl public.authentic_use_controls%rowtype;
  facts jsonb; item jsonb; candidate jsonb; occurrence_id text; id_out uuid;
  start_pos integer; end_pos integer; observed text;
begin
  perform pg_advisory_xact_lock(hashtextextended('authentic-use-parent:'||p_parent_user_id::text,0));
  select * into source from public.adle_review_context_sources where review_session_id=p_review_session_id for share;
  select * into ctrl from public.authentic_use_controls where child_id=p_child_id and parent_user_id=p_parent_user_id for share;
  facts:=public.authentic_use_adle_facts(p_review_session_id);
  if source.id is null or source.parent_user_id<>p_parent_user_id or source.child_id<>p_child_id
    or ctrl.mode<>'enabled' or (facts#>>'{runtime,enabled}')<>'true' or md5(facts::text)<>p_fingerprint
    or source.source_hash<>encode(extensions.digest(convert_to(source.submitted_text,'UTF8'),'sha256'),'hex')
    or exists(select 1 from public.adle_review_parent_reviews r where r.review_session_id=p_review_session_id)
    or exists(select 1 from public.authentic_use_adle_reviews r where r.source_id=source.id)
    then raise exception 'ADLE_AUTHENTIC_USE_SOURCE_INELIGIBLE'; end if;
  if jsonb_typeof(p_preview)<>'object' or p_preview->>'policyVersion'<>'FIRST_SUBMISSION_AUTHENTIC_USE_V1_2026_10_05'
    or p_preview->>'snapshotId'<>source.id::text or jsonb_typeof(p_occurrences)<>'array'
    or jsonb_typeof(p_preview->'candidates')<>'array' then raise exception 'ADLE_AUTHENTIC_USE_PREVIEW_INVALID'; end if;
  if coalesce((p_preview->>'requiresManualReview')::boolean,true) and not p_manual_review
    then raise exception 'ADLE_AUTHENTIC_USE_MANUAL_REVIEW_REQUIRED'; end if;
  if (facts#>>'{job,status}')='failed' and not p_manual_review
    then raise exception 'ADLE_AUTHENTIC_USE_MANUAL_REVIEW_REQUIRED'; end if;
  if (facts#>>'{job,status}') not in ('complete','failed')
    or exists(select 1 from jsonb_array_elements(facts->'parent_issues') i where i->>'resolution_status'='needs_route')
    or ((facts#>>'{job,status}')='complete' and exists(select 1 from jsonb_array_elements(facts->'context_findings') f
      where not exists(select 1 from jsonb_array_elements(facts->'context_decisions') d
        where d->>'finding_id'=f->>'id' and d->>'action' in ('confirm','dismiss')))
    ) then raise exception 'ADLE_AUTHENTIC_USE_FINDINGS_PENDING'; end if;
  for item in select value from jsonb_array_elements(p_occurrences) loop
    start_pos:=(item->>'startUtf16')::integer; end_pos:=(item->>'endUtf16')::integer;
    observed:=item->>'observed';
    if item->>'id' is null or start_pos<0 or end_pos<=start_pos
      or substring(source.submitted_text from char_length(public.authentic_use_utf16_prefix(source.submitted_text,start_pos))+1
        for char_length(observed))<>observed
      or public.context_utf16_length(public.authentic_use_utf16_prefix(source.submitted_text,start_pos)||observed)<>end_pos
      then raise exception 'ADLE_AUTHENTIC_USE_OCCURRENCE_SCOPE'; end if;
  end loop;
  for candidate in select value from jsonb_array_elements(p_preview->'candidates') loop
    if jsonb_array_length(candidate->'occurrenceIds')<1 then raise exception 'ADLE_AUTHENTIC_USE_CANDIDATE_EMPTY'; end if;
    for occurrence_id in select value from jsonb_array_elements_text(candidate->'occurrenceIds') loop
      if not exists(select 1 from jsonb_array_elements(p_occurrences) o
        where o->>'id'=occurrence_id
          and lower(replace(replace(normalize(o->>'observed',NFC),'’',''''),'ʼ',''''))=candidate->>'wordKey')
        then raise exception 'ADLE_AUTHENTIC_USE_CANDIDATE_SCOPE'; end if;
    end loop;
  end loop;
  insert into public.authentic_use_adle_preparations(review_session_id,source_id,source_hash,parent_user_id,
    child_id,facts_fingerprint,preview,occurrences,manual_review)
  values(p_review_session_id,source.id,source.source_hash,p_parent_user_id,p_child_id,p_fingerprint,
    p_preview,p_occurrences,p_manual_review) returning id into id_out;
  return id_out;
end $$;
revoke all on function public.prepare_adle_authentic_use_review(uuid,uuid,uuid,text,jsonb,jsonb,boolean)
  from public,anon,authenticated;
grant execute on function public.prepare_adle_authentic_use_review(uuid,uuid,uuid,text,jsonb,jsonb,boolean)
  to service_role;

create function public.finalise_adle_authentic_use_review(
  p_review_session_id uuid,p_parent_user_id uuid,p_child_id uuid,p_preparation_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare source public.adle_review_context_sources%rowtype;
  prep public.authentic_use_adle_preparations%rowtype;
  review_id uuid; credit_id uuid; candidate jsonb; inserted_count integer:=0; awards_allowed boolean;
begin
  if auth.uid() is not null and auth.uid()<>p_parent_user_id then raise exception 'ADLE_AUTHENTIC_USE_PARENT_OWNERSHIP'; end if;
  if not exists(select 1 from public.authentic_use_adle_runtime where singleton and enabled)
    then raise exception 'ADLE_AUTHENTIC_USE_RUNTIME_DISABLED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('authentic-use-parent:'||p_parent_user_id::text,0));
  select * into source from public.adle_review_context_sources where review_session_id=p_review_session_id for update;
  if source.id is null or source.parent_user_id<>p_parent_user_id or source.child_id<>p_child_id
    then raise exception 'ADLE_AUTHENTIC_USE_PARENT_OWNERSHIP'; end if;
  if exists(select 1 from public.adle_review_parent_reviews where review_session_id=p_review_session_id)
    then return jsonb_build_object('status','duplicate','credits',0); end if;
  select * into prep from public.authentic_use_adle_preparations where id=p_preparation_id
    and review_session_id=p_review_session_id and source_id=source.id and source_hash=source.source_hash
    and parent_user_id=p_parent_user_id and child_id=p_child_id;
  if prep.id is null or prep.created_at<now()-interval '10 minutes'
    or prep.facts_fingerprint<>md5(public.authentic_use_adle_facts(p_review_session_id)::text)
    then raise exception 'ADLE_AUTHENTIC_USE_STALE_REVIEW'; end if;
  insert into public.authentic_use_adle_reviews(review_session_id,source_id,source_hash,parent_user_id,child_id,
    preview,manual_review,policy_version,preparation_id)
  values(p_review_session_id,source.id,source.source_hash,p_parent_user_id,p_child_id,prep.preview,
    prep.manual_review,prep.preview->>'policyVersion',prep.id) returning id into review_id;
  select exists(select 1 from public.authentic_use_controls c where c.child_id=p_child_id
    and c.parent_user_id=p_parent_user_id and c.mode='enabled'
    and (source.submitted_at>=c.activation_cutoff or exists(select 1 from public.authentic_use_historical_grants g
      where g.source_type='adle_review' and g.source_id=source.id and g.source_hash=source.source_hash)))
    into awards_allowed;
  for candidate in select value from jsonb_array_elements(case when awards_allowed
    then prep.preview->'candidates' else '[]'::jsonb end) loop
    insert into public.authentic_use_credits(adle_review_id,adle_source_id,parent_user_id,child_id,
      word_key,observed_word,occurrence_ids,supplied_spelling,occurred_at,verified_at)
    values(review_id,source.id,p_parent_user_id,p_child_id,candidate->>'wordKey',candidate->>'observedWord',
      array(select jsonb_array_elements_text(candidate->'occurrenceIds')),
      (candidate->>'suppliedSpelling')::boolean,source.submitted_at,now()) returning id into credit_id;
    insert into public.authentic_use_deliveries(credit_id,consumer,parent_user_id,child_id)
      values(credit_id,'gold',p_parent_user_id,p_child_id),(credit_id,'proficiency',p_parent_user_id,p_child_id);
    inserted_count:=inserted_count+1;
  end loop;
  insert into public.adle_review_parent_reviews(review_session_id,parent_user_id,child_id,reviewed_by_user_id)
    values(p_review_session_id,p_parent_user_id,p_child_id,p_parent_user_id);
  return jsonb_build_object('status','finalised','review_id',review_id,'credits',inserted_count);
end $$;
revoke all on function public.finalise_adle_authentic_use_review(uuid,uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.finalise_adle_authentic_use_review(uuid,uuid,uuid,uuid)
  to service_role;

create function public.guard_adle_authentic_use_inspection() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists(select 1 from public.authentic_use_adle_runtime where singleton and enabled)
    and exists(select 1 from public.authentic_use_controls c where c.child_id=new.child_id
    and c.parent_user_id=new.parent_user_id and c.mode='enabled')
    and exists(select 1 from public.adle_review_context_sources s where s.review_session_id=new.review_session_id)
    and not exists(select 1 from public.authentic_use_adle_reviews r where r.review_session_id=new.review_session_id)
    then raise exception 'ADLE_AUTHENTIC_USE_ATOMIC_INSPECTION_REQUIRED'; end if;
  return new;
end $$;
create trigger guard_adle_authentic_use_inspection before insert on public.adle_review_parent_reviews
  for each row execute function public.guard_adle_authentic_use_inspection();

-- The proficiency consumer uses a source-specific piece key. Prompted Review
-- events remain separate and unverified; this never rewrites Review outcomes.
create or replace function public.stage_authentic_use_proficiency(p_credit_id uuid,p_claim_token uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.authentic_use_deliveries%rowtype; credit public.authentic_use_credits%rowtype;
begin
  select * into d from public.authentic_use_deliveries where credit_id=p_credit_id and consumer='proficiency' for update;
  if d.status<>'processing' or d.claim_token is distinct from p_claim_token then raise exception 'AUTHENTIC_USE_DELIVERY_LEASE'; end if;
  if not exists(select 1 from public.authentic_use_controls where child_id=d.child_id and parent_user_id=d.parent_user_id and mode='enabled' and proficiency_enabled) then raise exception 'AUTHENTIC_USE_CONSUMER_DISABLED'; end if;
  select * into credit from public.authentic_use_credits where id=p_credit_id;
  if credit.canonical_word_id is null then
    update public.authentic_use_deliveries set status='ineligible',reason='WORD_UNMAPPED',claim_token=null,delivered_at=now() where credit_id=p_credit_id and consumer='proficiency';
    return jsonb_build_object('status','ineligible');
  end if;
  insert into public.adle_authentic_use_events(child_id,canonical_word_id,occurred_on,verified_at,use_kind,parent_verified,piece_ref,source_ref,row_status,provenance_kind,writing_submitted_at,provenance)
    values(credit.child_id,credit.canonical_word_id,(credit.occurred_at at time zone 'Europe/London')::date,credit.verified_at,'authentic_correct_use',true,
      case when credit.adle_source_id is not null then 'adle-authentic-use:'||credit.adle_source_id::text
        else 'first-submission:'||credit.chain_id::text end,
      'authentic-use:'||credit.id::text,'active',
      case when credit.supplied_spelling then 'parent_verified_supplied_spelling_application' else 'independent_or_parent_verified_application' end,credit.occurred_at,
      jsonb_build_object('authentic_use_credit_id',credit.id,'supplied_spelling',credit.supplied_spelling,
        'authorship','child_original_writing','context_outcome','parent_verified','policy_version',
        'FIRST_SUBMISSION_AUTHENTIC_USE_V1_2026_10_05')) on conflict do nothing;
  return jsonb_build_object('status','staged','canonical_word_id',credit.canonical_word_id);
end $$;

-- The existing lesson atomic action accepts only an exact historical grant for
-- its original first attempt; the ordinary activation cutoff remains intact.
create or replace function public.finalise_authentic_use_parent_action(p_submission_id uuid,p_preparation_id uuid,p_action text,p_parent_note text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.task_submissions%rowtype; chain public.authentic_use_submission_chains%rowtype;
  ctrl public.authentic_use_controls%rowtype; prep public.authentic_use_review_preparations%rowtype;
  snapshot public.writing_source_snapshots%rowtype; review_id uuid; candidate jsonb; credit_id uuid;
  result jsonb; review_was_existing boolean; historical boolean;
begin
  select * into s from public.task_submissions where id=p_submission_id;
  if s.id is null or auth.uid() is null or auth.uid()<>s.parent_user_id then raise exception 'AUTHENTIC_USE_PARENT_OWNERSHIP'; end if;
  if p_action not in ('approved','returned') then raise exception 'AUTHENTIC_USE_ACTION_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('authentic-use-parent:'||s.parent_user_id::text,0));
  select * into s from public.task_submissions where id=p_submission_id for update;
  select * into chain from public.authentic_use_submission_chains where id=s.authentic_use_chain_id for update;
  select * into ctrl from public.authentic_use_controls where child_id=s.child_id and parent_user_id=s.parent_user_id for share;
  if ctrl.child_id is null or ctrl.mode='off' then raise exception 'AUTHENTIC_USE_CONTROL_DISABLED'; end if;
  select id into review_id from public.authentic_use_reviews where chain_id=chain.id;
  review_was_existing:=review_id is not null;
  if review_id is null then
    select * into prep from public.authentic_use_review_preparations where id=p_preparation_id
      and submission_id=s.id and parent_user_id=auth.uid() and child_id=s.child_id;
    if prep.id is null or prep.created_at<now()-interval '10 minutes'
      or prep.facts_fingerprint<>md5(public.authentic_use_review_facts(s.id)::text)
      then raise exception 'AUTHENTIC_USE_STALE_REVIEW'; end if;
    select * into snapshot from public.writing_source_snapshots where submission_id=chain.first_submission_id;
    select exists(select 1 from public.authentic_use_historical_grants g
      where g.source_type='course_lesson' and g.source_id=snapshot.id
        and g.parent_user_id=s.parent_user_id and g.child_id=s.child_id
        and g.source_hash=encode(extensions.digest(convert_to(snapshot.envelope::text,'UTF8'),'sha256'),'hex'))
      into historical;
    insert into public.authentic_use_reviews(chain_id,snapshot_id,parent_user_id,child_id,parent_action,mode,preview,manual_review,policy_version)
      values(chain.id,snapshot.id,s.parent_user_id,s.child_id,p_action,ctrl.mode,prep.preview,
        prep.manual_review,prep.preview->>'policyVersion') returning id into review_id;
    if ctrl.mode='enabled' and s.id=chain.first_submission_id
      and (snapshot.occurred_at>=ctrl.activation_cutoff or historical) then
      for candidate in select value from jsonb_array_elements(prep.preview->'candidates') loop
        if exists(select 1 from jsonb_array_elements_text(candidate->'occurrenceIds') i where not exists(
          select 1 from public.writing_occurrences o where o.id=i.value and o.snapshot_id=snapshot.id
            and o.provenance='learner_response')) then raise exception 'AUTHENTIC_USE_OCCURRENCE_SCOPE'; end if;
        insert into public.authentic_use_credits(review_id,chain_id,snapshot_id,parent_user_id,child_id,
          word_key,observed_word,occurrence_ids,supplied_spelling,occurred_at,verified_at)
        values(review_id,chain.id,snapshot.id,s.parent_user_id,s.child_id,candidate->>'wordKey',
          candidate->>'observedWord',array(select jsonb_array_elements_text(candidate->'occurrenceIds')),
          (candidate->>'suppliedSpelling')::boolean,snapshot.occurred_at,now()) returning id into credit_id;
        insert into public.authentic_use_deliveries(credit_id,consumer,parent_user_id,child_id)
          values(credit_id,'gold',s.parent_user_id,s.child_id),
            (credit_id,'proficiency',s.parent_user_id,s.child_id);
      end loop;
    end if;
  end if;
  if p_action='approved' then result:=public.approve_task_submission_with_reason_drafts(s.id,s.parent_user_id,s.child_id);
  else
    if s.parent_review_status='approved' then raise exception 'AUTHENTIC_USE_ALREADY_APPROVED'; end if;
    update public.task_submissions set parent_review_status='returned',parent_review_note=p_parent_note,
      parent_reviewed_at=now() where id=s.id;
    result:=jsonb_build_object('submission_id',s.id,'returned',true);
  end if;
  insert into public.authentic_use_review_action_events(parent_user_id,child_id,submission_id,review_id,action,outcome)
    values(s.parent_user_id,s.child_id,s.id,review_id,p_action,
      case when s.id<>chain.first_submission_id then 'RETRY_NO_CREDIT'
        when review_was_existing then 'DUPLICATE_SUPPRESSED' else 'FINALISED' end);
  return result||jsonb_build_object('authentic_use_review_id',review_id);
end $$;

commit;
