begin;

grant select, insert, update, delete on public.course_goals to authenticated;

alter table public.course_goals enable row level security;

drop policy if exists course_goals_parent_access on public.course_goals;
create policy course_goals_parent_access
on public.course_goals
for all
to authenticated
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);

commit;
