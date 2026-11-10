begin;

-- A reviewed pilot analysis may be reimported from a one-row or renamed CSV.
-- Its old Base Word family remains compatible only for the two named words,
-- an exact unchanged decomposition, and an explicit reviewed free-base choice.
do $$
declare body text;
  old_check text := $old$d.source_reference !~ '^CSV batch [a-f0-9-]{36}, reviewed-14-word-pilot[.]csv, row [0-9]+$'$old$;
  new_check text := $new$(d.source_reference !~ '^CSV batch [a-f0-9-]{36},'
      or not (d.payload ? 'freeBaseFamilyReview'))$new$;
begin
  select pg_get_functiondef('public.teaching_dictionary_pilot_legacy_family_compatible(uuid)'::regprocedure)
    into body;
  if position(new_check in body)>0 then return; end if;
  if (length(body)-length(replace(body,old_check,'')))/length(old_check)<>1 then
    raise exception 'TEACHING_CSV_LEGACY_FAMILY_FUNCTION_CHANGED';
  end if;
  execute replace(body,old_check,new_check);
end $$;

notify pgrst,'reload schema';
commit;
