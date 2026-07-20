-- One review-gated, reusable dictation sentence per canonical teaching word.
-- This is intentionally dictionary-level: lesson routes consume the same
-- approved sentence rather than maintaining route-specific copies.

create table if not exists public.canonical_teaching_dictionary_dictation_sentences (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.canonical_teaching_dictionary_import_batches(id) on delete restrict,
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id) on delete restrict,
  row_status text not null default 'draft',
  source_sheet text not null,
  source_row_number integer not null,
  source_row_hash text not null,
  source_metadata jsonb not null default '{}'::jsonb,
  dictation_sentence text not null,
  dictation_target_token_index integer not null,
  audio_text text not null,
  source_category text not null,
  source_name text,
  source_url text,
  source_licence text,
  source_use_note text,
  confidence text not null,
  review_status text not null,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint canonical_teaching_dictionary_dictation_sentences_nonblank_check
    check (btrim(dictation_sentence) <> '' and btrim(audio_text) <> ''),
  constraint canonical_teaching_dictionary_dictation_sentences_token_index_check
    check (dictation_target_token_index >= 0),
  constraint canonical_teaching_dictionary_dictation_sentences_row_status_check
    check (row_status = any (array['draft', 'active', 'rejected', 'superseded'])),
  constraint canonical_teaching_dictionary_dictation_sentences_source_row_check
    check (source_row_number > 1 and btrim(source_sheet) <> '' and btrim(source_row_hash) <> ''),
  constraint canonical_teaching_dictionary_dictation_sentences_source_category_check
    check (source_category = any (array['internal_authored', 'internal_reviewed_seed', 'public_domain', 'open_licensed', 'licensed_vendor', 'reference_only', 'ai_assisted_draft'])),
  constraint canonical_teaching_dictionary_dictation_sentences_confidence_check
    check (confidence = any (array['low', 'medium', 'high'])),
  constraint canonical_teaching_dictionary_dictation_sentences_review_status_check
    check (review_status = any (array['draft', 'ai_draft', 'in_review', 'changes_requested', 'approved_for_guided_review', 'approved_for_first_exposure', 'rejected', 'superseded'])),
  constraint canonical_teaching_dictionary_dictation_sentences_internal_note_check
    check (source_category <> 'internal_authored' or btrim(coalesce(source_use_note, '')) <> ''),
  unique (import_batch_id, canonical_word_id)
);

create unique index if not exists canonical_teaching_dictionary_dictation_sentences_live_word_idx
  on public.canonical_teaching_dictionary_dictation_sentences (canonical_word_id)
  where row_status = 'active' and review_status = 'approved_for_first_exposure';

create index if not exists canonical_teaching_dictionary_dictation_sentences_review_idx
  on public.canonical_teaching_dictionary_dictation_sentences (row_status, review_status, canonical_word_id);

alter table public.canonical_teaching_dictionary_base_word_family_members
  add column if not exists dictation_sentence_id uuid references public.canonical_teaching_dictionary_dictation_sentences(id) on delete restrict;

create index if not exists canonical_teaching_dictionary_base_word_family_members_sentence_idx
  on public.canonical_teaching_dictionary_base_word_family_members (dictation_sentence_id)
  where dictation_sentence_id is not null;

create or replace function public.link_base_word_members_to_canonical_dictation_sentence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.row_status = 'active' and new.review_status = 'approved_for_first_exposure' then
    update public.canonical_teaching_dictionary_base_word_family_members
      set dictation_sentence_id = new.id,
          updated_at = timezone('utc', now())
    where canonical_word_id = new.canonical_word_id
      and row_status = 'active'
      and review_status = 'approved_for_first_exposure';
  end if;
  return new;
end;
$$;

drop trigger if exists link_base_word_members_to_canonical_dictation_sentence
  on public.canonical_teaching_dictionary_dictation_sentences;
create trigger link_base_word_members_to_canonical_dictation_sentence
  after insert or update of row_status, review_status, canonical_word_id
  on public.canonical_teaching_dictionary_dictation_sentences
  for each row execute function public.link_base_word_members_to_canonical_dictation_sentence();

update public.canonical_teaching_dictionary_base_word_family_members member
set dictation_sentence_id = sentence.id,
    updated_at = timezone('utc', now())
from public.canonical_teaching_dictionary_dictation_sentences sentence
where member.canonical_word_id = sentence.canonical_word_id
  and member.row_status = 'active'
  and member.review_status = 'approved_for_first_exposure'
  and sentence.row_status = 'active'
  and sentence.review_status = 'approved_for_first_exposure';

alter table public.canonical_teaching_dictionary_dictation_sentences enable row level security;
revoke all on table public.canonical_teaching_dictionary_dictation_sentences from anon, authenticated;
grant select, insert, update, delete on table public.canonical_teaching_dictionary_dictation_sentences to service_role;
