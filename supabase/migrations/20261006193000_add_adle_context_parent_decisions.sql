-- Parent decisions are append-only; final decisions are unique per finding.
create table public.adle_review_context_decisions (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.adle_review_context_findings(id) on delete restrict,
  source_id uuid not null references public.adle_review_context_sources(id) on delete restrict,
  parent_user_id uuid not null references auth.users(id) on delete restrict,
  child_id uuid not null references public.children(id) on delete restrict,
  action text not null check(action in ('edit','dismiss','confirm')),
  intended_word text,
  created_at timestamptz not null default clock_timestamp(),
  check ((action='dismiss')=(intended_word is null))
);
create unique index adle_review_context_terminal_decision on public.adle_review_context_decisions(finding_id)
  where action in ('dismiss','confirm');
create index adle_review_context_decisions_finding on public.adle_review_context_decisions(finding_id,created_at desc);
alter table public.adle_review_context_decisions enable row level security;
revoke all on public.adle_review_context_decisions from public,anon,authenticated;
grant select on public.adle_review_context_decisions to service_role;
create trigger adle_review_context_decision_immutable before update or delete
  on public.adle_review_context_decisions for each row execute function public.reject_writing_fact_update();

create table public.adle_review_context_catalog_cases (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null unique references public.adle_review_context_decisions(id) on delete restrict,
  child_id uuid not null references public.children(id) on delete restrict,
  observed_normalized text not null,
  intended_normalized text not null,
  case_status text not null default 'open' check(case_status in ('open','reviewed','dismissed')),
  created_at timestamptz not null default clock_timestamp()
);
alter table public.adle_review_context_catalog_cases enable row level security;
revoke all on public.adle_review_context_catalog_cases from public,anon,authenticated;
grant select on public.adle_review_context_catalog_cases to service_role;

create function public.record_adle_review_context_decision(
  p_finding_id uuid,p_parent_user_id uuid,p_child_id uuid,p_action text,p_intended_word text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare f public.adle_review_context_findings%rowtype;
  s public.adle_review_context_sources%rowtype;
  j public.adle_review_context_jobs%rowtype;
  d public.adle_review_context_decisions%rowtype;
  v_observed text; v_intended text; v_skill text; v_id uuid;
begin
  if auth.uid() is not null and auth.uid()<>p_parent_user_id then
    raise exception 'adle_context_parent_scope_invalid'; end if;
  select * into f from public.adle_review_context_findings where id=p_finding_id for update;
  select * into s from public.adle_review_context_sources where id=f.source_id;
  select * into j from public.adle_review_context_jobs where source_id=s.id;
  if f.id is null or s.id is null or j.status<>'complete'
    or s.parent_user_id<>p_parent_user_id or s.child_id<>p_child_id
    or s.source_hash<>f.source_hash or s.source_hash<>
      encode(extensions.digest(convert_to(s.submitted_text,'UTF8'),'sha256'),'hex')
    or left(s.submitted_text,char_length(f.prefix_text))<>f.prefix_text
    or substring(s.submitted_text from char_length(f.prefix_text)+1
      for char_length(f.observed_text))<>f.observed_text
    or public.context_utf16_length(f.prefix_text)<>f.start_utf16
    or public.context_utf16_length(f.prefix_text||f.observed_text)<>f.end_utf16
    or not exists(select 1 from public.adle_review_sessions r
      where r.id=s.review_session_id and r.child_id=s.child_id
        and r.parent_user_id=s.parent_user_id and r.completed_at is not null)
    or exists(select 1 from public.adle_review_parent_reviews r where r.review_session_id=s.review_session_id)
    then raise exception 'adle_context_finding_not_reviewable'; end if;
  select * into d from public.adle_review_context_decisions where finding_id=f.id
    and action in ('dismiss','confirm');
  if d.id is not null then
    if d.action=p_action then return jsonb_build_object('decision_id',d.id,'action',d.action,'replayed',true); end if;
    raise exception 'adle_context_decision_terminal';
  end if;
  if p_action not in ('edit','dismiss','confirm') then raise exception 'adle_context_action_invalid'; end if;
  if p_action<>'dismiss' and (p_intended_word is null or length(p_intended_word)>60
    or p_intended_word !~ '^[[:alpha:]][[:alpha:]''-]*$') then
    raise exception 'adle_context_replacement_invalid'; end if;
  v_observed:=lower(replace(replace(f.observed_text,'’',chr(39)),'ʼ',chr(39)));
  v_intended:=lower(replace(replace(p_intended_word,'’',chr(39)),'ʼ',chr(39)));
  if p_action<>'dismiss' and v_observed=v_intended then
    raise exception 'adle_context_replacement_unchanged'; end if;
  insert into public.adle_review_context_decisions(finding_id,source_id,parent_user_id,child_id,
    action,intended_word) values(f.id,s.id,p_parent_user_id,p_child_id,p_action,
      case when p_action='dismiss' then null else p_intended_word end) returning id into v_id;
  if p_action='confirm' then
    select pair.micro_skill_key into v_skill from public.contextual_micro_skill_pairs pair
      where pair.dialect_code='en-GB' and pair.member_a=least(v_observed,v_intended)
        and pair.member_b=greatest(v_observed,v_intended);
    if v_skill is null then
      insert into public.adle_review_context_catalog_cases(decision_id,child_id,
        observed_normalized,intended_normalized)
        values(v_id,p_child_id,v_observed,v_intended);
    else
      perform public.reconcile_contextual_micro_skill_demand(p_child_id,v_skill);
    end if;
  end if;
  return jsonb_build_object('decision_id',v_id,'action',p_action,'micro_skill_key',v_skill);
end $$;
revoke all on function public.record_adle_review_context_decision(uuid,uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.record_adle_review_context_decision(uuid,uuid,uuid,text,text)
  to service_role;

-- The Review Work receipt is the archive boundary. Guard it in the database
-- as well as the UI so a stale page cannot finish while a scan is pending.
create function public.guard_adle_context_before_parent_inspection() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.adle_review_context_sources%rowtype;
  j public.adle_review_context_jobs%rowtype;
begin
  select * into s from public.adle_review_context_sources where review_session_id=new.review_session_id;
  if s.id is null then return new; end if;
  select * into j from public.adle_review_context_jobs where source_id=s.id;
  if s.capture_mode='disabled' and j.id is null then return new; end if;
  if j.id is null or j.status in ('pending','processing','deferred') then
    raise exception 'ADLE_CONTEXT_ANALYSIS_PENDING'; end if;
  if j.status='complete' and exists(select 1 from public.adle_review_context_findings f
      where f.source_id=s.id and not exists(select 1 from public.adle_review_context_decisions d
        where d.finding_id=f.id and d.action in ('confirm','dismiss'))) then
    raise exception 'ADLE_CONTEXT_DECISIONS_PENDING'; end if;
  return new;
end $$;
create trigger guard_adle_context_parent_inspection before insert on public.adle_review_parent_reviews
  for each row execute function public.guard_adle_context_before_parent_inspection();
revoke all on function public.guard_adle_context_before_parent_inspection() from public,anon,authenticated;
