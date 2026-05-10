-- Reset one child back to a clean test-week slate without destroying
-- parent-side spelling-engine evidence.
--
-- This clears child-facing operational state:
-- - task completions
-- - task submissions
-- - task submission drafts
-- - daily spelling assignments
-- - practice attempts
-- - gold coin ledger events
-- - gold coin transfer requests
-- - spelling reward states
-- - spelling reward events
--
-- This intentionally preserves spelling-engine evidence/history:
-- - writing samples
-- - misspelling instances
-- - writing issues
-- - writing issue suggestions
-- - writing issue correction attempts
-- - learning items
-- - learning item links/evidence
-- - false-positive suppressions
--
-- It also preserves course/planning structure:
-- - courses
-- - modules
-- - tasks
-- - focus blocks
-- - checkpoints
-- - task day plans
-- - task week selections
--
-- Current configured IDs:
-- child_id: e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e
-- parent_user_id: a28d4885-8328-4853-ba11-6c676619b9ea

begin;

do $$
declare
  target_child_id uuid := 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e';
  target_parent_user_id uuid := 'a28d4885-8328-4853-ba11-6c676619b9ea';
begin
  -- Reward history and balances
  delete from public.gold_coin_transfer_requests
  where child_id = target_child_id
    and parent_user_id = target_parent_user_id;

  delete from public.child_gold_coin_ledger_events
  where child_id = target_child_id
    and parent_user_id = target_parent_user_id;

  delete from public.spelling_reward_events
  where child_id = target_child_id
    and parent_user_id = target_parent_user_id;

  delete from public.spelling_reward_states
  where child_id = target_child_id
    and parent_user_id = target_parent_user_id;

  -- Child-facing course work state
  delete from public.task_submission_drafts
  where child_id = target_child_id
    and parent_user_id = target_parent_user_id;

  delete from public.task_completions
  where child_id = target_child_id
    and parent_user_id = target_parent_user_id;

  delete from public.task_submissions
  where child_id = target_child_id
    and parent_user_id = target_parent_user_id;

  -- Child-facing spelling runtime
  delete from public.daily_assignments
  where child_id = target_child_id
    and parent_user_id = target_parent_user_id;

  delete from public.practice_attempts
  where child_id = target_child_id
    and parent_user_id = target_parent_user_id;
end $$;

commit;

-- Verification queries

select 'task_completions' as table_name, count(*) as row_count
from public.task_completions
where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'

union all

select 'task_submissions' as table_name, count(*) as row_count
from public.task_submissions
where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'

union all

select 'task_submission_drafts' as table_name, count(*) as row_count
from public.task_submission_drafts
where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'

union all

select 'child_gold_coin_ledger_events' as table_name, count(*) as row_count
from public.child_gold_coin_ledger_events
where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'

union all

select 'gold_coin_transfer_requests' as table_name, count(*) as row_count
from public.gold_coin_transfer_requests
where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'

union all

select 'spelling_reward_states' as table_name, count(*) as row_count
from public.spelling_reward_states
where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'

union all

select 'spelling_reward_events' as table_name, count(*) as row_count
from public.spelling_reward_events
where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'

union all

select 'daily_assignments' as table_name, count(*) as row_count
from public.daily_assignments
where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'

union all

select 'practice_attempts' as table_name, count(*) as row_count
from public.practice_attempts
where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea';
