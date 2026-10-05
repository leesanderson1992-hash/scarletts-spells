-- Repair parent-verification matching, drain visibility and governed homophone evidence.
begin;

create function public.count_authentic_use_delivery_backlog() returns bigint
language sql security definer set search_path=public,pg_temp stable as $$
  select count(*)
  from public.authentic_use_deliveries d
  join public.authentic_use_controls c using(child_id,parent_user_id)
  where c.mode='enabled'
    and ((d.consumer='gold' and c.gold_enabled) or (d.consumer='proficiency' and c.proficiency_enabled))
    and d.status in ('pending','failed','processing');
$$;
revoke all on function public.count_authentic_use_delivery_backlog() from public,anon,authenticated;
grant execute on function public.count_authentic_use_delivery_backlog() to service_role;

create table public.authentic_use_credit_corrections (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.authentic_use_reviews(id) on delete restrict,
  credit_id uuid not null unique references public.authentic_use_credits(id) on delete restrict,
  verification_id uuid not null unique references public.parent_verifications(id) on delete restrict,
  parent_user_id uuid not null references auth.users(id) on delete restrict,
  child_id uuid not null references public.children(id) on delete restrict,
  word_key text not null check(btrim(word_key)<>''),
  correction_kind text not null check(correction_kind='DISMISSED_FALSE_POSITIVE_RECONCILIATION_V1'),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  unique(review_id,word_key,correction_kind)
);
alter table public.authentic_use_credit_corrections enable row level security;
grant all on public.authentic_use_credit_corrections to service_role;
grant select on public.authentic_use_credit_corrections to authenticated;
create policy owning_parent_read on public.authentic_use_credit_corrections
  for select to authenticated using(parent_user_id=auth.uid());
create trigger authentic_use_credit_correction_immutable
  before update on public.authentic_use_credit_corrections
  for each row execute function public.protect_authentic_use_fact();

-- The later runtime-created PEACE_PIECE key is the established teaching skill.
-- Move the duplicate contextual routing records, then retire PIECE_PEACE.
do $$
declare canonical_key constant text:='D4_HOM_CONTENT_WORD_HOMOPHONES_PEACE_PIECE';
  duplicate_key constant text:='D4_HOM_CONTENT_WORD_HOMOPHONES_PIECE_PEACE';
begin
  if exists(select 1 from public.micro_skill_catalog where micro_skill_key=duplicate_key) then
    if not exists(select 1 from public.micro_skill_catalog where micro_skill_key=canonical_key) then
      raise exception 'AUTHENTIC_USE_CANONICAL_PEACE_PIECE_MISSING';
    end if;
    insert into public.contextual_micro_skill_members(
      micro_skill_key,member_normalized,member_display,approved_by_admin_user_id,created_at)
    select canonical_key,member_normalized,member_display,approved_by_admin_user_id,created_at
    from public.contextual_micro_skill_members where micro_skill_key=duplicate_key
    on conflict(micro_skill_key,member_normalized) do nothing;

    update public.contextual_micro_skill_pairs
      set micro_skill_key=canonical_key
      where micro_skill_key=duplicate_key;
    update public.contextual_micro_skill_case_links
      set micro_skill_key=canonical_key
      where micro_skill_key=duplicate_key;
    update public.contextual_spelling_catalog_case_links
      set micro_skill_key=canonical_key
      where micro_skill_key=duplicate_key;
    update public.contextual_micro_skill_demands
      set micro_skill_key=canonical_key
      where micro_skill_key=duplicate_key
        and not exists(select 1 from public.contextual_micro_skill_demands existing
          where existing.child_id=contextual_micro_skill_demands.child_id
            and existing.micro_skill_key=canonical_key);
    delete from public.contextual_micro_skill_demands where micro_skill_key=duplicate_key;
    delete from public.contextual_micro_skill_members where micro_skill_key=duplicate_key;
    update public.micro_skill_catalog set is_active=false,is_assignable=false,updated_at=now(),
      metadata=metadata||jsonb_build_object('retired_reason','consolidated_duplicate',
        'canonical_micro_skill_key',canonical_key,'retired_at',now())
      where micro_skill_key=duplicate_key;
  end if;
end $$;

-- Existing curated homophone examples become governed positive evidence.
update public.canonical_teaching_dictionary_word_support
set review_status='approved_for_first_exposure',reviewed_by='Katie Sanderson',reviewed_at=now(),
  review_notes=concat_ws(' ',nullif(btrim(coalesce(review_notes,'')),''),
    'Approved for positive authentic-use evidence on 2026-10-05.'),updated_at=now()
where row_status='active' and support_role='support_example'
  and micro_skill_key like 'D4_HOM_%'
  and review_status<>'approved_for_first_exposure';

