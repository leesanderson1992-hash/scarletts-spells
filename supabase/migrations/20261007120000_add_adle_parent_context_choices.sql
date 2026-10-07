-- Parent observations are separate from immutable AI findings and learner outcomes.
create table public.adle_review_parent_context_choices (
  id uuid primary key default gen_random_uuid(),
  review_session_id uuid not null references public.adle_review_sessions(id) on delete restrict,
  parent_user_id uuid not null references auth.users(id) on delete restrict,
  child_id uuid not null references public.children(id) on delete restrict,
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  start_utf16 integer not null,
  end_utf16 integer not null,
  observed_text text not null,
  intended_word text not null,
  sentence_excerpt text not null,
  decision text not null default 'pending' check (decision in ('pending','confirmed','dismissed')),
  created_at timestamptz not null default clock_timestamp(),
  decided_at timestamptz,
  unique (review_session_id,start_utf16,end_utf16),
  check (start_utf16 >= 0 and end_utf16 > start_utf16),
  check (length(trim(observed_text)) between 1 and 60 and length(trim(intended_word)) between 1 and 60)
);
create index adle_review_parent_context_choices_session
  on public.adle_review_parent_context_choices(review_session_id,start_utf16);
alter table public.adle_review_parent_context_choices enable row level security;
revoke all on public.adle_review_parent_context_choices from public,anon,authenticated;
grant select,insert,update on public.adle_review_parent_context_choices to service_role;

create function public.validate_adle_parent_context_choice() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.adle_review_sessions%rowtype;
begin
  select * into s from public.adle_review_sessions where id=new.review_session_id;
  if s.id is null or s.parent_user_id<>new.parent_user_id or s.child_id<>new.child_id
    or s.stage<>'completed' or s.submitted_writing_text is null
    or exists(select 1 from public.adle_review_parent_reviews r where r.review_session_id=s.id)
    or new.source_hash<>encode(extensions.digest(convert_to(s.submitted_writing_text,'UTF8'),'sha256'),'hex')
  then raise exception 'ADLE_PARENT_CONTEXT_SOURCE_MISMATCH'; end if;
  if tg_op='UPDATE' and (new.review_session_id,new.parent_user_id,new.child_id,new.source_hash,
    new.start_utf16,new.end_utf16,new.observed_text,new.intended_word,new.sentence_excerpt,new.created_at)
    is distinct from (old.review_session_id,old.parent_user_id,old.child_id,old.source_hash,
    old.start_utf16,old.end_utf16,old.observed_text,old.intended_word,old.sentence_excerpt,old.created_at)
  then raise exception 'ADLE_PARENT_CONTEXT_IMMUTABLE'; end if;
  if new.decision<>'pending' then new.decided_at:=clock_timestamp(); end if;
  return new;
end $$;
create trigger validate_adle_parent_context_choice_trigger before insert or update
  on public.adle_review_parent_context_choices for each row
  execute function public.validate_adle_parent_context_choice();
revoke all on function public.validate_adle_parent_context_choice() from public,anon,authenticated;

-- Include parent choices in the authentic-use fingerprint and blocked-word evidence.
create or replace function public.authentic_use_adle_facts(p_review_session_id uuid) returns jsonb
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
    'parent_context_choices',coalesce((select jsonb_agg(to_jsonb(choice) order by choice.id)
      from public.adle_review_parent_context_choices choice
      where choice.review_session_id=p_review_session_id),'[]'::jsonb),
    'parent_issues',coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from public.adle_review_parent_issue_links i
      where i.review_session_id=p_review_session_id),'[]'::jsonb));
end $$;
