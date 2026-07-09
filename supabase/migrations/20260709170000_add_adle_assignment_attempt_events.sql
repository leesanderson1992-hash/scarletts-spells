-- ADLE 7R: item-level attempt ledger for child session submissions.
--
-- This table records what the child actually typed for ADLE assignment items.
-- It is intentionally separate from taught history, scheduled-review outcome
-- events, and authentic-use events:
-- - first-exposure lesson mistakes are audit/teaching evidence, not failures
-- - scheduled review attempts are still classified by adle_review_outcome_events
-- - controlled spelling/dictation/guided prompts are never authentic-use facts

create table if not exists public.adle_assignment_attempt_events (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  daily_assignment_id uuid not null references public.daily_assignments(id) on delete cascade,
  assignment_item_id uuid not null references public.assignment_items(id) on delete cascade,
  canonical_word_id uuid references public.canonical_teaching_dictionary_words(id) on delete restrict,
  micro_skill_key text references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  section_key text not null,
  template_key text,
  target_word text,
  attempt_text text,
  is_correct boolean,
  attempt_kind text not null,
  evidence_class text not null,
  source_ref text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint adle_assignment_attempt_events_section_check
    check (btrim(section_key) <> ''),
  constraint adle_assignment_attempt_events_kind_check
    check (attempt_kind = any (array[
      'review_production',
      'lesson_production',
      'lesson_dictation',
      'lesson_probe',
      'guided_practice',
      'reflection_retry'
    ])),
  constraint adle_assignment_attempt_events_class_check
    check (evidence_class = any (array[
      'scheduled_review_attempt',
      'first_exposure_lesson_attempt',
      'diagnostic_probe_attempt',
      'guided_practice_attempt',
      'reflection_attempt'
    ])),
  constraint adle_assignment_attempt_events_ref_check
    check (btrim(source_ref) <> '')
);

create unique index if not exists adle_assignment_attempt_events_idempotency_idx
  on public.adle_assignment_attempt_events(assignment_item_id, attempt_kind, source_ref);

create index if not exists adle_assignment_attempt_events_assignment_idx
  on public.adle_assignment_attempt_events(daily_assignment_id, assignment_item_id);

create index if not exists adle_assignment_attempt_events_child_word_idx
  on public.adle_assignment_attempt_events(child_id, canonical_word_id, created_at);

alter table public.adle_assignment_attempt_events enable row level security;

revoke all on table public.adle_assignment_attempt_events from anon, authenticated;
grant all on table public.adle_assignment_attempt_events to service_role;
