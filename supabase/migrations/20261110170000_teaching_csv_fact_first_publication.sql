begin;

-- The CSV's requested skills are proposals. The draft's skillKeys are an
-- optimistic snapshot of already governed pairs, never a new approval list.
create function public.teaching_dictionary_import_live_skill_keys(
  p_environment text,p_word_ids uuid[]
) returns table(canonical_word_id uuid,skill_keys text[])
language sql stable security definer set search_path=public,pg_temp as $$
  select ids.id,
    coalesce(array_agg(distinct live.micro_skill_key order by live.micro_skill_key)
      filter (where live.micro_skill_key is not null),'{}'::text[])
  from unnest(p_word_ids) ids(id)
  left join lateral (
    select p.micro_skill_key from public.adle_reviewed_word_skill_pairs p
    join public.adle_reviewed_word_skill_releases r on r.id=p.release_id
      and r.environment_key=p_environment
    where p.canonical_word_id=ids.id
      and not exists(select 1 from public.adle_reviewed_word_skill_withdrawals x
        where x.release_id=r.id)
      and not exists(select 1 from public.teaching_dictionary_pair_latest_decisions x
        where x.environment_key=p_environment and x.canonical_word_id=ids.id
          and x.micro_skill_key=p.micro_skill_key and x.action='deassign')
  ) live on true
  group by ids.id
$$;
revoke all on function public.teaching_dictionary_import_live_skill_keys(text,uuid[])
  from public,anon,authenticated;
grant execute on function public.teaching_dictionary_import_live_skill_keys(text,uuid[])
  to service_role;

