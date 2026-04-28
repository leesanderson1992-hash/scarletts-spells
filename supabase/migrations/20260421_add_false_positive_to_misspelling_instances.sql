begin;

alter table public.misspelling_instances
  add column if not exists is_false_positive boolean not null default false;

create index if not exists misspelling_instances_parent_false_positive_idx
  on public.misspelling_instances (parent_user_id, is_false_positive);

commit;
