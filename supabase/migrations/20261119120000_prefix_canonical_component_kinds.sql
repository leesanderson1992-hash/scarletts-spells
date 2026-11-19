begin;

-- Prefix lessons consume the complete reviewed word analysis. A prefix may
-- precede a root plus suffixes (in + vis + ible), not only a single free base.
-- Preserve all editorial, spelling, profile, and publication guards.
do $$
declare
  body text;
  old_value text := $old$part->>'kind' not in ('prefix','base','root')$old$;
  new_value text := $new$part->>'kind' not in ('prefix','base','root','suffix','connector')$new$;
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
