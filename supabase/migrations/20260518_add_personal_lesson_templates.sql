create table if not exists public.personal_lesson_templates (
  id uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  lesson_schema jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint personal_lesson_templates_title_nonempty check (char_length(btrim(title)) > 0),
  constraint personal_lesson_templates_lesson_schema_object check (jsonb_typeof(lesson_schema) = 'object')
);

create index if not exists personal_lesson_templates_parent_updated_idx
  on public.personal_lesson_templates (parent_user_id, updated_at desc);

alter table public.personal_lesson_templates enable row level security;

drop policy if exists personal_lesson_templates_parent_access on public.personal_lesson_templates;
create policy personal_lesson_templates_parent_access
on public.personal_lesson_templates
for all
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);
