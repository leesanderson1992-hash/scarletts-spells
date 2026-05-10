-- Larger test seed for spelling reward visuals on child My Progress
-- Purpose:
-- - stress-test the Section 1 machine visuals with:
--   - 8 nuggets waiting
--   - 10 words in warm workshop / in process
--   - 8 gold bars earned in the last 5 days
-- - create matching spelling_reward_events rows so event-based counters can be checked too
--
-- Current configured IDs:
-- child_id: e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e
-- parent_user_id: a28d4885-8328-4853-ba11-6c676619b9ea
--
-- Safe to re-run:
-- - this script clears only the test words listed below
-- - then reinserts them with deterministic states/events

begin;

-- 1. Remove prior large-test rows for these words only
delete from public.spelling_reward_events
where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'
  and target_word like 'zz_big_test_%';

delete from public.spelling_reward_states
where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'
  and target_word like 'zz_big_test_%';

-- 2. Insert deterministic current-state rows
insert into public.spelling_reward_states (
  child_id,
  parent_user_id,
  target_word,
  reward_state,
  golden_nugget_at,
  warm_workshop_at,
  gold_bar_earned_at,
  gold_bar_converted_at,
  has_converted_gold_bar
)
select
  'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e',
  'a28d4885-8328-4853-ba11-6c676619b9ea',
  word_name,
  reward_state,
  golden_nugget_at,
  warm_workshop_at,
  gold_bar_earned_at,
  null,
  false
from (
  -- 8 nuggets waiting
  select
    'zz_big_test_nugget_' || gs::text as word_name,
    'golden_nugget'::text as reward_state,
    now() - ((gs || ' hours')::interval) as golden_nugget_at,
    null::timestamptz as warm_workshop_at,
    null::timestamptz as gold_bar_earned_at
  from generate_series(1, 8) as gs

  union all

  -- 10 in process
  select
    'zz_big_test_warm_' || gs::text as word_name,
    'warm_workshop'::text as reward_state,
    now() - (((gs + 1) || ' days')::interval) as golden_nugget_at,
    now() - ((gs || ' hours')::interval) as warm_workshop_at,
    null::timestamptz as gold_bar_earned_at
  from generate_series(1, 10) as gs

  union all

  -- 8 gold bars earned in the last 5 days
  select
    'zz_big_test_bar_' || gs::text as word_name,
    'gold_bar_earned'::text as reward_state,
    now() - (((gs + 2) || ' days')::interval) as golden_nugget_at,
    now() - (((gs + 1) || ' days')::interval) as warm_workshop_at,
    now() - (((gs % 5) || ' days')::interval) - ((gs || ' hours')::interval) as gold_bar_earned_at
  from generate_series(1, 8) as gs
) seeded_words(word_name, reward_state, golden_nugget_at, warm_workshop_at, gold_bar_earned_at);

-- 3. Insert matching history events
insert into public.spelling_reward_events (
  child_id,
  parent_user_id,
  target_word,
  event_type,
  created_at,
  notes
)
select
  'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e',
  'a28d4885-8328-4853-ba11-6c676619b9ea',
  target_word,
  event_type,
  created_at,
  notes
from (
  -- 8 nugget discovered events
  select
    'zz_big_test_nugget_' || gs::text as target_word,
    'golden_nugget_discovered'::text as event_type,
    now() - ((gs || ' hours')::interval) as created_at,
    'Large manual test seed for nugget visual/state verification.'::text as notes
  from generate_series(1, 8) as gs

  union all

  -- 10 warm workshop event chains
  select
    'zz_big_test_warm_' || gs::text as target_word,
    'golden_nugget_discovered'::text as event_type,
    now() - (((gs + 1) || ' days')::interval) as created_at,
    'Large manual test seed for warm workshop visual/state verification.'::text as notes
  from generate_series(1, 10) as gs

  union all

  select
    'zz_big_test_warm_' || gs::text as target_word,
    'moved_to_warm_workshop'::text as event_type,
    now() - ((gs || ' hours')::interval) as created_at,
    'Large manual test seed for warm workshop visual/state verification.'::text as notes
  from generate_series(1, 10) as gs

  union all

  -- 8 full gold bar chains within last 5 days
  select
    'zz_big_test_bar_' || gs::text as target_word,
    'golden_nugget_discovered'::text as event_type,
    now() - (((gs + 2) || ' days')::interval) as created_at,
    'Large manual test seed for gold bar visual/state verification.'::text as notes
  from generate_series(1, 8) as gs

  union all

  select
    'zz_big_test_bar_' || gs::text as target_word,
    'moved_to_warm_workshop'::text as event_type,
    now() - (((gs + 1) || ' days')::interval) as created_at,
    'Large manual test seed for gold bar visual/state verification.'::text as notes
  from generate_series(1, 8) as gs

  union all

  select
    'zz_big_test_bar_' || gs::text as target_word,
    'gold_bar_earned'::text as event_type,
    now() - (((gs % 5) || ' days')::interval) - ((gs || ' hours')::interval) as created_at,
    'Large manual test seed for gold bar visual/state verification.'::text as notes
  from generate_series(1, 8) as gs
) seeded_events(target_word, event_type, created_at, notes);

commit;

-- 4. Verification queries

-- Current state snapshot
select
  reward_state,
  count(*) as word_count
from public.spelling_reward_states
where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'
  and target_word like 'zz_big_test_%'
group by reward_state
order by reward_state;

-- Event history counts
select
  event_type,
  count(*) as event_count
from public.spelling_reward_events
where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'
  and target_word like 'zz_big_test_%'
group by event_type
order by event_type;

-- Quick counts matching the intended machine/footer checks
select
  count(*) filter (where reward_state = 'golden_nugget') as nuggets_waiting,
  count(*) filter (where reward_state = 'warm_workshop') as in_process,
  count(*) filter (where reward_state = 'gold_bar_earned') as lifetime_gold_bars
from public.spelling_reward_states
where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'
  and target_word like 'zz_big_test_%';

select
  count(*) as gold_bars_in_last_5_days
from public.spelling_reward_events
where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'
  and target_word like 'zz_big_test_%'
  and event_type = 'gold_bar_earned'
  and created_at >= now() - interval '5 days';
