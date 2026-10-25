-- Serialize a prefix lesson save with exact-pair de-assignment decisions.
-- Existing assignments and lesson snapshots remain historical records.
begin;

create function public.lock_dynamic_prefix_pair_decision_before_insert()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.micro_skill_key = any(array[
    'D4_MOR_PREFIXES_UN','D4_MOR_PREFIXES_DIS_MIS',
    'D4_MOR_PREFIXES_IN_IM_IL_IR','D4_MOR_PREFIXES_RE_PRE',
    'D4_MOR_PREFIXES_SUB_INTER_SUPER'
  ]) then
    perform pg_advisory_xact_lock(hashtextextended(
      'adle-prefix-pair:'||new.environment_key||':'||new.micro_skill_key,0));
  end if;
  return new;
end $$;
revoke all on function public.lock_dynamic_prefix_pair_decision_before_insert() from public,anon,authenticated;

create trigger lock_dynamic_prefix_pair_decision_before_insert
  before insert on public.teaching_dictionary_pair_decision_events
  for each row execute function public.lock_dynamic_prefix_pair_decision_before_insert();

create function public.persist_adle_dynamic_prefix_daily_plan_v3_current_pair(
  p_environment_key text,p_parent_user_id uuid,p_child_id uuid,p_plan_date date,
  p_header jsonb,p_items jsonb,p_intakes jsonb,p_snapshot jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_micro text:=p_snapshot#>>'{taxonomy,microSkillKey}';
  v_word_ids uuid[];
begin
  if p_environment_key not in ('local','staging','production')
    or p_snapshot#>>'{route,routeId}' <> 'dynamic_prefix_word_lab'
    or v_micro not in (
      'D4_MOR_PREFIXES_UN','D4_MOR_PREFIXES_DIS_MIS',
      'D4_MOR_PREFIXES_IN_IM_IL_IR','D4_MOR_PREFIXES_RE_PRE',
      'D4_MOR_PREFIXES_SUB_INTER_SUPER')
    or jsonb_typeof(p_snapshot->'words') is distinct from 'array'
    then raise exception 'ADLE_PREFIX_PAIR_AUTHORITY_INVALID'; end if;
  select array_agg(distinct (entry.value->>'canonicalWordId')::uuid)
    into v_word_ids from jsonb_array_elements(p_snapshot->'words') entry;
  if cardinality(v_word_ids) <> 4 then
    raise exception 'ADLE_PREFIX_PAIR_WORDS_INVALID'; end if;

  -- The decision event insert takes the same transaction lock. Whichever
  -- transaction wins defines whether this is a new or historical assignment.
  perform pg_advisory_xact_lock(hashtextextended(
    'adle-prefix-pair:'||p_environment_key||':'||v_micro,0));
  if exists(select 1 from public.teaching_dictionary_pair_latest_decisions d
    where d.environment_key=p_environment_key and d.micro_skill_key=v_micro
      and d.canonical_word_id=any(v_word_ids) and d.action='deassign') then
    raise exception 'ADLE_PREFIX_PAIR_DEASSIGNED'; end if;

  return public.persist_adle_specialist_daily_plan_v3(
    p_parent_user_id,p_child_id,p_plan_date,p_header,p_items,p_intakes,p_snapshot);
end $$;

revoke all on function public.persist_adle_dynamic_prefix_daily_plan_v3_current_pair(text,uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.persist_adle_dynamic_prefix_daily_plan_v3_current_pair(text,uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)
  to service_role;

commit;
