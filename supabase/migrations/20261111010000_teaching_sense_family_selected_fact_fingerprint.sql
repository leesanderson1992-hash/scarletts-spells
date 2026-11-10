begin;

-- The original event stores a whole sense-set fingerprint. Keep that immutable
-- evidence, while recording the exact selected sense separately. This lets an
-- unrelated meaning be added without withdrawing a reviewed family link.
create table public.teaching_dictionary_sense_family_selected_facts (
  event_id uuid primary key references public.teaching_dictionary_sense_family_link_events(id)
    on delete restrict,
  sense_fingerprint text not null check (sense_fingerprint ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz not null default now()
);
create trigger teaching_dictionary_sense_family_selected_facts_immutable
  before update or delete on public.teaching_dictionary_sense_family_selected_facts
  for each row execute function public.reject_writing_fact_update();
alter table public.teaching_dictionary_sense_family_selected_facts enable row level security;
revoke all on public.teaching_dictionary_sense_family_selected_facts from public,anon,authenticated;
grant select,insert on public.teaching_dictionary_sense_family_selected_facts to service_role;

-- Convert only links whose original entire sense set still exactly matches
-- the current reviewed set. A changed or ambiguous old link remains stale.
insert into public.teaching_dictionary_sense_family_selected_facts(event_id,sense_fingerprint)
select e.id,public.adle_generic_snapshot_json_sha256_v1(selected.value)
from public.teaching_dictionary_sense_family_link_events e
join public.teaching_dictionary_reviewed_sense_sets s
  on s.canonical_word_id=e.canonical_word_id
cross join lateral jsonb_array_elements(s.sense_set->'senses') selected(value)
where selected.value->>'id'=e.sense_id
  and public.adle_generic_snapshot_json_sha256_v1(s.sense_set)=e.sense_set_fingerprint;

do $$
declare body text;
  marker text := $old$  returning id into v_id;
  return v_id;$old$;
  replacement text := $new$  returning id into v_id;
  insert into public.teaching_dictionary_sense_family_selected_facts(event_id,sense_fingerprint)
  values(v_id,public.adle_generic_snapshot_json_sha256_v1(v_sense));
  return v_id;$new$;
begin
  select pg_get_functiondef('public.review_teaching_dictionary_sense_family_link(
    uuid,uuid,text,text,text,text,uuid,text)'::regprocedure) into body;
  if position('teaching_dictionary_sense_family_selected_facts' in body)>0 then return; end if;
  if (length(body)-length(replace(body,marker,'')))/length(marker)<>1 then
    raise exception 'TEACHING_SENSE_FAMILY_REVIEW_FUNCTION_CHANGED';
  end if;
  execute replace(body,marker,replacement);
end $$;

create or replace view public.teaching_dictionary_current_sense_family_links as
with latest as (
  select distinct on (canonical_word_id,sense_id,family_key,component_part_id) *
  from public.teaching_dictionary_sense_family_link_events
  order by canonical_word_id,sense_id,family_key,component_part_id,event_sequence desc
), current_families as (
  select distinct on (family_key) * from public.canonical_teaching_dictionary_lexical_base_families
  order by family_key,revision desc
)
select e.id,e.canonical_word_id,e.sense_id,e.family_key,
  f.revision as current_family_revision,e.component_part_id,e.canonical_morphology_id,
  e.base_meaning,e.reviewed_by,e.reviewed_at,m.relationship_kind
from latest e
join current_families f on f.family_key=e.family_key and f.review_status='approved'
join public.canonical_teaching_dictionary_lexical_base_family_members m
  on m.family_key=f.family_key and m.revision=f.revision
    and m.canonical_word_id=e.canonical_word_id
    and m.canonical_morphology_id=e.canonical_morphology_id
join public.canonical_teaching_dictionary_word_morphology morph
  on morph.id=e.canonical_morphology_id and morph.row_status='active'
join public.teaching_dictionary_reviewed_sense_sets s
  on s.canonical_word_id=e.canonical_word_id
join lateral (
  select value from jsonb_array_elements(s.sense_set->'senses')
  where value->>'id'=e.sense_id
) selected on true
left join public.teaching_dictionary_sense_family_selected_facts selected_fact
  on selected_fact.event_id=e.id
where e.action='approve' and f.base_meaning=e.base_meaning
  and (selected_fact.event_id is not null and
    public.adle_generic_snapshot_json_sha256_v1(selected.value)=selected_fact.sense_fingerprint
    or selected_fact.event_id is null and
    public.adle_generic_snapshot_json_sha256_v1(s.sense_set)=e.sense_set_fingerprint);
revoke all on public.teaching_dictionary_current_sense_family_links from public,anon,authenticated;
grant select on public.teaching_dictionary_current_sense_family_links to service_role;

notify pgrst,'reload schema';
commit;
