begin;

alter table public.courses
  add column if not exists is_active boolean not null default true;

create index if not exists courses_parent_child_active_idx
  on public.courses (parent_user_id, child_id, is_active, created_at desc);

commit;
