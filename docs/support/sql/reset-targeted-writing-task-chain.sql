-- Reset one targeted-writing task chain back to an incomplete test state.
--
-- This clears only the selected child + parent + task chain:
-- - task submissions
-- - task completions
-- - linked writing samples
-- - linked misspelling instances
-- - linked writing issue suggestions
-- - linked writing issues
-- - linked writing issue correction attempts
-- - linked learning-item evidence written from those submissions
--
-- It intentionally keeps:
-- - course / module / task definitions
-- - unrelated submissions for other tasks
-- - unrelated learning items and rewards
--
-- Use this on sacrificial QA task chains.
-- If the chosen task already produced finalised writing issues that created
-- learning items, deleting those issues will also remove the derived
-- learning-item chain for that task.
--
-- Update these IDs before running:
-- child_id: e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e
-- parent_user_id: a28d4885-8328-4853-ba11-6c676619b9ea
-- task_id: 00000000-0000-0000-0000-000000000000

begin;

do $$
declare
  target_child_id uuid := 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e';
  target_parent_user_id uuid := 'a28d4885-8328-4853-ba11-6c676619b9ea';
  target_task_id uuid := '00000000-0000-0000-0000-000000000000';
begin
  -- Remove any canonical evidence that was written from this submission chain.
  delete from public.learning_item_evidence
  where task_submission_id in (
    select submission.id
    from public.task_submissions as submission
    where submission.child_id = target_child_id
      and submission.parent_user_id = target_parent_user_id
      and submission.task_id = target_task_id
  );

  -- Remove correction attempts first so issue deletes stay simple and explicit.
  delete from public.writing_issue_correction_attempts
  where task_submission_id in (
    select submission.id
    from public.task_submissions as submission
    where submission.child_id = target_child_id
      and submission.parent_user_id = target_parent_user_id
      and submission.task_id = target_task_id
  )
  or writing_issue_id in (
    select issue.id
    from public.writing_issues as issue
    where issue.child_id = target_child_id
      and issue.parent_user_id = target_parent_user_id
      and issue.task_submission_id in (
        select submission.id
        from public.task_submissions as submission
        where submission.child_id = target_child_id
          and submission.parent_user_id = target_parent_user_id
          and submission.task_id = target_task_id
      )
  );

  delete from public.writing_issue_suggestions
  where child_id = target_child_id
    and parent_user_id = target_parent_user_id
    and task_submission_id in (
      select submission.id
      from public.task_submissions as submission
      where submission.child_id = target_child_id
        and submission.parent_user_id = target_parent_user_id
        and submission.task_id = target_task_id
    );

  -- Deleting issues also removes any derived learning_items through
  -- source_writing_issue_id cascade.
  delete from public.writing_issues
  where child_id = target_child_id
    and parent_user_id = target_parent_user_id
    and task_submission_id in (
      select submission.id
      from public.task_submissions as submission
      where submission.child_id = target_child_id
        and submission.parent_user_id = target_parent_user_id
        and submission.task_id = target_task_id
    );

  delete from public.misspelling_instances
  where writing_sample_id in (
    select sample.id
    from public.writing_samples as sample
    where sample.child_id = target_child_id
      and sample.parent_user_id = target_parent_user_id
      and sample.task_submission_id in (
        select submission.id
        from public.task_submissions as submission
        where submission.child_id = target_child_id
          and submission.parent_user_id = target_parent_user_id
          and submission.task_id = target_task_id
      )
  );

  delete from public.writing_samples
  where child_id = target_child_id
    and parent_user_id = target_parent_user_id
    and task_submission_id in (
      select submission.id
      from public.task_submissions as submission
      where submission.child_id = target_child_id
        and submission.parent_user_id = target_parent_user_id
        and submission.task_id = target_task_id
    );

  delete from public.task_submissions
  where child_id = target_child_id
    and parent_user_id = target_parent_user_id
    and task_id = target_task_id;

  delete from public.task_completions
  where child_id = target_child_id
    and parent_user_id = target_parent_user_id
    and task_id = target_task_id;
end $$;

commit;

-- Verification queries

select 'task_completions' as table_name, count(*) as row_count
from public.task_completions
where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'
  and task_id = '00000000-0000-0000-0000-000000000000'

union all

select 'task_submissions' as table_name, count(*) as row_count
from public.task_submissions
where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'
  and task_id = '00000000-0000-0000-0000-000000000000'

union all

select 'writing_samples' as table_name, count(*) as row_count
from public.writing_samples
where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'
  and task_submission_id in (
    select id
    from public.task_submissions
    where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
      and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'
      and task_id = '00000000-0000-0000-0000-000000000000'
  )

union all

select 'writing_issue_suggestions' as table_name, count(*) as row_count
from public.writing_issue_suggestions
where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'
  and task_submission_id in (
    select id
    from public.task_submissions
    where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
      and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'
      and task_id = '00000000-0000-0000-0000-000000000000'
  )

union all

select 'writing_issues' as table_name, count(*) as row_count
from public.writing_issues
where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'
  and task_submission_id in (
    select id
    from public.task_submissions
    where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
      and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'
      and task_id = '00000000-0000-0000-0000-000000000000'
  )

union all

select 'writing_issue_correction_attempts' as table_name, count(*) as row_count
from public.writing_issue_correction_attempts
where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'
  and task_submission_id in (
    select id
    from public.task_submissions
    where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
      and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'
      and task_id = '00000000-0000-0000-0000-000000000000'
  )

union all

select 'learning_item_evidence' as table_name, count(*) as row_count
from public.learning_item_evidence
where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'
  and task_submission_id in (
    select id
    from public.task_submissions
    where child_id = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
      and parent_user_id = 'a28d4885-8328-4853-ba11-6c676619b9ea'
      and task_id = '00000000-0000-0000-0000-000000000000'
  );
