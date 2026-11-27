begin;
set local lock_timeout='5s';
-- Atomic meaning and family-link reviews must follow actual review time.
alter table public.teaching_dictionary_sense_family_membership_events
  alter column reviewed_at set default clock_timestamp();
commit;
