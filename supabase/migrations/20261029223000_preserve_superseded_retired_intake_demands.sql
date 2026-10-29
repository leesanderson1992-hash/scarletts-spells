begin;

-- Activating a reclassified candidate may resolve only links to its current
-- skill. A superseded historical link is evidence, never a new activation.
do $patch$
declare definition text; old_clause text; new_clause text;
begin
  select pg_get_functiondef('public.adle_persist_canonical_intake_r8b_delegate(uuid,uuid,text,uuid,uuid,text,text,text,date,text,text,uuid,uuid,text,text)'::regprocedure)
    into definition;
  old_clause := 'where exists (select 1 from public.adle_canonical_intake_candidate_demands link where link.demand_id=demand.id and link.candidate_id=v_candidate.id)
    and not exists (select 1 from public.adle_canonical_intake_candidate_demands waiting where waiting.demand_id=demand.id and waiting.link_status=''waiting'');';
  new_clause := 'where demand.micro_skill_key=p_micro_skill_key
    and demand.lifecycle_status<>''superseded''
    and exists (select 1 from public.adle_canonical_intake_candidate_demands link
      where link.demand_id=demand.id and link.candidate_id=v_candidate.id and link.link_status=''resolved'')
    and not exists (select 1 from public.adle_canonical_intake_candidate_demands waiting
      where waiting.demand_id=demand.id and waiting.link_status=''waiting'');';
  if position(old_clause in definition)=0 or position(new_clause in definition)>0
    then raise exception 'Canonical intake activation differs from reviewed predecessor'; end if;
  execute replace(definition,old_clause,new_clause);
end $patch$;

-- Repair only the four demands linked to the approved natural reclassification.
-- Keep their original source, links, events, and resolution note for audit.
update public.adle_canonical_intake_demands demand
set lifecycle_status='superseded', activated_at=null,
  last_reconciliation_outcome='retired_skill_reclassified',
  updated_at=timezone('utc',now())
where demand.micro_skill_key='D4_SCHWA_MEDIAL_NATURAL_ACTUAL'
  and demand.normalized_target_token='natural'
  and demand.lifecycle_status='activated'
  and demand.resolution_note like 'Pending intake moved to D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS under receipt 53b170b9-4a4c-4cc4-94a3-41d2cf309b7a'
  and exists (select 1 from public.adle_canonical_intake_candidate_demands link
    where link.demand_id=demand.id
      and link.candidate_id='bf889bbb-d4c2-4b25-88ad-8c2d3f8cf09e'::uuid
      and link.link_status='superseded')
  and not exists (select 1 from public.adle_canonical_intake_candidate_demands link
    where link.demand_id=demand.id and link.link_status='waiting');

commit;
