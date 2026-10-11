-- Keep each manager approval in its own release so the single-word editor can
-- withdraw one pair without withdrawing another word from the same batch.
create function public.prepare_teaching_dictionary_bulk_skill_approvals(
  p_environment text, p_skill_key text, p_word_ids uuid[], p_actor uuid, p_request_id uuid
) returns table(canonical_word_id uuid, package_id uuid)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_word_id uuid; v_package uuid; v_candidate jsonb;
begin
  if p_environment not in ('local','staging','production')
    or p_skill_key is null or p_actor is null or p_request_id is null
    or coalesce(array_length(p_word_ids,1),0) not between 1 and 100
    or (select count(distinct id) from unnest(p_word_ids) id) <> array_length(p_word_ids,1)
    then raise exception 'TEACHING_BULK_SELECTION_INVALID'; end if;
  if not exists(select 1 from public.micro_skill_catalog
    where micro_skill_key=p_skill_key and is_active and is_assignable)
    then raise exception 'TEACHING_BULK_SKILL_INVALID'; end if;
  if not exists(select 1 from public.adle_word_skill_review_controls
    where environment_key=p_environment and review_enabled and publication_enabled and withdrawal_enabled)
    then raise exception 'TEACHING_BULK_CONTROLS_DISABLED'; end if;
  if (select count(*) from public.canonical_teaching_dictionary_words
    where id=any(p_word_ids) and row_status='active' and review_status='approved_for_first_exposure')
      <> array_length(p_word_ids,1)
    then raise exception 'TEACHING_BULK_WORD_INVALID'; end if;

  foreach v_word_id in array p_word_ids loop
    v_candidate:=jsonb_build_object(
      'canonicalWordId',v_word_id,'microSkillKey',p_skill_key,
      'relationshipRole','demonstrates','method','deterministic_candidate',
      'sourceReference','Teaching Dictionary Manager human bulk approval: '||v_word_id||':'||p_skill_key,
      'licenceReference','internal_authored');
    v_package:=public.create_word_skill_candidate_package(
      'tdm-bulk:'||p_request_id||':'||v_word_id,p_environment,jsonb_build_array(v_candidate),p_actor);
    perform public.review_word_skill_candidate_package_with_metrics(
      v_package,p_environment,'["approved"]'::jsonb,'[""]'::jsonb,p_actor,
      'Approved in Teaching Dictionary Manager bulk assignment',0);
    canonical_word_id:=v_word_id; package_id:=v_package; return next;
  end loop;
end $$;

create function public.publish_teaching_dictionary_bulk_skill_approvals(
  p_environment text, p_skill_key text, p_word_ids uuid[], p_actor uuid,
  p_request_id uuid, p_authority_fingerprint text
) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_word_id uuid; v_package public.adle_word_skill_candidate_packages%rowtype; v_count integer:=0;
begin
  if p_environment not in ('local','staging','production')
    or p_skill_key is null or p_actor is null or p_request_id is null
    or nullif(btrim(p_authority_fingerprint),'') is null
    or coalesce(array_length(p_word_ids,1),0) not between 1 and 100
    or (select count(distinct id) from unnest(p_word_ids) id) <> array_length(p_word_ids,1)
    then raise exception 'TEACHING_BULK_SELECTION_INVALID'; end if;
  if not exists(select 1 from public.micro_skill_catalog
    where micro_skill_key=p_skill_key and is_active and is_assignable)
    then raise exception 'TEACHING_BULK_SKILL_INVALID'; end if;
  if not exists(select 1 from public.adle_word_skill_review_controls
    where environment_key=p_environment and review_enabled and publication_enabled and withdrawal_enabled)
    then raise exception 'TEACHING_BULK_CONTROLS_DISABLED'; end if;
  if (select count(*) from public.canonical_teaching_dictionary_words
    where id=any(p_word_ids) and row_status='active' and review_status='approved_for_first_exposure')
      <> array_length(p_word_ids,1)
    then raise exception 'TEACHING_BULK_WORD_INVALID'; end if;

  -- A function call is one PostgreSQL transaction: any failed pair rolls back
  -- every publication in this confirmation.
  foreach v_word_id in array p_word_ids loop
    select * into v_package from public.adle_word_skill_candidate_packages
      where package_key='tdm-bulk:'||p_request_id||':'||v_word_id
        and environment_key=p_environment and created_by=p_actor for update;
    if v_package.id is null or jsonb_array_length(v_package.candidates)<>1
      or v_package.candidates->0->>'canonicalWordId'<>v_word_id::text
      or v_package.candidates->0->>'microSkillKey'<>p_skill_key
      or not exists(select 1 from public.adle_word_skill_package_reviews
        where package_id=v_package.id and decisions='["approved"]'::jsonb)
      then raise exception 'TEACHING_BULK_PACKAGE_INVALID'; end if;
    perform public.publish_word_skill_candidate_package(
      v_package.id,p_environment,p_actor,p_authority_fingerprint);
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;

revoke all on function public.prepare_teaching_dictionary_bulk_skill_approvals(text,text,uuid[],uuid,uuid),
  public.publish_teaching_dictionary_bulk_skill_approvals(text,text,uuid[],uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.prepare_teaching_dictionary_bulk_skill_approvals(text,text,uuid[],uuid,uuid),
  public.publish_teaching_dictionary_bulk_skill_approvals(text,text,uuid[],uuid,uuid,text)
  to service_role;
