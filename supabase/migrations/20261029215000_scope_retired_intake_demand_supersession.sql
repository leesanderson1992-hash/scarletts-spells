begin;

-- Supersede only demand rows historically linked to the candidate being
-- reclassified. Other children's old-skill demand history is untouched.
do $patch$
declare definition text; old_clause text; new_clause text;
begin
  select pg_get_functiondef('public.adle_reclassify_retired_pending_intake_v1(uuid,text,uuid,uuid,text)'::regprocedure)
    into definition;
  old_clause := 'and not exists(select 1 from public.adle_canonical_intake_candidate_demands link
        where link.demand_id=demand.id and link.link_status=''waiting'') for update';
  new_clause := 'and exists(select 1 from public.adle_canonical_intake_candidate_demands link
        where link.demand_id=demand.id and link.candidate_id=candidate.id)
      and not exists(select 1 from public.adle_canonical_intake_candidate_demands link
        where link.demand_id=demand.id and link.link_status=''waiting'') for update';
  if position(old_clause in definition)=0 or position(new_clause in definition)>0
    then raise exception 'Retired intake reclassifier differs from reviewed predecessor'; end if;
  execute replace(definition,old_clause,new_clause);
end $patch$;

commit;
