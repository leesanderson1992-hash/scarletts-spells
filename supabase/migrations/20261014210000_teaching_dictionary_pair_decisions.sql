begin;

-- Append-only, environment-scoped decisions. A later restore is the only way
-- to lift a de-assignment; source publications and learner history stay intact.
create table public.teaching_dictionary_pair_decision_events (
  id uuid primary key default gen_random_uuid(),
  sequence_number bigint generated always as identity unique,
  environment_key text not null check (environment_key in ('local','staging','production')),
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key),
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
  action text not null check (action in ('deassign','restore')),
  decided_by uuid not null references auth.users(id),
  request_id uuid not null,
  decided_at timestamptz not null default now(),
  unique (environment_key,micro_skill_key,canonical_word_id,request_id,action)
);
create index teaching_dictionary_pair_decision_latest_idx
  on public.teaching_dictionary_pair_decision_events
  (environment_key,micro_skill_key,canonical_word_id,sequence_number desc);
alter table public.teaching_dictionary_pair_decision_events enable row level security;
revoke all on public.teaching_dictionary_pair_decision_events from public,anon,authenticated;
grant select,insert on public.teaching_dictionary_pair_decision_events to service_role;

create view public.teaching_dictionary_pair_latest_decisions as
  select distinct on (environment_key,micro_skill_key,canonical_word_id)
    id,environment_key,micro_skill_key,canonical_word_id,action,sequence_number
  from public.teaching_dictionary_pair_decision_events
  order by environment_key,micro_skill_key,canonical_word_id,sequence_number desc;
revoke all on public.teaching_dictionary_pair_latest_decisions from public,anon,authenticated;
grant select on public.teaching_dictionary_pair_latest_decisions to service_role;

-- One RPC is the transaction boundary for all pending choices. The four
-- review lists are disjoint; deassign/restore are paired effects of a choice.
create function public.reconcile_teaching_dictionary_bulk_review_v2(
  p_environment text, p_skill_key text, p_publish_ids uuid[], p_exclude_ids uuid[],
  p_clear_ids uuid[], p_deassign_ids uuid[], p_restore_ids uuid[],
  p_actor uuid, p_request_id uuid, p_authority_fingerprint text
) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_approved integer := 0; v_id uuid;
begin
  if p_environment not in ('local','staging','production') or p_skill_key is null
    or p_actor is null or p_request_id is null
    or p_publish_ids is null or p_exclude_ids is null or p_clear_ids is null
    or p_deassign_ids is null or p_restore_ids is null
    or (select count(distinct id) from unnest(p_publish_ids || p_exclude_ids || p_clear_ids || p_deassign_ids || p_restore_ids) id) not between 1 and 100
    or exists(select 1 from unnest(p_publish_ids || p_exclude_ids || p_clear_ids || p_deassign_ids || p_restore_ids) id where id is null)
    or (select count(*) from unnest(p_publish_ids) id) <> (select count(distinct id) from unnest(p_publish_ids) id)
    or (select count(*) from unnest(p_exclude_ids) id) <> (select count(distinct id) from unnest(p_exclude_ids) id)
    or (select count(*) from unnest(p_clear_ids) id) <> (select count(distinct id) from unnest(p_clear_ids) id)
    or (select count(*) from unnest(p_deassign_ids) id) <> (select count(distinct id) from unnest(p_deassign_ids) id)
    or (select count(*) from unnest(p_restore_ids) id) <> (select count(distinct id) from unnest(p_restore_ids) id)
    or exists(select 1 from unnest(p_exclude_ids) id where id=any(p_publish_ids) or id=any(p_clear_ids) or id=any(p_restore_ids))
    or exists(select 1 from unnest(p_deassign_ids) id where id=any(p_publish_ids) or id=any(p_restore_ids))
    then raise exception 'TEACHING_BULK_REVIEW_INVALID'; end if;
  if not exists(select 1 from public.micro_skill_catalog
    where micro_skill_key=p_skill_key and is_active and is_assignable)
    then raise exception 'TEACHING_BULK_SKILL_INVALID'; end if;
  if not exists(select 1 from public.adle_word_skill_review_controls
    where environment_key=p_environment and review_enabled and publication_enabled and withdrawal_enabled)
    then raise exception 'TEACHING_BULK_CONTROLS_DISABLED'; end if;
  if (select count(*) from public.canonical_teaching_dictionary_words
    where id=any(p_publish_ids || p_exclude_ids || p_clear_ids || p_deassign_ids || p_restore_ids)
      and row_status='active' and review_status='approved_for_first_exposure')
      <> (select count(distinct id) from unnest(p_publish_ids || p_exclude_ids || p_clear_ids || p_deassign_ids || p_restore_ids) id)
    then raise exception 'TEACHING_BULK_WORD_INVALID'; end if;

  if coalesce(array_length(p_publish_ids,1),0)>0 then
    v_approved:=public.publish_teaching_dictionary_bulk_skill_approvals(
      p_environment,p_skill_key,p_publish_ids,p_actor,p_request_id,p_authority_fingerprint);
  end if;
  foreach v_id in array p_deassign_ids loop
    insert into public.teaching_dictionary_pair_decision_events
      (environment_key,micro_skill_key,canonical_word_id,action,decided_by,request_id)
      values (p_environment,p_skill_key,v_id,'deassign',p_actor,p_request_id)
      on conflict (environment_key,micro_skill_key,canonical_word_id,request_id,action) do nothing;
  end loop;
  foreach v_id in array p_restore_ids loop
    insert into public.teaching_dictionary_pair_decision_events
      (environment_key,micro_skill_key,canonical_word_id,action,decided_by,request_id)
      values (p_environment,p_skill_key,v_id,'restore',p_actor,p_request_id)
      on conflict (environment_key,micro_skill_key,canonical_word_id,request_id,action) do nothing;
  end loop;
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
revoke all on function public.reconcile_teaching_dictionary_bulk_review_v2(text,text,uuid[],uuid[],uuid[],uuid[],uuid[],uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.reconcile_teaching_dictionary_bulk_review_v2(text,text,uuid[],uuid[],uuid[],uuid[],uuid[],uuid,uuid,text)
  to service_role;
commit;
