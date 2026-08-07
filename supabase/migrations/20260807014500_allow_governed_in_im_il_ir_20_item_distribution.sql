-- The reviewed in-/im-/il-/ir- compiler uses one Build binding per prefix
-- form represented by the selected four-word lesson, then fills the remaining
-- six guided spelling slots with Split bindings. Preserve the exact 20-item
-- Prefix Form Sort envelope while permitting the governed 2/4, 3/3, or 4/2
-- Split/Build distribution.

do $dynamic_prefix_20_distribution_guard$
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
  if position('D4_MOR_PREFIXES_IN_IM_IL_IR' in definition) = 0
    or position('dynamic_prefix_pedagogy_v1' in definition) = 0
    or position('meaningCheckKind'' = ''prefix_form' in definition) = 0
    or position($fixed$jsonb_array_length(candidate.value->'promptData'->'dynamicPrefixLesson'->'activities'->'guided'->'splitCanonicalWordIds') = 2$fixed$ in definition) = 0
    or position($fixed$jsonb_array_length(candidate.value->'promptData'->'dynamicPrefixLesson'->'activities'->'guided'->'builds') = 4$fixed$ in definition) = 0
  then
    raise exception 'Unexpected fixed IN/IM/IL/IR 20-item guard baseline; refusing to replace it';
  end if;

  previous_definition := definition;

  definition := replace(
    definition,
    $old$jsonb_array_length(candidate.value->'promptData'->'dynamicPrefixLesson'->'activities'->'guided'->'splitCanonicalWordIds') = 2$old$,
    $new$jsonb_array_length(candidate.value->'promptData'->'dynamicPrefixLesson'->'activities'->'guided'->'splitCanonicalWordIds') between 2 and 4$new$
  );
  definition := replace(
    definition,
    $old$jsonb_array_length(candidate.value->'promptData'->'dynamicPrefixLesson'->'activities'->'guided'->'builds') = 4$old$,
    $new$jsonb_array_length(candidate.value->'promptData'->'dynamicPrefixLesson'->'activities'->'guided'->'builds') = 6 - jsonb_array_length(candidate.value->'promptData'->'dynamicPrefixLesson'->'activities'->'guided'->'splitCanonicalWordIds')$new$
  );

  definition := replace(
    definition,
    $old$        and (
          select count(*)
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'promptData'->>'dynamicPrefixActivityId' like 'guided-strip-%'
        ) = 2$old$,
    $new$        and (
          select count(*)
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'promptData'->>'dynamicPrefixActivityId' like 'guided-strip-%'
        ) between 2 and 4
        and (
          select count(*)
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'promptData'->>'dynamicPrefixActivityId' like 'guided-strip-%'
        ) = (
          select jsonb_array_length(candidate.value->'promptData'->'dynamicPrefixLesson'->'activities'->'guided'->'splitCanonicalWordIds')
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'promptData'->>'dynamicPrefixActivityId' = 'intro-root'
        )$new$
  );
  definition := replace(
    definition,
    $old$        and (
          select count(*)
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'promptData'->>'dynamicPrefixActivityId' like 'guided-build-%'
        ) = 4$old$,
    $new$        and (
          select count(*)
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'promptData'->>'dynamicPrefixActivityId' like 'guided-build-%'
        ) = 6 - (
          select count(*)
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'promptData'->>'dynamicPrefixActivityId' like 'guided-strip-%'
        )
        and (
          select count(*)
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'promptData'->>'dynamicPrefixActivityId' like 'guided-build-%'
        ) = (
          select jsonb_array_length(candidate.value->'promptData'->'dynamicPrefixLesson'->'activities'->'guided'->'builds')
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'promptData'->>'dynamicPrefixActivityId' = 'intro-root'
        )$new$
  );

  if definition = previous_definition
    or position($revised$jsonb_array_length(candidate.value->'promptData'->'dynamicPrefixLesson'->'activities'->'guided'->'splitCanonicalWordIds') between 2 and 4$revised$ in definition) = 0
    or position($revised$jsonb_array_length(candidate.value->'promptData'->'dynamicPrefixLesson'->'activities'->'guided'->'builds') = 6 - jsonb_array_length$revised$ in definition) = 0
    or position($revised$where candidate.value->'promptData'->>'dynamicPrefixActivityId' like 'guided-strip-%'
        ) between 2 and 4$revised$ in definition) = 0
    or position($revised$where candidate.value->'promptData'->>'dynamicPrefixActivityId' like 'guided-build-%'
        ) = 6 - ($revised$ in definition) = 0
  then
    raise exception 'Could not add the governed IN/IM/IL/IR Split/Build distribution allowance';
  end if;

  execute definition;
end;
$dynamic_prefix_20_distribution_guard$;

revoke all on function public.persist_adle_composed_daily_plan_v1(
  uuid, uuid, date, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.persist_adle_composed_daily_plan_v1(
  uuid, uuid, date, jsonb, jsonb, jsonb
) to service_role;
