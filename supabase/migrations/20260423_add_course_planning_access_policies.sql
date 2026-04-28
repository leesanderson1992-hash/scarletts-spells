begin;

grant select, insert, update, delete on public.focus_blocks to authenticated;
grant select, insert, update, delete on public.course_checkpoints to authenticated;

alter table public.focus_blocks enable row level security;
alter table public.course_checkpoints enable row level security;

drop policy if exists focus_blocks_parent_access on public.focus_blocks;
create policy focus_blocks_parent_access
on public.focus_blocks
for all
to authenticated
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);

drop policy if exists course_checkpoints_parent_access on public.course_checkpoints;
create policy course_checkpoints_parent_access
on public.course_checkpoints
for all
to authenticated
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);

commit;
