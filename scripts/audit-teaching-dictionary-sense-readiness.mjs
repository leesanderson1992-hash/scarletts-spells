/** Read-only staging inventory for converting spelling-level facts to reviewed meanings. */
import pg from "pg";

process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
if (!url || new URL(url).username.split(".").at(-1) !== "qkpjbajicacbrphthibk")
  throw new Error("PINNED_STAGING_REQUIRED");

const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  const result = await db.query(`
    with approved as (
      select id,display_word,normalised_word from public.canonical_teaching_dictionary_words
      where row_status='active' and review_status='approved_for_first_exposure'
    ), facts as (
      select w.*,
        m.raw_morpholex_pos,
        md.phoneme_hint,md.syllables,md.stress_pattern,
        (select d.definition from public.teaching_dictionary_definition_versions d
          where d.canonical_word_id=w.id and d.route_id is null
          order by d.published_at desc,d.id desc limit 1) definition,
        s.canonical_word_id is not null as has_reviewed_senses
      from approved w
      left join lateral (
        select raw_morpholex_pos from public.canonical_teaching_dictionary_word_morphology
        where canonical_word_id=w.id and row_status='active'
        order by created_at desc,id desc limit 1
      ) m on true
      left join lateral (
        select phoneme_hint,syllables,stress_pattern
        from public.canonical_teaching_dictionary_word_metadata
        where canonical_word_id=w.id and row_status='active'
        order by created_at desc,id desc limit 1
      ) md on true
      left join public.teaching_dictionary_reviewed_sense_sets s on s.canonical_word_id=w.id
    )
    select count(*)::integer as approved_words,
      count(*) filter (where has_reviewed_senses)::integer as reviewed_sense_sets,
      count(*) filter (where not has_reviewed_senses)::integer as needing_meaning_review,
      count(*) filter (where not has_reviewed_senses and nullif(btrim(definition),'') is null)::integer
        as missing_approved_overview_definition,
      count(*) filter (where not has_reviewed_senses and
        raw_morpholex_pos not in ('noun','verb','adjective','adverb','pronoun','preposition','conjunction','interjection','determiner','root')
        or not has_reviewed_senses and raw_morpholex_pos is null)::integer
        as missing_unambiguous_part_of_speech,
      count(*) filter (where not has_reviewed_senses and
        (nullif(btrim(phoneme_hint),'') is null or nullif(btrim(syllables),'') is null
          or nullif(btrim(stress_pattern),'') is null))::integer
        as missing_pronunciation_facts,
      count(*) filter (where not has_reviewed_senses and
        nullif(btrim(definition),'') is not null and
        raw_morpholex_pos in ('noun','verb','adjective','adverb','pronoun','preposition','conjunction','interjection','determiner')
        and nullif(btrim(phoneme_hint),'') is not null
        and nullif(btrim(syllables),'') is not null
        and nullif(btrim(stress_pattern),'') is not null)::integer
        as structurally_possible_single_sense_conversions,
      (select count(*)::integer from (
        select normalised_word from approved group by normalised_word having count(*) > 1
      ) duplicates) as repeated_active_spellings
    from facts`);
  console.log(JSON.stringify({ environment: "staging", ...result.rows[0],
    note: "Structural candidates still require a human check for multiple meanings. No writes were made." }, null, 2));
} finally {
  await db.end();
}
