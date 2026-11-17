begin;

-- Republishing replaces the reviewed word's choice check in the new immutable
-- profile. Keep the earlier profile and all publication history intact.
do $$
declare body text;
  old_value text := $old$(p.intro_content->'validChoiceAudit')||jsonb_build_array(v_audit)$old$;
  new_value text := $new$(select coalesce(jsonb_agg(entry.value order by entry.ordinality), '[]'::jsonb)
      from jsonb_array_elements(p.intro_content->'validChoiceAudit') with ordinality entry(value,ordinality)
      where entry.value->>'word' is distinct from w.display_word)||jsonb_build_array(v_audit)$new$;
begin
  select pg_get_functiondef('public.publish_teaching_dictionary_prefix_reviewed_content(uuid,uuid)'::regprocedure) into body;
  if position(new_value in body)>0 then return; end if;
  if (length(body)-length(replace(body,old_value,'')))/length(old_value)<>1 then
    raise exception 'TEACHING_PREFIX_PUBLICATION_FUNCTION_CHANGED';
  end if;
  execute replace(body,old_value,new_value);
end $$;

notify pgrst,'reload schema';
commit;
