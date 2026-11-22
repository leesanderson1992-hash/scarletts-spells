begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- December remains December in the reviewed word parts. Family identity uses
-- its normalised spelling, as existing membership readers already do.
do $$
declare body text; original text;
begin
  select pg_get_functiondef('public.create_reviewed_free_base_family_from_sense(uuid,uuid,text,uuid,text,text,text,uuid,text)'::regprocedure) into body;
  original:=body;
  body:=replace(body,$old$value->>'sourceText'=v_base.normalised_word$old$,
    $new$lower(value->>'sourceText')=v_base.normalised_word$new$);
  if body=original then raise exception 'FAMILY_BASE_CASE_GUARD_CHANGED'; end if;
  execute body;
end $$;
notify pgrst,'reload schema';
commit;
