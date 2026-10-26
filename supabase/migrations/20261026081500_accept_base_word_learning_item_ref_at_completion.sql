-- Base Word V2 specialist assignments persist the verified learner-item link as
-- metadata.adleLearningItemRef. The historical completion RPC still checks the
-- older metadata.learningItemId field, so it rejects every V2 assignment at
-- Finish despite only learner-backed words being scheduled.
--
-- Keep the historical field for existing assignments and accept the V2 field
-- only on the lesson-production item that names the exact scheduled word.
begin;

do $migration$
declare
  v_signature constant text :=
    'public.complete_adle_base_word_family_pilot_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb)';
  v_definition text;
  v_old constant text :=
    $old$daily_assignment_id=p_assignment_id and nullif(metadata->>'learningItemId','') is not null and metadata->>'canonicalWordId'=v_row->>'canonicalWordId'$old$;
  v_new constant text :=
    $new$daily_assignment_id=p_assignment_id
        and metadata->>'sectionKey'='lesson_production'
        and coalesce(nullif(metadata->>'learningItemId',''), nullif(metadata->>'adleLearningItemRef','')) is not null
        and metadata->>'canonicalWordId'=v_row->>'canonicalWordId'$new$;
begin
  select pg_get_functiondef(to_regprocedure(v_signature)) into v_definition;
  if v_definition is null
     or length(v_definition) - length(replace(v_definition, v_old, '')) <> length(v_old) then
    raise exception 'Base Word completion learner-item guard differs from reviewed predecessor';
  end if;

  execute replace(v_definition, v_old, v_new);
end;
$migration$;

comment on function public.complete_adle_base_word_family_pilot_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb) is
  'Atomic Base Word completion; only exact learner-backed lesson-production words may enter review scheduling, accepting legacy learningItemId or V2 adleLearningItemRef.';

commit;
