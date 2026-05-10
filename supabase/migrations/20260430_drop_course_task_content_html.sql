begin;

alter table public.course_tasks
  drop column if exists content_html;

commit;
