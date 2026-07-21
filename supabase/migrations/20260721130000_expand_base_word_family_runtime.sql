-- Expand the reviewed base-word route without changing its six-word lesson
-- shape, assignment bindings, completion semantics, or transfer safeguards.

alter table public.adle_base_word_family_pilot_runs
  drop constraint if exists adle_base_word_family_pilot_runs_pilot_lesson_number_check;

alter table public.adle_base_word_family_pilot_runs
  add constraint adle_base_word_family_pilot_runs_pilot_lesson_number_check
  check (pilot_lesson_number > 0);

do $$
declare definition text;
begin
  select pg_get_functiondef('public.persist_adle_base_word_family_pilot_v1(uuid,uuid,date,jsonb,jsonb)'::regprocedure) into definition;
  if definition is null then raise exception 'Missing base-word family persistence function'; end if;
  definition := regexp_replace(
    definition,
    'if v_run_number > 5 then raise exception ''ADLE base-word pilot has reached its five-lesson cap''; end if;',
    'null;'
  );
  if definition like '%five-lesson cap%' then raise exception 'Could not remove base-word family lesson cap'; end if;
  execute definition;

  select pg_get_functiondef('public.complete_adle_base_word_family_pilot_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb)'::regprocedure) into definition;
  if definition is null then raise exception 'Missing base-word family completion function'; end if;
  definition := replace(
    definition,
    $old$if p_micro_skill_key <> 'D4_MOR_BASE_WORDS_PRESERVE_BASE' or nullif(btrim(p_source_ref),'') is null$old$,
    $new$if p_micro_skill_key not in ('D4_MOR_BASE_WORDS_PRESERVE_BASE', 'D4_MOR_BASE_WORDS_IDENTIFY_BASE') or nullif(btrim(p_source_ref),'') is null$new$
  );
  if definition like '%p_micro_skill_key <> ''D4_MOR_BASE_WORDS_PRESERVE_BASE''%' then raise exception 'Could not expand supported base-word micro-skills'; end if;
  execute definition;
end;
$$;
