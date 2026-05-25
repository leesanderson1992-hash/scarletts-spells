begin;

alter table public.children
  add column if not exists is_archived boolean not null default false;

create index if not exists children_parent_user_archived_idx
  on public.children (parent_user_id, is_archived);

commit;
