-- Test seed for spelling reward visuals on child My Progress
-- Purpose:
-- - create visible test data for:
--   - Nuggets in
--   - Warm Workshop / In process
--   - Gold Bars earned
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

-- 1. Remove prior test rows for these words only
delete from public.spelling_reward_events
where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'
  and target_word in (
    'zz_test_nugget_1',
    'zz_test_warm_1',
    'zz_test_warm_2',
    'zz_test_bar_1',
    'zz_test_bar_2'
  );

delete from public.spelling_reward_states
where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'
  and target_word in (
    'zz_test_nugget_1',
    'zz_test_warm_1',
    'zz_test_warm_2',
    'zz_test_bar_1',
    'zz_test_bar_2'
  );

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
) values
  (
    'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e',
    'a28d4885-8328-4853-ba11-6c676619b9ea',
    'zz_test_nugget_1',
    'golden_nugget',
    now() - interval '2 hours',
    null,
    null,
    null,
    false
  ),
  (
    'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e',
    'a28d4885-8328-4853-ba11-6c676619b9ea',
    'zz_test_warm_1',
    'warm_workshop',
    now() - interval '2 days',
    now() - interval '1 day',
    null,
    null,
    false
  ),
  (
    'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e',
    'a28d4885-8328-4853-ba11-6c676619b9ea',
    'zz_test_warm_2',
    'warm_workshop',
    now() - interval '3 days',
    now() - interval '6 hours',
    null,
    null,
    false
  ),
  (
    'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e',
    'a28d4885-8328-4853-ba11-6c676619b9ea',
    'zz_test_bar_1',
    'gold_bar_earned',
    now() - interval '4 days',
    now() - interval '3 days',
    now() - interval '2 days',
    null,
    false
  ),
  (
    'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e',
    'a28d4885-8328-4853-ba11-6c676619b9ea',
    'zz_test_bar_2',
    'gold_bar_earned',
    now() - interval '5 days',
    now() - interval '4 days',
    now() - interval '12 hours',
    null,
    false
  );

-- 3. Insert matching history events
insert into public.spelling_reward_events (
  child_id,
  parent_user_id,
  target_word,
  event_type,
  created_at,
  notes
) values
  (
    'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e',
    'a28d4885-8328-4853-ba11-6c676619b9ea',
    'zz_test_nugget_1',
    'golden_nugget_discovered',
    now() - interval '2 hours',
    'Manual test seed for nugget visual/state verification.'
  ),
  (
    'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e',
    'a28d4885-8328-4853-ba11-6c676619b9ea',
    'zz_test_warm_1',
    'golden_nugget_discovered',
    now() - interval '2 days',
    'Manual test seed for warm workshop visual/state verification.'
  ),
  (
    'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e',
    'a28d4885-8328-4853-ba11-6c676619b9ea',
    'zz_test_warm_1',
    'moved_to_warm_workshop',
    now() - interval '1 day',
    'Manual test seed for warm workshop visual/state verification.'
  ),
  (
    'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e',
    'a28d4885-8328-4853-ba11-6c676619b9ea',
    'zz_test_warm_2',
    'golden_nugget_discovered',
    now() - interval '3 days',
    'Manual test seed for second warm workshop visual/state verification.'
  ),
  (
    'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e',
    'a28d4885-8328-4853-ba11-6c676619b9ea',
    'zz_test_warm_2',
    'moved_to_warm_workshop',
    now() - interval '6 hours',
    'Manual test seed for second warm workshop visual/state verification.'
  ),
  (
    'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e',
    'a28d4885-8328-4853-ba11-6c676619b9ea',
    'zz_test_bar_1',
    'golden_nugget_discovered',
    now() - interval '4 days',
    'Manual test seed for gold bar visual/state verification.'
  ),
  (
    'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e',
    'a28d4885-8328-4853-ba11-6c676619b9ea',
    'zz_test_bar_1',
    'moved_to_warm_workshop',
    now() - interval '3 days',
    'Manual test seed for gold bar visual/state verification.'
  ),
  (
    'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e',
    'a28d4885-8328-4853-ba11-6c676619b9ea',
    'zz_test_bar_1',
    'gold_bar_earned',
    now() - interval '2 days',
    'Manual test seed for gold bar visual/state verification.'
  ),
  (
    'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e',
    'a28d4885-8328-4853-ba11-6c676619b9ea',
    'zz_test_bar_2',
    'golden_nugget_discovered',
    now() - interval '5 days',
    'Manual test seed for second gold bar visual/state verification.'
  ),
  (
    'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e',
    'a28d4885-8328-4853-ba11-6c676619b9ea',
    'zz_test_bar_2',
    'moved_to_warm_workshop',
    now() - interval '4 days',
    'Manual test seed for second gold bar visual/state verification.'
  ),
  (
    'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e',
    'a28d4885-8328-4853-ba11-6c676619b9ea',
    'zz_test_bar_2',
    'gold_bar_earned',
    now() - interval '12 hours',
    'Manual test seed for second gold bar visual/state verification.'
  );

commit;

-- 4. Verification queries

-- Current state snapshot
select
  target_word,
  reward_state,
  golden_nugget_at,
  warm_workshop_at,
  gold_bar_earned_at,
  has_converted_gold_bar
from public.spelling_reward_states
where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'
  and target_word like 'zz_test_%'
order by target_word;

-- Event history for those test words
select
  target_word,
  event_type,
  created_at
from public.spelling_reward_events
where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'
  and target_word like 'zz_test_%'
order by target_word, created_at;

-- Quick counts matching the intended machine/footer checks
select
  count(*) filter (where reward_state = 'golden_nugget') as nuggets_waiting,
  count(*) filter (where reward_state = 'warm_workshop') as in_process,
  count(*) filter (where reward_state = 'gold_bar_earned') as lifetime_gold_bars
from public.spelling_reward_states
where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'
  and target_word like 'zz_test_%';

select
  count(*) as gold_bars_in_last_5_days
from public.spelling_reward_events
where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'
  and target_word like 'zz_test_%'
  and event_type = 'gold_bar_earned'
  and created_at >= now() - interval '5 days';
