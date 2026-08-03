-- The reviewed in-/im-/il-/ir- Prefix Form Sort adds four genuine guided
-- bindings to the established Dynamic Prefix plan. Permit exactly that
-- 20-item Dynamic Prefix V2 pedagogy snapshot without relaxing the 16-item
-- default or any existing reviewed 18-item exception.

do $dynamic_prefix_20_guard$
declare
  definition text;
  previous_definition text;
begin
  select pg_get_functiondef(
    'public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb)'::regprocedure
  ) into definition;

  if definition is null then
    raise exception 'Missing ADLE composed-plan persistence function';
  end if;
  if definition !~ 'closed_compound_v1'
    or definition !~ 'D4_MOR_SUFFIXES_FUL_LESS'
    or definition !~ 'D4_MOR_PREFIXES_SUB_INTER_SUPER'
  then
    raise exception 'Unexpected composed-plan guard baseline; refusing to replace it';
  end if;

  previous_definition := definition;
  definition := replace(
    definition,
    $old$  if jsonb_typeof(p_items) <> 'array'
    or (
      jsonb_array_length(p_items) <> 16
      and ($old$,
    $new$  if jsonb_typeof(p_items) <> 'array'
    or (
      jsonb_array_length(p_items) <> 16
      and not (
        jsonb_array_length(p_items) = 20
        and exists (
          select 1
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'promptData'->>'dynamicPrefixActivityId' = 'intro-root'
            and candidate.value->'promptData'->'dynamicPrefixLesson'->>'microSkillId' = 'D4_MOR_PREFIXES_IN_IM_IL_IR'
            and candidate.value->'promptData'->'dynamicPrefixLesson'->>'experienceProfile' = 'prefix_word_lab_v2'
            and candidate.value->'promptData'->'dynamicPrefixLesson'->>'contentVersion' = 'd4_mor_prefix_word_lab_v2'
            and candidate.value->'promptData'->'dynamicPrefixLesson'->>'presentationPolicyVersion' = 'dynamic_prefix_pedagogy_v1'
            and candidate.value->'promptData'->'dynamicPrefixLesson'->'activities'->'guided'->>'meaningCheckKind' = 'prefix_form'
            and candidate.value->'promptData'->'dynamicPrefixLesson'->'activities'->'guided'->>'meaningResultsPresentation' = 'none'
            and jsonb_array_length(candidate.value->'promptData'->'dynamicPrefixLesson'->'words'->'lesson') = 4
            and jsonb_array_length(candidate.value->'promptData'->'dynamicPrefixLesson'->'activities'->'guided'->'splitCanonicalWordIds') = 2
            and jsonb_array_length(candidate.value->'promptData'->'dynamicPrefixLesson'->'activities'->'guided'->'builds') = 4
        )
        and not exists (
          select 1
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'metadata'->>'provenance' is distinct from 'dynamic_prefix_v2'
            or candidate.value->'metadata'->>'microSkillKey' is distinct from 'D4_MOR_PREFIXES_IN_IM_IL_IR'
            or nullif(candidate.value->'promptData'->>'dynamicPrefixActivityId', '') is null
        )
        and (
          select count(distinct candidate.value->'promptData'->>'dynamicPrefixActivityId')
          from jsonb_array_elements(p_items) as candidate(value)
        ) = 20
        and (
          select count(*)
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'promptData'->>'dynamicPrefixActivityId' in ('intro-root', 'intro-words')
        ) = 2
        and (
          select count(*)
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'promptData'->>'dynamicPrefixActivityId' like 'guided-strip-%'
        ) = 2
        and (
          select count(*)
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'promptData'->>'dynamicPrefixActivityId' like 'guided-meaning-%'
        ) = 4
        and (
          select count(*)
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'promptData'->>'dynamicPrefixActivityId' like 'guided-build-%'
        ) = 4
        and (
          select count(*)
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'promptData'->>'dynamicPrefixActivityId' like 'controlled-%'
        ) = 4
        and (
          select count(*)
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'promptData'->>'dynamicPrefixActivityId' like 'dictation-%'
        ) = 4
      )
      and ($new$
  );
  definition := replace(
    definition,
    'ADLE composed plan requires 16 items, except the reviewed 18-item SUB/INTER/SUPER or FUL/LESS snapshot',
    'ADLE composed plan requires 16 items, except reviewed 18-item profiles or the reviewed 20-item IN/IM/IL/IR snapshot'
  );

  if definition = previous_definition
    or definition !~ 'reviewed 20-item IN/IM/IL/IR snapshot'
    or definition !~ 'dynamic_prefix_pedagogy_v1'
    or definition !~ 'meaningCheckKind'' = ''prefix_form'
  then
    raise exception 'Could not add the narrow IN/IM/IL/IR 20-item allowance';
  end if;

  execute definition;
end;
$dynamic_prefix_20_guard$;

revoke all on function public.persist_adle_composed_daily_plan_v1(
  uuid, uuid, date, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.persist_adle_composed_daily_plan_v1(
  uuid, uuid, date, jsonb, jsonb, jsonb
) to service_role;
