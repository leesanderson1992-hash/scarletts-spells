begin;

alter table public.course_tasks
  add column if not exists content_html text,
  add column if not exists choice_options text[] not null default '{}',
  add column if not exists allow_multiple_choices boolean not null default false;

commit;
