begin;

update public.course_tasks
set task_type = 'lesson'
where task_type in ('short_written_response', 'long_written_response');

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'course_tasks_task_type_check'
      and conrelid = 'public.course_tasks'::regclass
  ) then
    alter table public.course_tasks
      drop constraint course_tasks_task_type_check;
  end if;

  alter table public.course_tasks
    add constraint course_tasks_task_type_check
    check (
      task_type in (
        'checklist',
        'lesson',
        'test',
        'recurring_daily',
        'recurring_weekly',
        'checkpoint'
      )
    );
end $$;

commit;
