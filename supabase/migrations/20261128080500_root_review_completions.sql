begin;
create table public.teaching_dictionary_root_review_completions (
 environment_key text not null check(environment_key in('staging','production')),
 root_text text not null check(root_text ~ '^[a-z]+$'),
 reviewed_by uuid not null references auth.users(id),
 source_reference text not null check(btrim(source_reference)<>''),
 reviewed_at timestamptz not null default now(),
 primary key(environment_key,root_text)
);
alter table public.teaching_dictionary_root_review_completions enable row level security;
revoke all on public.teaching_dictionary_root_review_completions from public,anon,authenticated;
grant select,insert on public.teaching_dictionary_root_review_completions to service_role;
create trigger root_review_completions_immutable before update or delete
 on public.teaching_dictionary_root_review_completions for each row execute function public.reject_writing_fact_update();

notify pgrst,'reload schema';
commit;
