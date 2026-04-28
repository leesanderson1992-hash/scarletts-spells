begin;

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.courses to authenticated;
grant select, insert, update, delete on public.course_modules to authenticated;
grant select, insert, update, delete on public.course_tasks to authenticated;
grant select, insert, update, delete on public.task_submissions to authenticated;
grant select, insert, update, delete on public.task_completions to authenticated;

alter table public.courses enable row level security;
alter table public.course_modules enable row level security;
alter table public.course_tasks enable row level security;
alter table public.task_submissions enable row level security;
alter table public.task_completions enable row level security;

drop policy if exists courses_parent_access on public.courses;
create policy courses_parent_access
on public.courses
for all
to authenticated
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);

drop policy if exists course_modules_parent_access on public.course_modules;
create policy course_modules_parent_access
on public.course_modules
for all
to authenticated
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);

drop policy if exists course_tasks_parent_access on public.course_tasks;
create policy course_tasks_parent_access
on public.course_tasks
for all
to authenticated
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);

drop policy if exists task_submissions_parent_access on public.task_submissions;
create policy task_submissions_parent_access
on public.task_submissions
for all
to authenticated
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);

drop policy if exists task_completions_parent_access on public.task_completions;
create policy task_completions_parent_access
on public.task_completions
for all
to authenticated
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);

commit;
