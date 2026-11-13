begin;

-- Candidate rules need the approved member relationship as well as the
-- sense/component link. Keep existing projection columns and append the kind.
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
where e.action='approve' and f.base_meaning=e.base_meaning
  and public.adle_generic_snapshot_json_sha256_v1(s.sense_set)=e.sense_set_fingerprint;
revoke all on public.teaching_dictionary_current_sense_family_links from public,anon,authenticated;
grant select on public.teaching_dictionary_current_sense_family_links to service_role;

notify pgrst,'reload schema';
commit;
