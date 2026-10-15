-- A route content version is an immutable editorial unit. Saving a manager
-- draft does not review it, and changing dictionary dependencies invalidates
-- its review even if the route JSON itself is unchanged.
create table public.teaching_dictionary_route_content_reviews (
  content_version_id uuid primary key references public.teaching_dictionary_route_content_versions(id),
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  dictionary_fingerprint text not null check (dictionary_fingerprint ~ '^[a-f0-9]{64}$'),
  reviewed_by uuid not null references auth.users(id),
  reviewed_at timestamptz not null default now()
);
create trigger teaching_dictionary_route_content_reviews_immutable before update
  on public.teaching_dictionary_route_content_reviews for each row execute function public.reject_writing_fact_update();
alter table public.teaching_dictionary_route_content_reviews enable row level security;
revoke all on public.teaching_dictionary_route_content_reviews from anon,authenticated;
grant select,insert on public.teaching_dictionary_route_content_reviews to service_role;

create function public.teaching_dictionary_route_dictionary_fingerprint(p_word uuid)
returns text language sql stable security definer set search_path=public,extensions,pg_temp as $$
  select encode(extensions.digest(convert_to(
    coalesce(w.source_row_hash,'') || ':' || coalesce(m.source_row_hash,'') || ':' ||
    coalesce(d.source_row_hash,'') || ':' || coalesce(x.source_row_hash,''),'UTF8'),'sha256'),'hex')
  from public.canonical_teaching_dictionary_words w
  left join lateral (select source_row_hash from public.canonical_teaching_dictionary_word_metadata
    where canonical_word_id=w.id and row_status='active' order by created_at desc limit 1) m on true
  left join lateral (select source_row_hash from public.canonical_teaching_dictionary_dictation_sentences
    where canonical_word_id=w.id and row_status='active' order by created_at desc limit 1) d on true
  left join lateral (select source_row_hash from public.canonical_teaching_dictionary_word_morphology
    where canonical_word_id=w.id and row_status='active' order by created_at desc limit 1) x on true
  where w.id=p_word and w.row_status='active'
$$;
revoke all on function public.teaching_dictionary_route_dictionary_fingerprint(uuid) from public,anon,authenticated;
grant execute on function public.teaching_dictionary_route_dictionary_fingerprint(uuid) to service_role;

create function public.stage_teaching_dictionary_route_draft(p_draft uuid,p_actor uuid)
returns uuid[] language plpgsql security definer set search_path=public,pg_temp as $$
declare
  d public.teaching_dictionary_manager_drafts%rowtype;
  v_route jsonb;
  v_id uuid;
  v_ids uuid[] := array[]::uuid[];
begin
  select * into d from public.teaching_dictionary_manager_drafts where id=p_draft for update;
  if d.id is null or d.canonical_word_id is null or p_actor is null then
    raise exception 'TEACHING_ROUTE_DRAFT_NOT_FOUND'; end if;
  if not exists(select 1 from public.canonical_teaching_dictionary_words w
    where w.id=d.canonical_word_id and w.row_status='active'
      and w.normalised_word=d.normalised_word and w.dialect_code=d.dialect_code) then
    raise exception 'TEACHING_ROUTE_WORD_IDENTITY_CHANGED'; end if;
  for v_route in select value from jsonb_array_elements(coalesce(d.payload->'routeContents','[]'::jsonb)) loop
    if btrim(coalesce(v_route->>'routeId',''))=''
      or btrim(coalesce(v_route->>'routeVersion',''))=''
      or btrim(coalesce(v_route->>'microSkillKey',''))=''
      or jsonb_typeof(v_route->'content') is distinct from 'object' then
      raise exception 'TEACHING_ROUTE_DRAFT_INVALID'; end if;
    select id into v_id from public.teaching_dictionary_route_content_versions
      where draft_id=d.id and route_id=v_route->>'routeId'
        and route_version=v_route->>'routeVersion' and micro_skill_key=v_route->>'microSkillKey'
      limit 1;
    if v_id is null then
      insert into public.teaching_dictionary_route_content_versions
        (canonical_word_id,route_id,route_version,micro_skill_key,content,draft_id)
      values (d.canonical_word_id,v_route->>'routeId',v_route->>'routeVersion',
        v_route->>'microSkillKey',v_route,d.id) returning id into v_id;
    end if;
    v_ids:=array_append(v_ids,v_id);
    v_id:=null;
  end loop;
  if cardinality(v_ids)=0 then raise exception 'TEACHING_ROUTE_DRAFT_EMPTY'; end if;
  return v_ids;
end $$;
revoke all on function public.stage_teaching_dictionary_route_draft(uuid,uuid) from public,anon,authenticated;
grant execute on function public.stage_teaching_dictionary_route_draft(uuid,uuid) to service_role;

create function public.review_teaching_dictionary_route_content(p_content_version uuid,p_actor uuid)
returns void language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  c public.teaching_dictionary_route_content_versions%rowtype;
  v_hash text;
  v_dictionary text;
begin
  select * into c from public.teaching_dictionary_route_content_versions where id=p_content_version for update;
  if c.id is null or p_actor is null then raise exception 'TEACHING_ROUTE_CONTENT_NOT_FOUND'; end if;
  if exists(select 1 from public.teaching_dictionary_route_content_versions newer
    where newer.canonical_word_id=c.canonical_word_id and newer.route_id=c.route_id
      and newer.route_version=c.route_version and newer.micro_skill_key=c.micro_skill_key
      and (newer.published_at,newer.id)>(c.published_at,c.id)) then
    raise exception 'TEACHING_ROUTE_CONTENT_STALE'; end if;
  if c.route_id='dynamic_affix_word_lab' and
    (c.content->'content'->'trueMorphologyProvenance'->>'status'='draft_requires_editorial_review'
      or jsonb_typeof(c.content->'content'->'trueMorphologyParts') is distinct from 'array'
      or jsonb_typeof(c.content->'content'->'trueMorphologyJoins') is distinct from 'array') then
    raise exception 'TEACHING_ROUTE_MORPHOLOGY_REVIEW_REQUIRED'; end if;
  v_dictionary:=public.teaching_dictionary_route_dictionary_fingerprint(c.canonical_word_id);
  if v_dictionary is null then raise exception 'TEACHING_ROUTE_DICTIONARY_MISSING'; end if;
  v_hash:=encode(extensions.digest(convert_to(c.content::text,'UTF8'),'sha256'),'hex');
  insert into public.teaching_dictionary_route_content_reviews
    (content_version_id,content_sha256,dictionary_fingerprint,reviewed_by)
  values (c.id,v_hash,v_dictionary,p_actor)
  on conflict (content_version_id) do nothing;
  if not exists(select 1 from public.teaching_dictionary_route_content_reviews r
    where r.content_version_id=c.id and r.content_sha256=v_hash
      and r.dictionary_fingerprint=v_dictionary) then
    raise exception 'TEACHING_ROUTE_REVIEW_STALE'; end if;
end $$;
revoke all on function public.review_teaching_dictionary_route_content(uuid,uuid) from public,anon,authenticated;
grant execute on function public.review_teaching_dictionary_route_content(uuid,uuid) to service_role;
