-- ADLE D4_MOR base-word pilot: durable transfer misses only.
-- A transfer word needs independent misses in two separate completed lessons
-- before it can enter the existing word-level learning-item pathway.
-- This migration creates no assignment, scheduler, reward, or activation path.

alter table public.adle_learning_items
  drop constraint if exists adle_learning_items_source_kind_check;

alter table public.adle_learning_items
  add constraint adle_learning_items_source_kind_check
  check (source_kind = any (array[
    'verified_misspelling',
    'probe_miss',
    'review_ejection',
    'slippage_reentry',
    'stretch_selection',
    'transfer_confirmation'
  ]));

create table if not exists public.adle_base_word_transfer_miss_events (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id) on delete restrict,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  lesson_source_ref text not null,
  occurred_on date not null,
  attempt_text text not null,
  row_status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  constraint adle_base_word_transfer_miss_events_ref_check check (btrim(lesson_source_ref) <> ''),
  constraint adle_base_word_transfer_miss_events_attempt_check check (btrim(attempt_text) <> ''),
  constraint adle_base_word_transfer_miss_events_status_check check (row_status = any (array['active', 'superseded'])),
  unique (child_id, canonical_word_id, micro_skill_key, lesson_source_ref)
);

create index if not exists adle_base_word_transfer_miss_events_lookup_idx
  on public.adle_base_word_transfer_miss_events (child_id, canonical_word_id, micro_skill_key, occurred_on)
  where row_status = 'active';

alter table public.adle_base_word_transfer_miss_events enable row level security;
revoke all on table public.adle_base_word_transfer_miss_events from anon, authenticated;
grant select, insert, update, delete on table public.adle_base_word_transfer_miss_events to service_role;

create or replace function public.record_adle_base_word_transfer_miss_v1(
  p_child_id uuid,
  p_canonical_word_id uuid,
  p_micro_skill_key text,
  p_lesson_source_ref text,
  p_occurred_on date,
  p_attempt_text text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_miss_count integer;
  v_promoted boolean := false;
begin
  if nullif(btrim(p_lesson_source_ref), '') is null
    or nullif(btrim(p_attempt_text), '') is null then
    raise exception 'ADLE base-word transfer miss requires source and attempt text';
  end if;

  insert into public.adle_base_word_transfer_miss_events (
    child_id, canonical_word_id, micro_skill_key, lesson_source_ref,
    occurred_on, attempt_text, row_status
  ) values (
    p_child_id, p_canonical_word_id, p_micro_skill_key, p_lesson_source_ref,
    p_occurred_on, p_attempt_text, 'active'
  ) on conflict (child_id, canonical_word_id, micro_skill_key, lesson_source_ref) do nothing;

  select count(*) into v_miss_count
  from public.adle_base_word_transfer_miss_events
  where child_id = p_child_id
    and canonical_word_id = p_canonical_word_id
    and micro_skill_key = p_micro_skill_key
    and row_status = 'active';

  if v_miss_count >= 2 and not exists (
    select 1 from public.adle_learning_items
    where child_id = p_child_id
      and canonical_word_id = p_canonical_word_id
      and micro_skill_key = p_micro_skill_key
      and row_status = 'active'
  ) then
    insert into public.adle_learning_items (
      child_id, canonical_word_id, micro_skill_key, item_status, source_kind,
      source_ref, source_attempt_text, reteach_priority, ejected_on, intake_on, row_status
    ) values (
      p_child_id, p_canonical_word_id, p_micro_skill_key, 'pending', 'transfer_confirmation',
      p_lesson_source_ref || ':transfer-confirmation', p_attempt_text, false, null, p_occurred_on, 'active'
    );
    v_promoted := true;
  end if;

  return jsonb_build_object('missCount', v_miss_count, 'promoted', v_promoted);
end;
$$;

revoke all on function public.record_adle_base_word_transfer_miss_v1(uuid, uuid, text, text, date, text) from public, anon, authenticated;
grant execute on function public.record_adle_base_word_transfer_miss_v1(uuid, uuid, text, text, date, text) to service_role;
