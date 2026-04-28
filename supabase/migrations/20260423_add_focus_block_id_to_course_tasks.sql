alter table public.course_tasks
add column if not exists focus_block_id uuid references public.focus_blocks(id) on delete set null;

create index if not exists course_tasks_focus_block_id_idx
on public.course_tasks (focus_block_id);
