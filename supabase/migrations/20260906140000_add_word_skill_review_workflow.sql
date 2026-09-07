-- S4: immutable candidate/review receipts feeding the existing publication source.
create table public.adle_word_skill_review_controls (
  environment_key text primary key check(environment_key in ('local','staging','production')),
  review_enabled boolean not null default false,
  publication_enabled boolean not null default false,
  withdrawal_enabled boolean not null default false
);
insert into public.adle_word_skill_review_controls(environment_key) values('local'),('staging'),('production');
create table public.adle_word_skill_candidate_packages (
  id uuid primary key default gen_random_uuid(),
  package_key text not null unique check(length(btrim(package_key)) between 1 and 120),
  environment_key text not null references public.adle_word_skill_review_controls(environment_key),
  candidates jsonb not null check(jsonb_typeof(candidates)='array' and jsonb_array_length(candidates) between 1 and 1000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.adle_word_skill_package_reviews (
  package_id uuid primary key references public.adle_word_skill_candidate_packages(id),
  decisions jsonb not null check(jsonb_typeof(decisions)='array'),
  reviewed_by uuid not null references auth.users(id),
  review_note text not null check(length(btrim(review_note)) between 1 and 2000),
  reviewed_at timestamptz not null default now()
);
create table public.adle_word_skill_package_publications (
  package_id uuid primary key references public.adle_word_skill_package_reviews(package_id),
  release_id uuid not null unique references public.adle_reviewed_word_skill_releases(id),
  published_by uuid not null references auth.users(id),
  authority_fingerprint text not null check(length(btrim(authority_fingerprint))>0),
  published_at timestamptz not null default now()
);
create trigger word_skill_package_immutable before update on public.adle_word_skill_candidate_packages for each row execute function public.reject_writing_fact_update();
create trigger word_skill_review_immutable before update on public.adle_word_skill_package_reviews for each row execute function public.reject_writing_fact_update();
create trigger word_skill_publication_immutable before update on public.adle_word_skill_package_publications for each row execute function public.reject_writing_fact_update();

create function public.create_word_skill_candidate_package(p_key text,p_environment text,p_candidates jsonb,p_actor uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare existing public.adle_word_skill_candidate_packages%rowtype; candidate jsonb; v_id uuid;
begin
  if not exists(select 1 from adle_word_skill_review_controls where environment_key=p_environment and review_enabled) then raise exception 'WORD_SKILL_REVIEW_DISABLED'; end if;
  if jsonb_typeof(p_candidates) is distinct from 'array' or jsonb_array_length(p_candidates) not between 1 and 1000 then raise exception 'WORD_SKILL_PACKAGE_INVALID'; end if;
  for candidate in select value from jsonb_array_elements(p_candidates) loop
    if jsonb_typeof(candidate) is distinct from 'object'
      or coalesce(candidate->>'relationshipRole','') not in ('demonstrates','contrast_only','diagnostic_only','negative_only','non_positive')
      or coalesce(candidate->>'method','') not in ('existing_authority','deterministic_candidate','batch_ai_candidate')
      or length(btrim(coalesce(candidate->>'sourceReference',''))) not between 1 and 2000
      or length(btrim(coalesce(candidate->>'licenceReference',''))) not between 1 and 2000
      or not exists(select 1 from canonical_teaching_dictionary_words where id=(candidate->>'canonicalWordId')::uuid and row_status='active')
      or not exists(select 1 from micro_skill_catalog where micro_skill_key=candidate->>'microSkillKey' and is_active)
      then raise exception 'WORD_SKILL_CANDIDATE_INVALID'; end if;
  end loop;
  if (select count(*) from (select distinct value->>'canonicalWordId',value->>'microSkillKey' from jsonb_array_elements(p_candidates)) pairs) <> jsonb_array_length(p_candidates) then raise exception 'WORD_SKILL_DUPLICATE_PAIR'; end if;
  perform pg_advisory_xact_lock(hashtextextended('word-skill-package:'||p_key,0));
  select * into existing from adle_word_skill_candidate_packages where package_key=p_key;
  if existing.id is not null then
    if existing.candidates<>p_candidates or existing.environment_key<>p_environment or existing.created_by<>p_actor then raise exception 'WORD_SKILL_PACKAGE_CONFLICT'; end if;
    return existing.id;
  end if;
  insert into adle_word_skill_candidate_packages(package_key,environment_key,candidates,created_by) values(p_key,p_environment,p_candidates,p_actor) returning id into v_id;
  return v_id;
end $$;

create function public.review_word_skill_candidate_package(p_package uuid,p_environment text,p_decisions jsonb,p_actor uuid,p_note text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare package public.adle_word_skill_candidate_packages%rowtype; existing public.adle_word_skill_package_reviews%rowtype;
begin
  select * into package from adle_word_skill_candidate_packages where id=p_package and environment_key=p_environment for update;
  if package.id is null then raise exception 'WORD_SKILL_PACKAGE_NOT_FOUND'; end if;
  if not exists(select 1 from adle_word_skill_review_controls where environment_key=p_environment and review_enabled) then raise exception 'WORD_SKILL_REVIEW_DISABLED'; end if;
  if jsonb_typeof(p_decisions) is distinct from 'array' or jsonb_array_length(p_decisions)<>jsonb_array_length(package.candidates)
    or exists(select 1 from jsonb_array_elements(p_decisions) d where d not in ('"approved"'::jsonb,'"rejected"'::jsonb)) then raise exception 'WORD_SKILL_REVIEW_INCOMPLETE'; end if;
  select * into existing from adle_word_skill_package_reviews where package_id=p_package;
  if existing.package_id is not null then
    if existing.decisions<>p_decisions or existing.reviewed_by<>p_actor or existing.review_note<>p_note then raise exception 'WORD_SKILL_REVIEW_CONFLICT'; end if;
    return;
  end if;
  insert into adle_word_skill_package_reviews(package_id,decisions,reviewed_by,review_note) values(p_package,p_decisions,p_actor,p_note);
end $$;

create function public.publish_word_skill_candidate_package(p_package uuid,p_environment text,p_actor uuid,p_authority_fingerprint text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare package public.adle_word_skill_candidate_packages%rowtype; review public.adle_word_skill_package_reviews%rowtype; v_release uuid; manifest jsonb;
begin
  select * into package from adle_word_skill_candidate_packages where id=p_package and environment_key=p_environment for update;
  if package.id is null then raise exception 'WORD_SKILL_PACKAGE_NOT_FOUND'; end if;
  if not exists(select 1 from adle_word_skill_review_controls where environment_key=p_environment and publication_enabled) then raise exception 'WORD_SKILL_PUBLICATION_DISABLED'; end if;
  select release_id into v_release from adle_word_skill_package_publications where package_id=p_package;
  if v_release is not null then return v_release; end if;
  select * into review from adle_word_skill_package_reviews where package_id=p_package;
  if review.package_id is null then raise exception 'WORD_SKILL_REVIEW_REQUIRED'; end if;
  select jsonb_build_object('packageId',p_package,'approvedPairs',jsonb_agg(c.value||jsonb_build_object('decision','approved') order by c.ordinality)) into manifest
    from jsonb_array_elements(package.candidates) with ordinality c(value,ordinality) where review.decisions->>(c.ordinality::integer-1)='approved';
  if manifest->'approvedPairs'='null'::jsonb then raise exception 'WORD_SKILL_NO_APPROVED_PAIRS'; end if;
  v_release:=publish_reviewed_word_skill_release('review-package:'||p_package::text,p_environment,manifest,review.reviewed_by,review.review_note);
  insert into adle_word_skill_package_publications(package_id,release_id,published_by,authority_fingerprint) values(p_package,v_release,p_actor,p_authority_fingerprint);
  return v_release;
end $$;

create function public.withdraw_word_skill_reviewed_release(p_release uuid,p_environment text,p_actor uuid,p_reason text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from adle_word_skill_review_controls where environment_key=p_environment and withdrawal_enabled) then raise exception 'WORD_SKILL_WITHDRAWAL_DISABLED'; end if;
  perform 1 from adle_reviewed_word_skill_releases where id=p_release and environment_key=p_environment for update;
  if not found then raise exception 'WORD_SKILL_RELEASE_NOT_FOUND'; end if;
  -- First withdrawal remains the immutable authority; retries never rewrite it.
  insert into adle_reviewed_word_skill_withdrawals(release_id,reviewed_by,reason) values(p_release,p_actor,p_reason) on conflict do nothing;
end $$;

alter table public.adle_word_skill_review_controls enable row level security;
alter table public.adle_word_skill_candidate_packages enable row level security;
alter table public.adle_word_skill_package_reviews enable row level security;
alter table public.adle_word_skill_package_publications enable row level security;
revoke all on public.adle_word_skill_review_controls,public.adle_word_skill_candidate_packages,public.adle_word_skill_package_reviews,public.adle_word_skill_package_publications from anon,authenticated;
grant select,update on public.adle_word_skill_review_controls to service_role;
grant select on public.adle_word_skill_candidate_packages,public.adle_word_skill_package_reviews,public.adle_word_skill_package_publications to service_role;
revoke all on function public.create_word_skill_candidate_package(text,text,jsonb,uuid),public.review_word_skill_candidate_package(uuid,text,jsonb,uuid,text),public.publish_word_skill_candidate_package(uuid,text,uuid,text),public.withdraw_word_skill_reviewed_release(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.create_word_skill_candidate_package(text,text,jsonb,uuid),public.review_word_skill_candidate_package(uuid,text,jsonb,uuid,text),public.publish_word_skill_candidate_package(uuid,text,uuid,text),public.withdraw_word_skill_reviewed_release(uuid,text,uuid,text) to service_role;
