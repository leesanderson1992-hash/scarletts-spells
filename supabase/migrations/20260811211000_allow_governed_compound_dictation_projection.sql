-- CW-3B-1 compatibility: one approved closed-v1 dictation (`playground`)
-- belongs to the governed Production promotion batch whose specialist v1
-- importer used the historical terminal status `validated`. Pin that exact
-- authority rather than rewriting the approved dictation or weakening the
-- general v2 closure contract.

begin;

do $migration$
declare
  v_signature constant text := 'public.publish_adle_teaching_dictionary_closure_v2(jsonb,text,jsonb,text)';
  v_definition text;
  v_old text := $old$if v_dict_batch.batch_status<>'applied' then raise exception 'closure dictation batch not applied'; end if;$old$;
  v_new text := $new$if v_dict_batch.batch_status <> 'applied' and not (
      v_dict_batch.batch_status = 'validated'
      and v_dict_batch.import_mode = 'admin_import'
      and v_dict_batch.validator_version = 'adle_closed_compound_production_profile_v1'
      and v_dict_batch.source_folder_path = 'data/adle/candidates/d4-mor-remaining-profiles/v1/closed-compounds-dictionary-pool-review.json'
      and v_dict_batch.source_metadata->>'package_sha256' = '841f13b525f6be22274ad3fa0b40957e43f9fadae72ecc873003c38b32096547'
    ) then
      raise exception 'closure dictation batch not applied or exact governed closed-v1 projection';
    end if;$new$;
begin
  select pg_get_functiondef(to_regprocedure(v_signature)) into v_definition;
  if v_definition is null or position(v_old in v_definition) = 0 then
    raise exception 'Teaching Dictionary closure v2 publisher predecessor differs from reviewed CW-3B-1 contract';
  end if;
  v_definition := replace(v_definition, v_old, v_new);
  if position(v_old in v_definition) > 0 or position(v_new in v_definition) = 0 then
    raise exception 'governed closed-v1 dictation compatibility replacement was not exact';
  end if;
  execute v_definition;
end;
$migration$;

comment on function public.publish_adle_teaching_dictionary_closure_v2(jsonb,text,jsonb,text) is
  'Publishes span-aware immutable Teaching Dictionary closure v2. Exact governed closed-v1 playground dictation provenance remains compatible without changing its historical row.';

commit;
