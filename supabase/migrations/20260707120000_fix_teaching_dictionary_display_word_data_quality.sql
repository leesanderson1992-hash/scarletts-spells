-- Teaching Dictionary display_word data-quality repair (data backfill only).
--
-- Deployment method (per docs/operations/supabase-migration-policy.md):
--   unique forward migration, data-only, LOCAL/DEV ONLY. No schema change.
--   Not for production `supabase db push`; production is a separate approved
--   ledger/release decision.
--
-- Why: ADLE Slice 7a renders `display_word` verbatim to children. An audit of
-- `canonical_teaching_dictionary_words` (row_status='active') found malformed,
-- slash-joined values that trace to the D4 seed artifact
-- `docs/implementation/seed-data/domain4-seed-expansion/micro-skills.json`,
-- where the seed `word` field was authored as a slash-joined *form list*
-- (e.g. "fast/faster/fastest", "struct/instruct") rather than a single
-- child-facing spelling. Two of these also carried the slash string in
-- `normalised_word` (the active unique key), so a display-vs-normalised diff
-- did not surface them.
--
-- Source-of-truth semantics recorded alongside this migration in
-- docs/implementation/version-3-phase-5b-teaching-dictionary-architecture.md:
--   * normalised_word = lowercase matching/identity key (one word, no slashes).
--   * display_word    = the true child-facing surface form: the authored
--                       spelling WITH correct casing/punctuation (e.g. the
--                       pronoun "I" is capitalised); it may legitimately differ
--                       from normalised_word only by casing/punctuation, never
--                       by carrying multiple slash-joined forms.
--
-- Every statement is guarded on the exact current (malformed) values, so this
-- migration is idempotent and safe to re-run.

begin;

-- (A) Malformed display_word only; normalised_word already the clean base word.
--     Canonical lesson target = the base word (confirmed against word_key,
--     normalised_word, and the D4 morphology segmentation {(fast)} / {<in<(struct)}).
update public.canonical_teaching_dictionary_words
   set display_word = 'fast', updated_at = timezone('utc', now())
 where word_key = 'fast_en_gb'
   and row_status = 'active'
   and normalised_word = 'fast'
   and display_word = 'fast/faster/fastest';

update public.canonical_teaching_dictionary_words
   set display_word = 'instruct', updated_at = timezone('utc', now())
 where word_key = 'instruct_en_gb'
   and row_status = 'active'
   and normalised_word = 'instruct'
   and display_word = 'struct/instruct';

-- (B) Proper-casing backfill. The pronoun "I" contractions must render with a
--     capital I to children. normalised_word stays lowercase (its constraint
--     requires lower-case); display_word carries the true surface form.
update public.canonical_teaching_dictionary_words
   set display_word = 'I''d', updated_at = timezone('utc', now())
 where word_key = 'i_d_en_gb' and row_status = 'active'
   and normalised_word = 'i''d' and display_word = 'i''d';

update public.canonical_teaching_dictionary_words
   set display_word = 'I''m', updated_at = timezone('utc', now())
 where word_key = 'i_m_en_gb' and row_status = 'active'
   and normalised_word = 'i''m' and display_word = 'i''m';

update public.canonical_teaching_dictionary_words
   set display_word = 'I''ve', updated_at = timezone('utc', now())
 where word_key = 'i_ve_en_gb' and row_status = 'active'
   and normalised_word = 'i''ve' and display_word = 'i''ve';

-- (C) Composite row `tall/taller/tallest`: the slash string sat in BOTH
--     normalised_word and display_word. `taller` and `tallest` already exist as
--     their own active rows, but there is NO separate `tall` row -- so this row
--     IS the canonical "tall" and is repaired in place (owner rule: only delete
--     the slash version when every component already has its own row).
update public.canonical_teaching_dictionary_words
   set normalised_word = 'tall',
       display_word    = 'tall',
       word_key        = 'tall_en_gb',
       updated_at      = timezone('utc', now())
 where word_key = 'tall_taller_tallest_en_gb'
   and row_status = 'active'
   and normalised_word = 'tall/taller/tallest'
   and display_word = 'tall/taller/tallest';

-- (D) Composite row `nature/natural`: clean `nature` AND `natural` rows already
--     exist as their own active rows, so this composite carries nothing unique.
--     Retire it (soft-delete to 'superseded' -- FKs are on delete restrict and
--     the app filters every read on row_status='active'). It has no ADLE runtime
--     usage (no learning items / schedule / taught history / authentic use), so
--     retiring is clean. Retire its dependent metadata / support / banding rows
--     too so nothing dangles as active.
update public.canonical_teaching_dictionary_word_metadata m
   set row_status = 'superseded', updated_at = timezone('utc', now())
  from public.canonical_teaching_dictionary_words w
 where m.canonical_word_id = w.id
   and w.word_key = 'nature_natural_en_gb'
   and m.row_status = 'active';

update public.canonical_teaching_dictionary_word_support s
   set row_status = 'superseded', updated_at = timezone('utc', now())
  from public.canonical_teaching_dictionary_words w
 where s.canonical_word_id = w.id
   and w.word_key = 'nature_natural_en_gb'
   and s.row_status = 'active';

update public.canonical_teaching_dictionary_word_banding b
   set row_status = 'superseded'
  from public.canonical_teaching_dictionary_words w
 where b.canonical_word_id = w.id
   and w.word_key = 'nature_natural_en_gb'
   and b.row_status = 'active';

update public.canonical_teaching_dictionary_words
   set row_status = 'superseded', updated_at = timezone('utc', now())
 where word_key = 'nature_natural_en_gb'
   and row_status = 'active'
   and normalised_word = 'nature/natural';

-- (E) Self-check invariants inside the transaction; roll back if anything drifts.
do $$
declare
  slash_display integer;
  slash_normalised integer;
  active_words integer;
  capital_i integer;
begin
  select count(*) into slash_display
    from public.canonical_teaching_dictionary_words
   where row_status = 'active' and display_word ~ '/';
  select count(*) into slash_normalised
    from public.canonical_teaching_dictionary_words
   where row_status = 'active' and normalised_word ~ '/';
  select count(*) into active_words
    from public.canonical_teaching_dictionary_words
   where row_status = 'active';
  select count(*) into capital_i
    from public.canonical_teaching_dictionary_words
   where row_status = 'active' and word_key in ('i_d_en_gb','i_m_en_gb','i_ve_en_gb')
     and display_word in ('I''d','I''m','I''ve');

  if slash_display <> 0 then
    raise exception 'display_word still has slash-joined values in % active rows', slash_display;
  end if;
  if slash_normalised <> 0 then
    raise exception 'normalised_word still has slash-joined values in % active rows', slash_normalised;
  end if;
  if active_words <> 873 then
    raise exception 'unexpected active word count %, expected 873', active_words;
  end if;
  if capital_i <> 3 then
    raise exception 'capital-I contraction backfill incomplete (% of 3)', capital_i;
  end if;
end $$;

commit;
