/** Read-only inventory: never infers a reviewed sense or changes a family. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from 'pg';
const environment = process.argv[2];
assert(['staging', 'production'].includes(environment));
const connectionString = environment === 'staging'
  ? process.env.SUPABASE_STAGING_DB_URL : process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
assert(connectionString?.includes(environment === 'staging' ? 'qkpjbajicacbrphthibk' : 'wwohrqtunajrbwxyssjf'));
const db = new pg.Client({ connectionString });
await db.connect();
try {
  await db.query('begin read only');
  const rows = (await db.query(`with latest as (
    select distinct on(family_key) * from canonical_teaching_dictionary_lexical_base_families
    order by family_key, revision desc
  ) select f.family_key,f.revision,f.base_lemma,f.base_kind,f.base_part_of_speech,
    f.canonical_base_word_id,f.canonical_base_sense_id,f.base_meaning,s.sense_set,
    (select count(*)::integer from canonical_teaching_dictionary_lexical_base_family_members m
      where m.family_key=f.family_key and m.revision=f.revision) members,
    (select jsonb_agg(to_jsonb(m)) from teaching_dictionary_current_sense_morphology m
      where m.canonical_word_id=f.canonical_base_word_id) analyses
    from latest f left join teaching_dictionary_reviewed_sense_sets s
      on s.canonical_word_id=f.canonical_base_word_id
    where f.review_status='approved' order by f.family_key`)).rows;
  const classified = rows.map(family => {
    const senses = family.sense_set?.senses ?? [];
    const anchor = senses.find(sense => sense.partOfSpeech === family.base_part_of_speech
      && (!family.canonical_base_sense_id || family.canonical_base_sense_id === sense.id));
    const legacy = family.base_kind === 'free_base' && family.base_part_of_speech === 'function_word'
      && !family.canonical_base_sense_id;
    let status = family.base_kind === 'bound_root' ? 'bound_root_preserved'
      : anchor ? 'compatible_reviewed_anchor'
      : !senses.length ? 'awaiting_reviewed_anchor_facts' : 'distinct_or_conflicting_sense_review';
    if (legacy) {
      const sense = senses.length === 1 ? senses[0] : null;
      const analysis = (family.analyses ?? []).find(row => row.sense_id === sense?.id);
      const [part] = analysis?.morphology_parts ?? [];
      status = sense && analysis && part?.kind === 'base'
        && analysis.morphology_parts.length === 1 && !analysis.morphology_joins.length
        && !analysis.morphology_transformations.length && part.sourceText === family.base_lemma
        && ['preposition','adverb','conjunction','pronoun','determiner','interjection','verb','number'].includes(sense.partOfSpeech)
        ? 'legacy_ready_for_explicit_family_link'
        : 'legacy_awaiting_reviewed_anchor_facts';
    }
    return { ...family, status };
  });
  const counts = {};
  for (const row of classified) counts[row.status] = (counts[row.status] ?? 0) + 1;
  const report = { environment, readOnly: true, totalApprovedFamilies: rows.length, counts, families: classified };
  fs.mkdirSync('outputs/legacy-family-audit-20261120', { recursive: true });
  fs.writeFileSync(`outputs/legacy-family-audit-20261120/${environment}-audit.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ environment, totalApprovedFamilies: rows.length, counts,
    ready: classified.filter(row => row.status === 'legacy_ready_for_explicit_family_link').map(row => row.family_key),
    distinctOrConflicting: classified.filter(row => row.status === 'distinct_or_conflicting_sense_review')
      .map(row => ({ key: row.family_key, pos: row.base_part_of_speech, members: row.members })) }, null, 2));
} finally {
  await db.end();
}
