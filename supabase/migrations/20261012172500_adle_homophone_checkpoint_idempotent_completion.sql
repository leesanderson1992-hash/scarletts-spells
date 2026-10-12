-- Existing ADLE completion convergence touches the already completed checkpoint.
-- Permit that idempotent timestamp update; keep answer and completed-state locks.
begin;
create or replace function public.guard_homophone_checkpoint_v2() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare s jsonb; k text; v jsonb;
begin
  select compiled_lesson_snapshot into s from public.daily_assignments where id=new.daily_assignment_id;
  if s#>>'{route,routeId}' is distinct from 'homophone_word_lab' then return new; end if;
  if new.adapter_key is distinct from 'homophone_v2' or new.checkpoint_schema_version is distinct from 'homophone_progress_v1'
    or new.lesson_snapshot_fingerprint is distinct from s#>>'{provenance,sourceFingerprint}'
    or jsonb_typeof(new.checkpoint_payload->'state') is distinct from 'object' then raise exception 'homophone checkpoint invalid'; end if;
  if tg_op='INSERT' and new.checkpoint_payload#>'{state,completed}' is distinct from 'false'::jsonb then raise exception 'homophone checkpoint invalid'; end if;
  if tg_op='UPDATE' then
    if (old.checkpoint_payload#>'{state,binSortCompleted}'='true'::jsonb and new.checkpoint_payload#>'{state,binSortCompleted}' is distinct from 'true'::jsonb)
      or (old.checkpoint_payload#>'{state,balloonCompleted}'='true'::jsonb and new.checkpoint_payload#>'{state,balloonCompleted}' is distinct from 'true'::jsonb)
      then raise exception 'homophone guided completion locked'; end if;
    if new.checkpoint_payload#>'{state,completed}'='true'::jsonb
      and old.checkpoint_payload#>'{state,completed}'='false'::jsonb
      and (new.checkpoint_payload is distinct from jsonb_set(old.checkpoint_payload,'{state,completed}','true'::jsonb)
        or new.completed_at is null) then raise exception 'homophone checkpoint completion invalid'; end if;
    if old.checkpoint_payload#>'{state,completed}'='true'::jsonb and old.checkpoint_payload is distinct from new.checkpoint_payload then raise exception 'homophone completed progress locked'; end if;
    for k,v in select * from jsonb_each(old.checkpoint_payload#>'{state,coverAttempts}') loop
      if new.checkpoint_payload#>'{state,coverAttempts}'->k is distinct from v then raise exception 'homophone cover answer locked'; end if;
    end loop;
    for k,v in select * from jsonb_each(old.checkpoint_payload#>'{state,dictationChecked}') loop
      if v='true'::jsonb and (new.checkpoint_payload#>'{state,dictationChecked}'->k is distinct from v
        or new.checkpoint_payload#>'{state,dictationValues}'->k is distinct from old.checkpoint_payload#>'{state,dictationValues}'->k) then raise exception 'homophone dictation answer locked'; end if;
    end loop;
    if jsonb_array_length(new.checkpoint_payload#>'{state,choiceMistakes}')<jsonb_array_length(old.checkpoint_payload#>'{state,choiceMistakes}')
      or exists(select 1 from jsonb_array_elements(old.checkpoint_payload#>'{state,choiceMistakes}') with ordinality o(value,idx)
        where new.checkpoint_payload#>'{state,choiceMistakes}'->(o.idx-1)::integer is distinct from o.value) then raise exception 'homophone guided mistakes locked'; end if;
  end if;
  return new;
end $$;
commit;
