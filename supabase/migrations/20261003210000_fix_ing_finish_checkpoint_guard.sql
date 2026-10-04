begin;

-- Completing an assignment also runs the shared session-convergence trigger,
-- which performs a second metadata-only update on the completed checkpoint.
-- Permit that idempotent update while keeping the frozen learner payload locked.
create or replace function public.guard_ing_checkpoint_v1() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare s jsonb; k text; v jsonb;
begin
  select compiled_lesson_snapshot into s from public.daily_assignments where id=new.daily_assignment_id;
  if s#>>'{route,routeId}' is distinct from 'ing_endings_word_lab' then return new; end if;
  if new.adapter_key is distinct from 'ing_endings_v1' or new.checkpoint_schema_version is distinct from 'ing_progress_v1'
    or new.checkpoint_payload#>>'{state,assignmentKey}' is distinct from s#>>'{payload,resolvedLesson,assignmentKey}' then raise exception 'ing checkpoint invalid'; end if;
  if tg_op='INSERT' and new.checkpoint_payload#>'{state,finished}' is distinct from 'false'::jsonb then raise exception 'ing checkpoint invalid'; end if;
  if tg_op='UPDATE' then
    if old.checkpoint_payload#>'{state,finished}'='false'::jsonb and new.checkpoint_payload#>'{state,finished}'='true'::jsonb then
      if new.checkpoint_payload is distinct from jsonb_set(old.checkpoint_payload,'{state,finished}','true'::jsonb)
        or new.completed_at is null then raise exception 'ing checkpoint completion invalid'; end if;
    elsif old.checkpoint_payload#>'{state,finished}'='true'::jsonb then
      if new.checkpoint_payload is distinct from old.checkpoint_payload then raise exception 'ing completed progress locked'; end if;
    elsif new.checkpoint_payload#>'{state,finished}'='true'::jsonb then
      raise exception 'ing checkpoint completion invalid';
    end if;
    for k,v in select * from jsonb_each(old.checkpoint_payload#>'{state,coverAttempts}') loop
      if new.checkpoint_payload#>'{state,coverAttempts}'->k is distinct from v then raise exception 'ing cover answer locked'; end if;
    end loop;
    for v in select value from jsonb_array_elements(old.checkpoint_payload#>'{state,dictationChecked}') loop
      k:=v#>>'{}';
      if not (new.checkpoint_payload#>'{state,dictationChecked}') ? k
        or new.checkpoint_payload#>'{state,dictationValues}'->k is distinct from old.checkpoint_payload#>'{state,dictationValues}'->k then raise exception 'ing dictation answer locked'; end if;
    end loop;
  end if;
  return new;
end $$;

commit;