with support_batch as (
  select min(import_batch_id::text)::uuid id
  from public.canonical_teaching_dictionary_word_support
  where row_status='active' and micro_skill_key like 'D4_HOM_%'
), requested(word_normalized,micro_skill_key,source_row_number) as (values
  ('heard','D4_HOM_CONTENT_WORD_HOMOPHONES_HERD_HEARD',2),
  ('herd','D4_HOM_CONTENT_WORD_HOMOPHONES_HERD_HEARD',3),
  ('threw','D4_HOM_CONTENT_WORD_HOMOPHONES_THREW_THROUGH',4),
  ('through','D4_HOM_CONTENT_WORD_HOMOPHONES_THREW_THROUGH',5)
), resolved as (
  select requested.*,min(word.id::text)::uuid canonical_word_id
  from requested
  join public.canonical_teaching_dictionary_words word
    on word.row_status='active' and word.dialect_code='en-GB'
    and lower(replace(replace(normalize(coalesce(nullif(word.display_word,''),word.normalised_word),NFC),'’',''''),'ʼ',''''))=requested.word_normalized
  join public.micro_skill_catalog skill on skill.micro_skill_key=requested.micro_skill_key and skill.is_active
  group by requested.word_normalized,requested.micro_skill_key,requested.source_row_number
  having count(*)=1
)
insert into public.canonical_teaching_dictionary_word_support(
  import_batch_id,canonical_word_id,row_status,source_sheet,source_row_number,source_row_hash,source_metadata,
  micro_skill_key,support_role,source_category,source_name,source_use_note,confidence,review_status,
  review_notes,reviewed_by,reviewed_at)
select batch.id,resolved.canonical_word_id,'active','authentic_use_homophone_positive_v1',resolved.source_row_number,
  md5(resolved.word_normalized||':'||resolved.micro_skill_key)||
    md5('authentic-use:'||resolved.word_normalized||':'||resolved.micro_skill_key),
  jsonb_build_object('publication','authentic_use_homophone_positive_v1'),resolved.micro_skill_key,
  'support_example','internal_reviewed_seed','Katie Sanderson authentic-use homophone review',
  'Human-reviewed positive relationship for verified contextual use.','high','approved_for_first_exposure',
  'Approved for positive authentic-use evidence.','Katie Sanderson',now()
from resolved cross join support_batch batch
where batch.id is not null and not exists(
  select 1 from public.canonical_teaching_dictionary_word_support existing
  where existing.canonical_word_id=resolved.canonical_word_id
    and existing.micro_skill_key=resolved.micro_skill_key
    and existing.support_role='support_example' and existing.row_status='active');

-- One production review lost `while` solely because its false-positive parent
-- verification was looked up under the wrong identifier. Repair it once and
-- preserve the correction as a separate immutable audit fact.
do $$
declare target_review constant uuid:='791ca3c5-6c7b-40ea-905c-328ab4d3fc61';
  target_verification constant uuid:='5addee9b-7a42-4c2e-a487-b3a08e92bffc';
  target_source constant text:='authentic_writing::0a2e3772-e190-4694-b86e-71cb9045dcac::2b62cbf4-041b-48d4-b470-7dac973ab31e::164-169::while::whole';
  review_row public.authentic_use_reviews%rowtype;
  verification_row public.parent_verifications%rowtype;
  occurrence_row public.writing_occurrences%rowtype;
  v_credit_id uuid;
  v_canonical_word_id uuid;
begin
  select * into review_row from public.authentic_use_reviews where id=target_review;
  if review_row.id is null then return; end if;
  select * into verification_row from public.parent_verifications where id=target_verification;
  if verification_row.id is null or verification_row.decision<>'false_positive'
    or verification_row.source_entity_id<>target_source
    or verification_row.parent_user_id<>review_row.parent_user_id
    or verification_row.child_id<>review_row.child_id then
    raise exception 'AUTHENTIC_USE_WHILE_VERIFICATION_MISMATCH';
  end if;
  select * into occurrence_row from public.writing_occurrences
  where snapshot_id=review_row.snapshot_id and start_utf16=164 and end_utf16=169
    and lower(observed_text)='while' and provenance='learner_response';
  if occurrence_row.id is null then raise exception 'AUTHENTIC_USE_WHILE_OCCURRENCE_MISSING'; end if;
  select min(word.id::text)::uuid into v_canonical_word_id
  from public.canonical_teaching_dictionary_words word
  where word.row_status='active' and word.dialect_code='en-GB'
    and lower(replace(replace(normalize(coalesce(nullif(word.display_word,''),word.normalised_word),NFC),'’',''''),'ʼ',''''))='while'
  having count(*)=1;

  insert into public.authentic_use_credits(review_id,chain_id,snapshot_id,parent_user_id,child_id,
    word_key,observed_word,occurrence_ids,supplied_spelling,occurred_at,verified_at,canonical_word_id)
  select review_row.id,review_row.chain_id,review_row.snapshot_id,review_row.parent_user_id,review_row.child_id,
    'while',occurrence_row.observed_text,array[occurrence_row.id],false,snapshot.occurred_at,
    review_row.verified_at,v_canonical_word_id
  from public.writing_source_snapshots snapshot where snapshot.id=review_row.snapshot_id
  on conflict(child_id,chain_id,word_key) do nothing;
  select id into v_credit_id from public.authentic_use_credits
    where child_id=review_row.child_id and chain_id=review_row.chain_id and word_key='while';
  if v_credit_id is null then raise exception 'AUTHENTIC_USE_WHILE_CREDIT_MISSING'; end if;

  insert into public.authentic_use_credit_corrections(review_id,credit_id,verification_id,parent_user_id,
    child_id,word_key,correction_kind,metadata)
  values(review_row.id,v_credit_id,verification_row.id,review_row.parent_user_id,review_row.child_id,'while',
    'DISMISSED_FALSE_POSITIVE_RECONCILIATION_V1',jsonb_build_object('source_entity_id',target_source))
  on conflict(review_id,word_key,correction_kind) do nothing;
  insert into public.authentic_use_deliveries(credit_id,consumer,parent_user_id,child_id)
  values(v_credit_id,'gold',review_row.parent_user_id,review_row.child_id),
    (v_credit_id,'proficiency',review_row.parent_user_id,review_row.child_id)
  on conflict(credit_id,consumer) do nothing;
end $$;

commit;
