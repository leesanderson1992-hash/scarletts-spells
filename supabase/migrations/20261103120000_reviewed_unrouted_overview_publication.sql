begin;

-- A reviewed Overview may replace a word whose only governed dependants are
-- unchanged word-skill releases. Route, family and learner evidence still needs
-- its coordinated release path. This function does not alter skill authority.
create or replace function public.publish_teaching_dictionary_reviewed_unrouted_draft(
  p_draft uuid,p_actor uuid,p_environment text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  d public.teaching_dictionary_manager_drafts%rowtype;
  v_draft_keys text[];
  v_live_keys text[];
  v_word uuid;
begin
  if p_actor is null or p_environment not in ('staging','production') then
    raise exception 'TEACHING_UNROUTED_REVIEW_REQUIRED';
  end if;
  select * into d from public.teaching_dictionary_manager_drafts where id=p_draft for update;
  if d.id is null or d.canonical_word_id is null then
    raise exception 'TEACHING_UNROUTED_EXISTING_WORD_REQUIRED';
  end if;
  if jsonb_typeof(coalesce(d.payload->'routeContents','[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(d.payload->'routeContents','[]'::jsonb)) <> 0 then
    raise exception 'TEACHING_UNROUTED_DEPENDENCIES_EXIST';
  end if;
  if not exists (select 1 from public.teaching_dictionary_overview_reviews r
    where r.draft_id=d.id and r.canonical_word_id=d.canonical_word_id
      and r.reviewed_by=p_actor
      and r.content_fingerprint=public.teaching_dictionary_overview_fingerprint(d.payload)
      and r.base_dictionary_fingerprint is not distinct from
        public.teaching_dictionary_route_dictionary_fingerprint(d.canonical_word_id)) then
    raise exception 'TEACHING_UNROUTED_REVIEW_STALE';
  end if;
  if exists(select 1 from public.canonical_teaching_dictionary_prefix_members x where x.canonical_word_id=d.canonical_word_id and x.row_status='active')
    or exists(select 1 from public.canonical_teaching_dictionary_suffix_members x where x.canonical_word_id=d.canonical_word_id and x.row_status='active')
    or exists(select 1 from public.canonical_teaching_dictionary_base_word_family_members x where x.canonical_word_id=d.canonical_word_id and x.row_status='active')
    or exists(select 1 from public.canonical_teaching_dictionary_lexical_base_family_members x where x.canonical_word_id=d.canonical_word_id)
    or exists(select 1 from public.canonical_teaching_dictionary_base_family_registry_members x where x.canonical_word_id=d.canonical_word_id)
    or exists(select 1 from public.canonical_teaching_dictionary_compound_structures_v2 x where x.canonical_word_id=d.canonical_word_id)
    or exists(select 1 from public.canonical_teaching_dictionary_compound_facts x where x.canonical_word_id=d.canonical_word_id)
    or exists(select 1 from public.canonical_teaching_dictionary_word_support x where x.canonical_word_id=d.canonical_word_id and x.row_status='active')
    or exists(select 1 from public.adle_learning_items x where x.canonical_word_id=d.canonical_word_id and x.row_status='active')
    or exists(select 1 from public.teaching_dictionary_route_content_versions v
      join public.teaching_dictionary_route_content_publications p on p.content_version_id=v.id
      where v.canonical_word_id=d.canonical_word_id) then
    raise exception 'TEACHING_UNROUTED_DEPENDENCIES_EXIST';
  end if;
  select coalesce(array_agg(distinct value order by value),'{}'::text[])
    into v_draft_keys from jsonb_array_elements_text(coalesce(d.payload->'skillKeys','[]'::jsonb)) value;
  select coalesce(array_agg(distinct p.micro_skill_key order by p.micro_skill_key),'{}'::text[])
    into v_live_keys
    from public.adle_reviewed_word_skill_pairs p
    join public.adle_reviewed_word_skill_releases r on r.id=p.release_id and r.environment_key=p_environment
    where p.canonical_word_id=d.canonical_word_id
      and not exists(select 1 from public.adle_reviewed_word_skill_withdrawals x where x.release_id=r.id)
      and not exists(select 1 from public.teaching_dictionary_pair_latest_decisions x
        where x.environment_key=p_environment and x.canonical_word_id=p.canonical_word_id
          and x.micro_skill_key=p.micro_skill_key and x.action='deassign');
  if v_draft_keys is distinct from v_live_keys then
    raise exception 'TEACHING_UNROUTED_SKILL_SET_CHANGED';
  end if;
  perform set_config('app.teaching_dictionary_release_draft',d.id::text,true);
  v_word:=public.publish_teaching_dictionary_manager_draft(d.id,p_actor);
  return v_word;
end $$;

revoke all on function public.publish_teaching_dictionary_reviewed_unrouted_draft(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.publish_teaching_dictionary_reviewed_unrouted_draft(uuid,uuid,text)
  to service_role;
notify pgrst,'reload schema';
commit;
