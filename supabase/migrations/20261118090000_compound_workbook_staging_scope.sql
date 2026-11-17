begin;

-- A disposable compound rehearsal must not broaden the staging route to
-- other children when its replacement package is published.
do $$
declare body text;
  old_scope text := $old$jsonb_build_object('schemaVersion',1,'scope',jsonb_build_object('kind','all_eligible'),'emergencyDisableAvailable',true)$old$;
  new_scope text := $new$case when p_environment='staging' and p_route_id='compound_word_lab' then r.readiness_report
      else jsonb_build_object('schemaVersion',1,'scope',jsonb_build_object('kind','all_eligible'),'emergencyDisableAvailable',true) end$new$;
begin
  select pg_get_functiondef('public.launch_teaching_dictionary_governed_package_v1(text,text,uuid[],jsonb,text,uuid,text,text,uuid,jsonb)'::regprocedure) into body;
  if position(new_scope in body)>0 then return; end if;
  if (length(body)-length(replace(body,old_scope,'')))/length(old_scope)<>1 then
    raise exception 'TEACHING_COMPOUND_LAUNCH_FUNCTION_CHANGED';
  end if;
  execute replace(body,old_scope,new_scope);
end $$;

-- A failed rehearsal restores the earlier child scope as well as its content.
do $$
declare body text;
  old_scope text := $old$jsonb_build_object('schemaVersion',1,'scope',jsonb_build_object('kind','all_eligible'),'emergencyDisableAvailable',true)$old$;
  new_scope text := $new$case when l.environment_key='staging' and l.route_id='compound_word_lab' then (select readiness_report from public.adle_route_activation_revisions where id=l.previous_activation_revision_id)
      else jsonb_build_object('schemaVersion',1,'scope',jsonb_build_object('kind','all_eligible'),'emergencyDisableAvailable',true) end$new$;
begin
  select pg_get_functiondef('public.rollback_teaching_dictionary_launch_v2(uuid,uuid,text)'::regprocedure) into body;
  if position(new_scope in body)>0 then return; end if;
  if (length(body)-length(replace(body,old_scope,'')))/length(old_scope)<>1 then
    raise exception 'TEACHING_COMPOUND_ROLLBACK_FUNCTION_CHANGED';
  end if;
  execute replace(body,old_scope,new_scope);
end $$;

notify pgrst,'reload schema';
commit;
