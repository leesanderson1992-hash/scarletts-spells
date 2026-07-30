-- Closed compounds are the sole compound profile with 4 jigsaws + 4 meaning links.
-- The composed-plan guard is deliberately narrowed to a signed closed-compound
-- snapshot; other plans remain restricted to their established 16/18 item forms.
do $closed_compound_guard$
declare definition text;
begin
  select pg_get_functiondef('public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb)'::regprocedure) into definition;
  if definition is null then raise exception 'Missing ADLE composed-plan persistence function'; end if;
  definition := replace(definition,
    $old$          )
        )
      )
    )
  then
    raise exception 'ADLE composed plan requires 16 items, except the reviewed 18-item SUB/INTER/SUPER or FUL/LESS snapshot';$old$,
    $new$          )
          or (
            exists (
              select 1
              from jsonb_array_elements(p_items) as candidate(value)
              where candidate.value->'promptData'->>'closedCompoundActivityId' = 'intro-root'
                and candidate.value->'promptData'->'closedCompoundLesson'->>'microSkillId' = 'D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS'
            )
            and not exists (
              select 1
              from jsonb_array_elements(p_items) as candidate(value)
              where candidate.value->'metadata'->>'provenance' is distinct from 'closed_compound_v1'
                or candidate.value->'metadata'->>'microSkillKey' is distinct from 'D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS'
            )
          )
        )
      )
    )
  then
    raise exception 'ADLE composed plan requires 16 items, except the reviewed 18-item SUB/INTER/SUPER or FUL/LESS snapshot';$new$);
  if definition !~ 'closed_compound_v1' then raise exception 'Could not add the narrow closed-compound 18-item allowance'; end if;
  execute definition;
end;
$closed_compound_guard$;