-- Existing family and route compatibility publishers can still publish the
-- Overview. They receive exactly the live pair snapshot, so their old loops
-- cannot add or withdraw a pair. The exact postcondition rolls everything
-- back if a concurrent authority change or unexpected publisher side effect
-- occurs. Only the shared candidate service may approve a requested skill.
create function public.publish_teaching_dictionary_reviewed_csv_facts_first(
  p_draft uuid,p_actor uuid,p_environment text,p_mode text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.teaching_dictionary_manager_drafts%rowtype;
  v_word uuid; v_sense text; v_skill text;
  v_expected text[]; v_before text[]; v_after text[];
begin
  if p_actor is null or p_environment not in ('staging','production')
    or p_mode not in ('new_word','reconciled','free_base','suffix_overview','bound_root') then
    raise exception 'TEACHING_CSV_FACTS_FIRST_INVALID';
  end if;
  select * into d from public.teaching_dictionary_manager_drafts where id=p_draft for update;
  if d.id is null or d.source_reference !~ '^CSV batch [a-f0-9-]{36},'
    or jsonb_typeof(d.payload->'requestedSkillKeys') is distinct from 'array'
    or jsonb_typeof(d.payload->'skillKeys') is distinct from 'array'
    or exists(select 1 from public.teaching_dictionary_manager_publications
      where draft_id=d.id)
    or not exists(select 1 from public.teaching_dictionary_import_skill_reviews r
      where r.draft_id=d.id and r.reviewed_by=p_actor
        and r.source_reference=d.source_reference
        and r.skill_fingerprint=public.adle_generic_snapshot_json_sha256_v1(d.payload->'skillKeys'))
    or not exists(select 1 from public.teaching_dictionary_overview_reviews r
      where r.draft_id=d.id and r.canonical_word_id is not distinct from d.canonical_word_id
        and r.reviewed_by=p_actor
        and r.content_fingerprint=public.teaching_dictionary_overview_fingerprint(d.payload)
        and r.base_dictionary_fingerprint is not distinct from
          public.teaching_dictionary_route_dictionary_fingerprint(d.canonical_word_id)) then
    raise exception 'TEACHING_CSV_FACTS_FIRST_REVIEW_STALE';
  end if;
  if exists(select 1 from jsonb_array_elements(d.payload->'requestedSkillKeys') item
    where jsonb_typeof(item)<>'string' or nullif(btrim(item#>>'{}'),'') is null)
    or (select count(distinct item#>>'{}') from jsonb_array_elements(d.payload->'requestedSkillKeys') item)
      <>jsonb_array_length(d.payload->'requestedSkillKeys') then
    raise exception 'TEACHING_CSV_FACTS_FIRST_SKILLS_INVALID';
  end if;
  if jsonb_typeof(d.payload->'senseSet'->'senses') is distinct from 'array'
    or jsonb_array_length(d.payload->'senseSet'->'senses')<>1 then
    raise exception 'TEACHING_CSV_FACTS_FIRST_SINGLE_SENSE_REQUIRED';
  end if;
  v_sense:=nullif(btrim(d.payload->'senseSet'->'senses'->0->>'id'),'');
  if v_sense is null then raise exception 'TEACHING_CSV_FACTS_FIRST_SINGLE_SENSE_REQUIRED'; end if;
  select coalesce(array_agg(distinct item order by item),'{}'::text[])
    into v_expected from jsonb_array_elements_text(d.payload->'skillKeys') item;
  if cardinality(v_expected)<>jsonb_array_length(d.payload->'skillKeys') then
    raise exception 'TEACHING_CSV_FACTS_FIRST_SKILLS_INVALID';
  end if;
  if p_mode='new_word' then
    if d.canonical_word_id is not null or cardinality(v_expected)<>0
      or jsonb_array_length(coalesce(d.payload->'routeContents','[]'::jsonb))<>0
      or d.payload ? 'rootFamilyReview' then
      raise exception 'TEACHING_CSV_FACTS_FIRST_NEW_WORD_INVALID';
    end if;
    v_before:='{}'::text[];
    v_word:=public.publish_teaching_dictionary_manager_draft(d.id,p_actor);
  else
    if d.canonical_word_id is null then raise exception 'TEACHING_CSV_FACTS_FIRST_EXISTING_WORD_REQUIRED'; end if;
    select skill_keys into v_before from public.teaching_dictionary_import_live_skill_keys(
      p_environment,array[d.canonical_word_id]);
    if v_before is distinct from v_expected then
      raise exception 'TEACHING_CSV_FACTS_FIRST_SKILL_AUTHORITY_CHANGED';
    end if;
    case p_mode
      when 'reconciled' then
        v_word:=public.publish_teaching_dictionary_reviewed_reconciled_draft(p_draft,p_actor,p_environment);
      when 'free_base' then
        v_word:=public.publish_teaching_dictionary_reviewed_free_base_draft(p_draft,p_actor,p_environment);
      when 'suffix_overview' then
        v_word:=public.publish_teaching_dictionary_reviewed_suffix_overview_draft(p_draft,p_actor,p_environment);
      when 'bound_root' then
        v_word:=public.publish_teaching_dictionary_reviewed_bound_root_draft(p_draft,p_actor,p_environment);
    end case;
  end if;
  select skill_keys into v_after from public.teaching_dictionary_import_live_skill_keys(
    p_environment,array[v_word]);
  if v_after is distinct from v_before then
    raise exception 'TEACHING_CSV_FACTS_FIRST_PAIR_CHANGED';
  end if;
  -- Existing approved pairs retain their meaning binding. Proposed new
  -- skills receive a binding only when the shared candidate action passes.
  foreach v_skill in array v_before loop
    if exists(select 1 from public.adle_reviewed_word_skill_pairs p
      join public.adle_reviewed_word_skill_releases r on r.id=p.release_id
        and r.environment_key=p_environment
      where p.canonical_word_id=v_word and p.micro_skill_key=v_skill
        and p.relationship_role='demonstrates'
        and not exists(select 1 from public.adle_reviewed_word_skill_withdrawals x
          where x.release_id=r.id)) then
      perform public.review_teaching_dictionary_lesson_sense(
        p_environment,v_word,v_skill,v_sense,p_actor);
    end if;
  end loop;
  for v_skill in select item from jsonb_array_elements_text(d.payload->'requestedSkillKeys') item loop
    if v_skill in ('D4_INF_ING_ENDINGS_REGULAR','D4_INF_ING_ENDINGS_DROP_E',
      'D4_INF_ING_ENDINGS_DOUBLE_FINAL_CONSONANT','D4_INF_ING_ENDINGS_IE_TO_Y',
      'D4_MOR_SUFFIXES_ABLE_IBLE') then
      insert into public.teaching_dictionary_import_candidate_handoffs
        (draft_id,environment_key,canonical_word_id,micro_skill_key,sense_id)
      values(d.id,p_environment,v_word,v_skill,v_sense);
    end if;
  end loop;
  return v_word;
end $$;
revoke all on function public.publish_teaching_dictionary_reviewed_csv_facts_first(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.publish_teaching_dictionary_reviewed_csv_facts_first(uuid,uuid,text,text)
  to service_role;

notify pgrst,'reload schema';
commit;
