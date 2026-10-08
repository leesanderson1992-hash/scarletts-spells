-- Retain content-owner-approved word lessons without claiming learner-runtime activation.
create table public.adle_word_teaching_content_submissions (
  id uuid primary key default gen_random_uuid(),
  package_sha256 text not null check (package_sha256 ~ '^[a-f0-9]{64}$'),
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  target_word text not null check (length(btrim(target_word)) > 0),
  route_id text not null check (length(btrim(route_id)) > 0),
  route_version text not null check (length(btrim(route_version)) > 0),
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key),
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  approval_status text not null check (approval_status = 'approved_for_import'),
  runtime_status text not null default 'pending_runtime_support'
    check (runtime_status = 'pending_runtime_support'),
  approved_by text not null check (length(btrim(approved_by)) > 0),
  approved_at timestamptz not null,
  imported_at timestamptz not null default now(),
  unique (package_sha256, target_word)
);

create index adle_word_teaching_content_submissions_word_idx
  on public.adle_word_teaching_content_submissions (target_word, imported_at desc);

alter table public.adle_word_teaching_content_submissions enable row level security;
revoke all on public.adle_word_teaching_content_submissions from anon, authenticated;
grant select, insert on public.adle_word_teaching_content_submissions to service_role;
