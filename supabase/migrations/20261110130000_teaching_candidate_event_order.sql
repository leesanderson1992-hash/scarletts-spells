begin;

-- Transaction timestamps tie when an approval is replayed then withdrawn.
-- A database sequence gives the current projection an unambiguous order.
alter table public.teaching_dictionary_candidate_decision_events
  add column event_sequence bigint generated always as identity unique;
drop view public.teaching_dictionary_current_candidate_decisions;
create view public.teaching_dictionary_current_candidate_decisions as
select distinct on (environment_key,canonical_word_id,micro_skill_key,sense_id)
  id,environment_key,canonical_word_id,micro_skill_key,sense_id,action,
  pronunciation_id,rule_revision,fact_snapshot,fact_fingerprint,
  request_id,reviewed_by,source_kind,recorded_at,event_sequence
from public.teaching_dictionary_candidate_decision_events
order by environment_key,canonical_word_id,micro_skill_key,sense_id,event_sequence desc;
revoke all on public.teaching_dictionary_current_candidate_decisions from public,anon,authenticated;
grant select on public.teaching_dictionary_current_candidate_decisions to service_role;

notify pgrst,'reload schema';
commit;
