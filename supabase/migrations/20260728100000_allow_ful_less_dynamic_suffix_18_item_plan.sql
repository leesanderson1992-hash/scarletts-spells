-- The reviewed -ful/-less suffix profile needs two form-specific cleavers,
-- four meaning-sort bindings and two form-specific builds. Permit that exact
-- 18-item Dynamic Affix v3 snapshot without relaxing any other plan shape.

do $$
declare definition text;
begin
  select pg_get_functiondef(
    'public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb)'::regprocedure
  ) into definition;

  if definition is null then
    raise exception 'Missing ADLE composed-plan persistence function';
  end if;

  definition := replace(
    definition,
    $old$if jsonb_typeof(p_items) <> 'array'
    or (
      jsonb_array_length(p_items) <> 16
      and (
        jsonb_array_length(p_items) <> 18
        or not exists (
          select 1
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'promptData'->>'dynamicPrefixActivityId' = 'intro-root'
            and candidate.value->'promptData'->'dynamicPrefixLesson'->>'microSkillId' = 'D4_MOR_PREFIXES_SUB_INTER_SUPER'
        )
        or exists (
          select 1
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'metadata'->>'provenance' is distinct from 'dynamic_prefix_v2'
            or candidate.value->'metadata'->>'microSkillKey' is distinct from 'D4_MOR_PREFIXES_SUB_INTER_SUPER'
        )
      )
    )
  then
    raise exception 'ADLE composed plan requires exactly 16 items, except the reviewed 18-item SUB/INTER/SUPER Dynamic Prefix snapshot';
  end if;$old$,
    $new$if jsonb_typeof(p_items) <> 'array'
    or (
      jsonb_array_length(p_items) <> 16
      and (
        jsonb_array_length(p_items) <> 18
        or not (
          (
            exists (
              select 1
              from jsonb_array_elements(p_items) as candidate(value)
              where candidate.value->'promptData'->>'dynamicPrefixActivityId' = 'intro-root'
                and candidate.value->'promptData'->'dynamicPrefixLesson'->>'microSkillId' = 'D4_MOR_PREFIXES_SUB_INTER_SUPER'
            )
            and not exists (
              select 1
              from jsonb_array_elements(p_items) as candidate(value)
              where candidate.value->'metadata'->>'provenance' is distinct from 'dynamic_prefix_v2'
                or candidate.value->'metadata'->>'microSkillKey' is distinct from 'D4_MOR_PREFIXES_SUB_INTER_SUPER'
            )
          )
          or
          (
            exists (
              select 1
              from jsonb_array_elements(p_items) as candidate(value)
              where candidate.value->'promptData'->>'dynamicAffixActivityId' = 'intro-root'
                and candidate.value->'promptData'->'dynamicAffixLesson'->>'microSkillId' = 'D4_MOR_SUFFIXES_FUL_LESS'
                and candidate.value->'promptData'->'dynamicAffixLesson'->'activities'->'guided'->>'includeMeaningSort' = 'true'
            )
            and not exists (
              select 1
              from jsonb_array_elements(p_items) as candidate(value)
              where candidate.value->'metadata'->>'provenance' is distinct from 'dynamic_affix_v3'
                or candidate.value->'metadata'->>'microSkillKey' is distinct from 'D4_MOR_SUFFIXES_FUL_LESS'
            )
          )
        )
      )
    )
  then
    raise exception 'ADLE composed plan requires 16 items, except the reviewed 18-item SUB/INTER/SUPER or FUL/LESS snapshot';
  end if;$new$
  );

  if definition !~ 'reviewed 18-item SUB/INTER/SUPER or FUL/LESS snapshot' then
    raise exception 'ADLE composed-plan persistence function did not match the expected guarded 18-item definition';
  end if;

  execute definition;
end;
$$;
