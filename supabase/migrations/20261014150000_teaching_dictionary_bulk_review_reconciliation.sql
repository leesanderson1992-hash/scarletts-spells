begin;

-- Keep publications and review exclusions in the same transaction. Preparing
-- candidate packages remains a separate, unpublished preflight step.
create function public.reconcile_teaching_dictionary_bulk_review(
  p_environment text, p_skill_key text, p_apply_ids uuid[], p_exclude_ids uuid[],
  p_clear_ids uuid[], p_actor uuid, p_request_id uuid, p_authority_fingerprint text
) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_approved integer := 0;
begin
  if p_environment not in ('local','staging','production') or p_skill_key is null
    or p_actor is null or p_request_id is null
    or p_apply_ids is null or p_exclude_ids is null or p_clear_ids is null
    or coalesce(array_length(p_apply_ids,1),0)
      +coalesce(array_length(p_exclude_ids,1),0)
      +coalesce(array_length(p_clear_ids,1),0) < 1
    or (select count(*) from (
      select distinct id from unnest(p_apply_ids || p_exclude_ids || p_clear_ids) id
    ) selected) > 100
    or (select count(*) from unnest(p_apply_ids) id) <> (select count(distinct id) from unnest(p_apply_ids) id)
    or (select count(*) from unnest(p_exclude_ids) id) <> (select count(distinct id) from unnest(p_exclude_ids) id)
    or (select count(*) from unnest(p_clear_ids) id) <> (select count(distinct id) from unnest(p_clear_ids) id)
    or exists(select 1 from unnest(p_exclude_ids) id where id=any(p_apply_ids) or id=any(p_clear_ids))
    then raise exception 'TEACHING_BULK_REVIEW_INVALID'; end if;
  if not exists(select 1 from public.micro_skill_catalog
    where micro_skill_key=p_skill_key and is_active and is_assignable)
    then raise exception 'TEACHING_BULK_SKILL_INVALID'; end if;
  if not exists(select 1 from public.adle_word_skill_review_controls
    where environment_key=p_environment and review_enabled and publication_enabled and withdrawal_enabled)
    then raise exception 'TEACHING_BULK_CONTROLS_DISABLED'; end if;
  if (select count(*) from public.canonical_teaching_dictionary_words
    where id=any(p_apply_ids || p_exclude_ids || p_clear_ids)
      and row_status='active' and review_status='approved_for_first_exposure')
      <> (select count(distinct id) from unnest(p_apply_ids || p_exclude_ids || p_clear_ids) id)
    then raise exception 'TEACHING_BULK_WORD_INVALID'; end if;
  if exists (
    select 1 from public.adle_reviewed_word_skill_pairs pair
      join public.adle_reviewed_word_skill_releases release on release.id=pair.release_id
      left join public.adle_reviewed_word_skill_withdrawals withdrawn on withdrawn.release_id=release.id
    where pair.canonical_word_id=any(p_exclude_ids) and pair.micro_skill_key=p_skill_key
      and release.environment_key=p_environment and withdrawn.release_id is null
  ) then raise exception 'TEACHING_BULK_PAIR_ALREADY_ASSIGNED'; end if;

  if coalesce(array_length(p_apply_ids,1),0)>0 then
    v_approved:=public.publish_teaching_dictionary_bulk_skill_approvals(
      p_environment,p_skill_key,p_apply_ids,p_actor,p_request_id,p_authority_fingerprint);
  end if;
  delete from public.teaching_dictionary_bulk_review_exclusions
    where environment_key=p_environment and micro_skill_key=p_skill_key
      and canonical_word_id=any(p_clear_ids);
  insert into public.teaching_dictionary_bulk_review_exclusions
    (environment_key,micro_skill_key,canonical_word_id,reviewed_by,reviewed_at)
    select p_environment,p_skill_key,id,p_actor,now() from unnest(p_exclude_ids) id
    on conflict (environment_key,micro_skill_key,canonical_word_id)
    do update set reviewed_by=excluded.reviewed_by, reviewed_at=excluded.reviewed_at;
  return v_approved;
end $$;

revoke all on function public.reconcile_teaching_dictionary_bulk_review(text,text,uuid[],uuid[],uuid[],uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.reconcile_teaching_dictionary_bulk_review(text,text,uuid[],uuid[],uuid[],uuid,uuid,text)
  to service_role;

commit;
