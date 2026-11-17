begin;

-- Editorial requests are independent of governed word-skill approvals.
create table public.teaching_dictionary_lesson_review_requests (
  environment_key text not null check (environment_key in ('staging', 'production')),
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key),
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
  sense_id text,
  request_id uuid not null,
  requested_by uuid not null references auth.users(id),
  requested_at timestamptz not null default now(),
  primary key (environment_key, micro_skill_key, canonical_word_id, request_id)
);
alter table public.teaching_dictionary_lesson_review_requests enable row level security;
revoke all on public.teaching_dictionary_lesson_review_requests from public, anon, authenticated;
grant select, insert on public.teaching_dictionary_lesson_review_requests to service_role;

create index teaching_dictionary_review_requests_by_word
  on public.teaching_dictionary_lesson_review_requests (environment_key, canonical_word_id);
create index teaching_dictionary_csv_requests_by_lesson
  on public.teaching_dictionary_multi_sense_csv_skill_requests (micro_skill_key, canonical_word_id, request_id);
create index teaching_dictionary_import_handoffs_by_lesson
  on public.teaching_dictionary_import_candidate_handoffs (environment_key, micro_skill_key, canonical_word_id);

create function public.teaching_dictionary_lesson_review_queue(p_environment text, p_skill text, p_word uuid default null)
returns table (word_id uuid, word text, sense_id text, micro_skill_key text)
language sql stable security invoker set search_path = public, pg_temp as $$
  with sources as (
    select canonical_word_id, micro_skill_key, sense_id, requested_at as at
    from public.teaching_dictionary_lesson_review_requests
    where environment_key=p_environment and (p_skill is null or micro_skill_key=p_skill)
      and (p_word is null or canonical_word_id=p_word)
    union all
    select h.canonical_word_id, h.micro_skill_key, h.sense_id, h.queued_at
    from public.teaching_dictionary_import_candidate_handoffs h
    where h.environment_key=p_environment and (p_skill is null or h.micro_skill_key=p_skill)
      and (p_word is null or h.canonical_word_id=p_word)
    union all
    select s.canonical_word_id, s.micro_skill_key, s.sense_id, r.reviewed_at
    from public.teaching_dictionary_multi_sense_csv_skill_requests s
    join public.teaching_dictionary_multi_sense_csv_requests r using(request_id)
    where (p_skill is null or s.micro_skill_key=p_skill) and (p_word is null or s.canonical_word_id=p_word)
    union all
    select a.canonical_word_id, tag.micro_skill_key, d.payload->'senseSet'->'senses'->0->>'id', a.published_at
    from public.teaching_dictionary_manager_publications a
    join public.teaching_dictionary_manager_drafts d on d.id=a.draft_id
    cross join lateral jsonb_array_elements_text(case when jsonb_typeof(d.payload->'requestedSkillKeys')='array'
      then d.payload->'requestedSkillKeys' else '[]'::jsonb end) tag(micro_skill_key)
    where d.source_reference like 'CSV batch %'
      and jsonb_typeof(d.payload->'requestedSkillKeys')='array'
      and (p_skill is null or d.payload->'requestedSkillKeys' ? p_skill)
      and (p_skill is null or tag.micro_skill_key=p_skill)
      and (p_word is null or a.canonical_word_id=p_word)
  ), latest as (
    select canonical_word_id, micro_skill_key, max(at) as at from sources group by canonical_word_id, micro_skill_key
  )
  select w.id, w.display_word,
    case when count(distinct s.sense_id)=1 and bool_and(s.sense_id is not null) then min(s.sense_id) end, l.micro_skill_key
  from latest l
  join sources s on s.canonical_word_id=l.canonical_word_id and s.micro_skill_key=l.micro_skill_key and s.at=l.at
  join public.canonical_teaching_dictionary_words w on w.id=l.canonical_word_id and w.row_status='active'
  where p_environment in ('staging', 'production') and (p_skill is not null or p_word is not null)
    and not exists (
      select 1 from public.teaching_dictionary_bulk_review_exclusions x
      where x.environment_key=p_environment and x.micro_skill_key=l.micro_skill_key and x.canonical_word_id=w.id
        and x.reviewed_at >= l.at
    )
    and not exists (
      select 1 from public.teaching_dictionary_pair_latest_decisions d
      join public.teaching_dictionary_pair_decision_events e on e.id=d.id
      where d.environment_key=p_environment and d.micro_skill_key=l.micro_skill_key and d.canonical_word_id=w.id
        and d.action='deassign' and e.decided_at >= l.at
    )
  group by w.id, w.display_word, l.micro_skill_key
  order by w.id, l.micro_skill_key;
$$;
revoke all on function public.teaching_dictionary_lesson_review_queue(text,text,uuid) from public, anon, authenticated;
grant execute on function public.teaching_dictionary_lesson_review_queue(text,text,uuid) to service_role;

notify pgrst,'reload schema';
commit;
