begin;
-- Explicit reviewed removals override historical spelling-family compatibility reads.
-- Source memberships remain immutable and available for historical lessons.
create table public.teaching_dictionary_spelling_family_link_removals (
 canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
 family_key text not null check(btrim(family_key)<>''),
 replacement_family_key text,
 reason text not null check(btrim(reason)<>''),
 source_memberships jsonb not null check(jsonb_typeof(source_memberships)='array'),
 reviewed_by uuid not null references auth.users(id),reviewed_at timestamptz not null default now(),
 primary key(canonical_word_id,family_key)
);
alter table public.teaching_dictionary_spelling_family_link_removals enable row level security;
revoke all on public.teaching_dictionary_spelling_family_link_removals from public,anon,authenticated;
grant select on public.teaching_dictionary_spelling_family_link_removals to service_role;
create or replace view public.teaching_dictionary_spelling_legacy_members as
SELECT m.id,
    m.import_batch_id,
    m.base_word_family_id,
    m.canonical_word_id,
    m.member_role,
    m.word_sum,
    m.morphology_parts,
    m.morphology_joins,
    m.transformation_notes,
    m.dictation_sentence,
    m.dictation_target_token_index,
    m.audio_text,
    m.assignment_eligible,
    m.row_status,
    m.source_sheet,
    m.source_row_number,
    m.source_row_hash,
    m.source_metadata,
    m.source_category,
    m.source_name,
    m.source_url,
    m.source_licence,
    m.source_use_note,
    m.confidence,
    m.review_status,
    m.reviewed_by,
    m.reviewed_at,
    m.created_at,
    m.updated_at,
    m.child_friendly_meaning,
    m.dictation_sentence_id,
    m.morphology_transformations
   FROM canonical_teaching_dictionary_base_word_family_members m
     JOIN canonical_teaching_dictionary_base_word_families f ON f.id = m.base_word_family_id
  WHERE NOT (EXISTS ( SELECT 1
           FROM teaching_dictionary_grammatical_family_links g
          WHERE g.family_key = f.base_family_key AND g.canonical_word_id = m.canonical_word_id))
 AND NOT EXISTS(select 1 from public.teaching_dictionary_spelling_family_link_removals x where x.canonical_word_id=m.canonical_word_id and x.family_key=f.base_family_key);
create or replace view public.teaching_dictionary_spelling_lexical_members as
SELECT family_key,
    revision,
    canonical_word_id,
    word_part_of_speech,
    relationship_kind,
    canonical_morphology_id,
    word_sum,
    morphology_parts,
    morphology_joins,
    morphology_transformations,
    intended_meaning,
    source_reference
   FROM canonical_teaching_dictionary_lexical_base_family_members m
  WHERE NOT (EXISTS ( SELECT 1
           FROM teaching_dictionary_grammatical_family_links g
          WHERE g.family_key = m.family_key AND g.canonical_word_id = m.canonical_word_id))
 AND NOT EXISTS(select 1 from public.teaching_dictionary_spelling_family_link_removals x where x.canonical_word_id=m.canonical_word_id and x.family_key=m.family_key);
create or replace view public.teaching_dictionary_spelling_registry_members as
SELECT canonical_family_id,
    canonical_word_id,
    source_family_keys,
    source_member_roles,
    source_assignment_eligibility,
    source_record_ids
   FROM canonical_teaching_dictionary_base_family_registry_members m
  WHERE NOT (EXISTS ( SELECT 1
           FROM teaching_dictionary_grammatical_family_links g
             JOIN canonical_teaching_dictionary_base_family_registry_aliases a ON a.source_key = g.family_key
          WHERE a.canonical_family_id = m.canonical_family_id AND g.canonical_word_id = m.canonical_word_id))
 AND NOT EXISTS(select 1 from public.teaching_dictionary_spelling_family_link_removals x where x.canonical_word_id=m.canonical_word_id and exists(select 1 from public.canonical_teaching_dictionary_base_family_registry_aliases a where a.source_key=x.family_key and a.canonical_family_id=m.canonical_family_id));
notify pgrst,'reload schema';
commit;
