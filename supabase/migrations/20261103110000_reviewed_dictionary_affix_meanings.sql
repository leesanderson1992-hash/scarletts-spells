begin;

-- Dictionary part glosses are editorial facts. Lesson meaning bins remain
-- route-specific teaching choices and are compatibility input for older forms.
create table if not exists public.canonical_teaching_dictionary_affix_meanings (
  id uuid primary key default gen_random_uuid(),
  part_kind text not null check (part_kind in ('prefix','suffix')),
  source_text text not null check (btrim(source_text) <> ''),
  gloss text not null check (btrim(gloss) <> ''),
  source_reference text not null check (btrim(source_reference) <> ''),
  reviewed_by text not null check (btrim(reviewed_by) <> ''),
  reviewed_at timestamptz not null default now(),
  row_status text not null default 'active' check (row_status in ('active','superseded')),
  review_status text not null default 'approved' check (review_status in ('approved','withdrawn')),
  unique (part_kind,source_text,gloss,review_status)
);

alter table public.canonical_teaching_dictionary_affix_meanings enable row level security;
revoke all on public.canonical_teaching_dictionary_affix_meanings from public,anon,authenticated;
grant select on public.canonical_teaching_dictionary_affix_meanings to service_role;

insert into public.canonical_teaching_dictionary_affix_meanings
  (part_kind,source_text,gloss,source_reference,reviewed_by)
values
  ('suffix','able','able to be or suitable for',
   'Katie Sanderson reviewed 14-word Teaching Dictionary CSV and confirmed this gloss, 2026-11-03',
   'Katie Sanderson'),
  ('prefix','en','to cause or to be',
   'Katie Sanderson confirmed the en gloss for enjoyable in Codex chat, 2026-11-03',
   'Katie Sanderson')
on conflict do nothing;

notify pgrst,'reload schema';
commit;
