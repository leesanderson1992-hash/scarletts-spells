begin;

alter table public.course_tasks
  add column if not exists lesson_schema jsonb;

commit;
