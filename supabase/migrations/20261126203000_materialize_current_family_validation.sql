begin;
-- Keep approval/removal semantics unchanged. Avoid repeated expansion and
-- fingerprinting of the complete current morphology view for each membership.
create or replace view public.teaching_dictionary_current_sense_family_memberships as
with latest as (
  select distinct on (canonical_word_id,sense_id,family_key,component_part_id) *
  from public.teaching_dictionary_sense_family_membership_events
  order by canonical_word_id,sense_id,family_key,component_part_id,event_sequence desc
), current_analyses as materialized (
  select id,canonical_word_id,sense_id
  from public.teaching_dictionary_current_sense_morphology
), current_families as materialized (
  select distinct on (family_key) *
  from public.teaching_dictionary_families_with_current_meaning
  order by family_key,revision desc
)
select e.id,e.canonical_word_id,e.sense_id,e.sense_morphology_id,
  e.family_key,f.revision as current_family_revision,e.component_part_id,
  f.base_meaning,e.relationship_kind,e.reviewed_by,e.reviewed_at
from latest e
join current_analyses analysis on analysis.id=e.sense_morphology_id
  and analysis.canonical_word_id=e.canonical_word_id and analysis.sense_id=e.sense_id
join current_families f on f.family_key=e.family_key and f.review_status='approved'
left join public.teaching_dictionary_family_meaning_changes change
  on change.canonical_word_id=f.canonical_base_word_id and change.sense_id=f.canonical_base_sense_id
where e.action='approve'
  and (change.changed_at is null or change.changed_at<e.reviewed_at)
  and (f.canonical_base_sense_id is not null or f.base_meaning=e.base_meaning)
  and not exists(select 1 from public.teaching_dictionary_grammatical_family_links g
    where g.family_key=e.family_key and g.canonical_word_id=e.canonical_word_id)
  and not exists(select 1 from public.teaching_dictionary_spelling_family_link_removals removed
    where removed.canonical_word_id=e.canonical_word_id and removed.family_key=e.family_key);
commit;
