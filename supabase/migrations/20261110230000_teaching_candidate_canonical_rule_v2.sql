begin;

-- Candidate approval now requires exact canonical parts, joins, display ranges
-- and word sum. The database must accept only that evaluator revision.
do $$
declare body text;
  old_rule text := '''reviewed_overview_candidate_v1''';
  new_rule text := '''reviewed_overview_candidate_v2''';
begin
  select pg_get_functiondef('public.reconcile_teaching_dictionary_bulk_review_v4(
    text,text,uuid[],uuid[],uuid[],uuid[],uuid[],jsonb,uuid,uuid,text,text,jsonb
  )'::regprocedure) into body;
  if position(new_rule in body)>0 and position(old_rule in body)=0 then return; end if;
  if (length(body)-length(replace(body,old_rule,'')))/length(old_rule)<>1 then
    raise exception 'TEACHING_CANDIDATE_RULE_FUNCTION_CHANGED';
  end if;
  execute replace(body,old_rule,new_rule);
end $$;

notify pgrst,'reload schema';
commit;
