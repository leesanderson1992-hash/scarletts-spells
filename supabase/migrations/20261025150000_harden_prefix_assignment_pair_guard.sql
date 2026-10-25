-- Fail closed on NULL route/environment and empty word sets. The first
-- wrapper migration is already applied in disposable staging, so preserve
-- migration history with a replacement definition.
begin;

create or replace function public.persist_adle_dynamic_prefix_daily_plan_v3_current_pair(
  p_environment_key text,p_parent_user_id uuid,p_child_id uuid,p_plan_date date,
  p_header jsonb,p_items jsonb,p_intakes jsonb,p_snapshot jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_micro text:=p_snapshot#>>'{taxonomy,microSkillKey}';
  v_word_ids uuid[];
begin
  if p_environment_key is null or p_environment_key not in ('local','staging','production')
    or p_snapshot#>>'{route,routeId}' is distinct from 'dynamic_prefix_word_lab'
    or v_micro is null or v_micro not in (
      'D4_MOR_PREFIXES_UN','D4_MOR_PREFIXES_DIS_MIS',
      'D4_MOR_PREFIXES_IN_IM_IL_IR','D4_MOR_PREFIXES_RE_PRE',
      'D4_MOR_PREFIXES_SUB_INTER_SUPER')
    or jsonb_typeof(p_snapshot->'words') is distinct from 'array'
    then raise exception 'ADLE_PREFIX_PAIR_AUTHORITY_INVALID'; end if;
  select array_agg(distinct (entry.value->>'canonicalWordId')::uuid)
    into v_word_ids from jsonb_array_elements(p_snapshot->'words') entry;
  if coalesce(cardinality(v_word_ids),0) <> 4 then
    raise exception 'ADLE_PREFIX_PAIR_WORDS_INVALID'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'adle-prefix-pair:'||p_environment_key||':'||v_micro,0));
  if exists(select 1 from public.teaching_dictionary_pair_latest_decisions d
    where d.environment_key=p_environment_key and d.micro_skill_key=v_micro
      and d.canonical_word_id=any(v_word_ids) and d.action='deassign') then
    raise exception 'ADLE_PREFIX_PAIR_DEASSIGNED'; end if;

  return public.persist_adle_specialist_daily_plan_v3(
    p_parent_user_id,p_child_id,p_plan_date,p_header,p_items,p_intakes,p_snapshot);
end $$;

commit;
