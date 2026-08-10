-- Base Word route ownership belongs to the canonical Base Word cluster, not
-- to the two micro-skills that currently have a released 18-binding recipe.
-- Release, activation, exact authentic-target membership, and assignment
-- recipe guards remain independently fail-closed.
begin;

create or replace function public.adle_micro_skill_owns_base_word_lab_v2(
  p_micro_skill_key text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.micro_skill_catalog skill
    where skill.micro_skill_key = p_micro_skill_key
      and skill.skill_cluster_key = 'D4_MOR_BASE_WORDS'
  );
$$;

revoke all on function public.adle_micro_skill_owns_base_word_lab_v2(text)
  from public, anon, authenticated;
grant execute on function public.adle_micro_skill_owns_base_word_lab_v2(text)
  to service_role;

do $migration$
declare
  v_signature constant text :=
    'public.adle_persist_canonical_intake(uuid,uuid,text,uuid,uuid,text,text,text,date,text,text,uuid,uuid,text,text)';
  v_definition text;
  v_pattern constant text :=
    'v_is_base_word boolean := p_micro_skill_key in \([[:space:]]*''D4_MOR_BASE_WORDS_IDENTIFY_BASE''[[:space:]]*,[[:space:]]*''D4_MOR_BASE_WORDS_PRESERVE_BASE''[[:space:]]*\);';
begin
  select pg_get_functiondef(to_regprocedure(v_signature)) into v_definition;
  if v_definition is null then
    raise exception 'canonical-intake persistence RPC is unavailable';
  end if;
  if v_definition !~ v_pattern then
    raise exception 'canonical-intake Base Word ownership guard differs from the reviewed predecessor';
  end if;
  v_definition := regexp_replace(
    v_definition,
    v_pattern,
    'v_is_base_word boolean := public.adle_micro_skill_owns_base_word_lab_v2(p_micro_skill_key);'
  );
  if v_definition ~ v_pattern
     or v_definition not like '%v_is_base_word boolean := public.adle_micro_skill_owns_base_word_lab_v2(p_micro_skill_key);%' then
    raise exception 'canonical-intake Base Word ownership replacement was not exact';
  end if;
  execute v_definition;
end;
$migration$;

do $verification$
begin
  if not public.adle_micro_skill_owns_base_word_lab_v2(
    'D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX'
  ) or not public.adle_micro_skill_owns_base_word_lab_v2(
    'D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX'
  ) or not public.adle_micro_skill_owns_base_word_lab_v2(
    'D4_MOR_BASE_WORDS_IDENTIFY_BASE'
  ) or not public.adle_micro_skill_owns_base_word_lab_v2(
    'D4_MOR_BASE_WORDS_PRESERVE_BASE'
  ) or public.adle_micro_skill_owns_base_word_lab_v2(
    'D4_MOR_PREFIXES_UN'
  ) then
    raise exception 'canonical Base Word cluster ownership verification failed';
  end if;
end;
$verification$;

comment on function public.adle_micro_skill_owns_base_word_lab_v2(text) is
  'Canonical Base Word cluster-to-route ownership predicate. It grants no release, activation, membership, or recipe readiness.';

commit;
