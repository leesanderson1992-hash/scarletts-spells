begin;

-- A review hold is distinct from an editor removing a word from a lesson.
-- Keep the exact event: a later removal must not inherit this exception.
alter table public.teaching_dictionary_schwa_syllable_reviews
  add column reset_deassignment_event_id uuid
  references public.teaching_dictionary_pair_decision_events(id);

create view public.teaching_dictionary_pending_syllable_review_resets as
select r.environment_key,r.canonical_word_id,r.micro_skill_key,r.reset_at,
  e.id as deassignment_id
from public.teaching_dictionary_schwa_syllable_reviews r
join public.teaching_dictionary_pair_decision_events e
  on e.id=r.reset_deassignment_event_id
  and e.environment_key=r.environment_key
  and e.canonical_word_id=r.canonical_word_id
  and e.micro_skill_key=r.micro_skill_key
  and e.action='deassign' and e.decided_by=r.reset_by
  and e.decided_at>=r.reset_at
join public.teaching_dictionary_pair_latest_decisions d on d.id=e.id
where r.resolved_at is null;

revoke all on public.teaching_dictionary_pending_syllable_review_resets from public,anon,authenticated;
grant select on public.teaching_dictionary_pending_syllable_review_resets to service_role;
notify pgrst,'reload schema';
commit;
