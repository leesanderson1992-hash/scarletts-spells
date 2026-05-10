begin;

create or replace view public.task_completion_debug as
select
  completion.id,
  completion.task_id,
  task.title as task_title,
  task.task_type,
  completion.course_id,
  course.title as course_title,
  module.id as module_id,
  module.title as module_title,
  completion.child_id,
  completion.parent_user_id,
  completion.completion_date,
  completion.quantity_completed,
  completion.completed_at
from public.task_completions as completion
left join public.course_tasks as task
  on task.id = completion.task_id
left join public.courses as course
  on course.id = completion.course_id
left join public.course_modules as module
  on module.id = task.module_id;

grant select on public.task_completion_debug to authenticated;

commit;
