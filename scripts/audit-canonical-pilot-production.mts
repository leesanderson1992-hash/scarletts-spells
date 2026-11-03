/** Read-only dependency audit for the fixed 14-word reviewed CSV. */
import { readFileSync } from "node:fs";
import pg from "pg";
import { parseDictionaryCsv } from "../lib/teaching-dictionary-manager/csv";
import { normaliseWrittenSyllableBreakdown } from "../lib/teaching-dictionary-manager/authoring";

const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
if (!url || new URL(url).username.split(".").at(-1) !== "wwohrqtunajrbwxyssjf")
  throw new Error("PRODUCTION_READ_ONLY_DATABASE_REQUIRED");
const candidate = parseDictionaryCsv(readFileSync(
  "docs/implementation/seed-data/teaching-dictionary/candidates/2026-11-03-canonical-pilot/reviewed-14-word-pilot.csv", "utf8",
));
if (candidate.length !== 14 || candidate.some((row) => row.error || !row.canonicalWordId))
  throw new Error("REVIEWED_PILOT_CSV_INVALID");

const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await db.connect();
  await db.query("begin read only");
  const report = [];
  const blockers: string[] = [];
  for (const row of candidate) {
    const base = row.payload.canonicalMorphology.parts.find((part) => part.kind === "base");
    const current = await db.query(`select w.id,w.normalised_word,w.source_row_hash,
      w.display_word,w.age_band,w.frequency_band,w.complexity_band,
      w.source_category,w.source_name,w.source_url,w.source_licence,w.source_use_note,w.confidence,
      (select count(*)::int from canonical_teaching_dictionary_suffix_members m
        join canonical_teaching_dictionary_suffix_profiles p on p.id=m.suffix_profile_id
        where m.canonical_word_id=w.id and m.row_status='active' and p.row_status='active') suffix_members,
      (select count(*)::int from canonical_teaching_dictionary_base_word_family_members m
        where m.canonical_word_id=w.id and m.row_status='active') legacy_family_members,
      (select count(*)::int from canonical_teaching_dictionary_lexical_base_family_members m
        where m.canonical_word_id=w.id) lexical_family_rows,
      (select count(*)::int from canonical_teaching_dictionary_base_family_registry_members m
        where m.canonical_word_id=w.id) registry_members,
      (select count(*)::int from adle_learning_items x
        where x.canonical_word_id=w.id and x.row_status='active') learning_items,
      (select count(*)::int from teaching_dictionary_route_content_versions v
        join teaching_dictionary_route_content_publications p on p.content_version_id=v.id
        where v.canonical_word_id=w.id) published_routes
      from canonical_teaching_dictionary_words w where w.id=$1 and w.row_status='active'`,
    [row.canonicalWordId]);
    if (current.rows.length !== 1 || current.rows[0].normalised_word !== row.normalisedWord)
      throw new Error(`PILOT_WORD_IDENTITY_CHANGED:${row.normalisedWord}`);
    const word = current.rows[0];
    if (row.sourceRowHash !== word.source_row_hash)
      blockers.push(`${row.normalisedWord}: source row hash changed since review`);
    const existingFacts = await db.query(`select
      (select definition from teaching_dictionary_definition_versions d
        where d.canonical_word_id=$1 and d.route_id is null
        order by d.published_at desc,d.id desc limit 1) definition,
      (select to_jsonb(md) from canonical_teaching_dictionary_word_metadata md
        where md.canonical_word_id=$1 and md.row_status='active'
        order by md.created_at desc,md.id desc limit 1) metadata,
      (select to_jsonb(ds) from canonical_teaching_dictionary_dictation_sentences ds
        where ds.canonical_word_id=$1 and ds.row_status='active'
        order by ds.created_at desc,ds.id desc limit 1) dictation`, [row.canonicalWordId]);
    const old = existingFacts.rows[0];
    if (!old.definition || !old.metadata || !old.dictation)
      blockers.push(`${row.normalisedWord}: approved shared facts are incomplete`);
    const changedSharedFields: string[] = [];
    const compare = (name: string, actual: unknown, reviewed: unknown) => {
      if (String(actual ?? '') !== String(reviewed ?? '')) changedSharedFields.push(name);
    };
    compare('definition', old.definition, row.payload.definition);
    compare('display_word', word.display_word, row.payload.displayWord);
    compare('dictation_sentence', old.dictation?.dictation_sentence, row.payload.dictationSentence);
    compare('dictation_target_token_index', old.dictation?.dictation_target_token_index,
      row.payload.dictationTargetTokenIndex);
    for (const [name, reviewed] of [
      ['age_band', row.payload.ageBand], ['frequency_band', row.payload.frequencyBand],
      ['complexity_band', row.payload.complexityBand],
      ['source_category', row.payload.provenance.sourceCategory],
      ['source_name', row.payload.provenance.sourceName],
      ['source_url', row.payload.provenance.sourceUrl],
      ['source_licence', row.payload.provenance.sourceLicence],
      ['source_use_note', row.payload.provenance.sourceUseNote],
      ['confidence', row.payload.provenance.confidence],
    ] as const) compare(name, word[name], reviewed);
    for (const [name, reviewed] of Object.entries(row.payload.metadata))
      compare(name, old.metadata?.[name], reviewed);
    if (row.writtenSyllableBreakdown !== undefined) {
      const currentBreakdown = normaliseWrittenSyllableBreakdown(
        String(old.metadata?.written_syllable_breakdown ?? ''));
      if (currentBreakdown !== row.writtenSyllableBreakdown)
        blockers.push(`${row.normalisedWord}: written syllable breakdown changed since review`);
    }
    const families = base ? await db.query(`select f.family_key,f.revision from canonical_teaching_dictionary_lexical_base_families f
      where f.base_kind='free_base' and f.base_lemma=lower($1) and f.base_meaning=$2
        and f.review_status='approved'
        and not exists(select 1 from canonical_teaching_dictionary_lexical_base_families newer
          where newer.family_key=f.family_key and newer.revision>f.revision)
      order by f.family_key`, [base.sourceText, base.gloss]) : { rows: [] };
    const anchor = base ? await db.query(`select w.id,w.review_status,
      (select count(*)::int from canonical_teaching_dictionary_word_morphology m
        where m.canonical_word_id=w.id and m.row_status='active'
          and m.review_status='approved_for_first_exposure'
          and m.analysis_status='approved') approved_morphology_rows,
      (select count(*)::int from canonical_teaching_dictionary_lexical_base_families f
        where f.base_lemma=lower($1)) families_with_same_lemma
      from canonical_teaching_dictionary_words w
      where w.normalised_word=lower($1) and w.dialect_code='en-GB' and w.row_status='active'`,
    [base.sourceText]) : { rows: [] };
    const selectedKey = row.payload.freeBaseFamilyReview?.familyKey;
    const selectedFamily = selectedKey ? await db.query(`select f.family_key,f.revision,f.base_lemma,
      f.base_part_of_speech,f.review_status from canonical_teaching_dictionary_lexical_base_families f
      where f.family_key=$1 order by f.revision desc limit 1`, [selectedKey]) : { rows: [] };
    const selectedRootKey = row.payload.rootFamilyReview?.familyKey;
    const selectedRoot = selectedRootKey ? await db.query(`select f.family_key,f.revision,f.base_lemma,
      f.base_kind,f.review_status from canonical_teaching_dictionary_lexical_base_families f
      where f.family_key=$1 order by f.revision desc limit 1`, [selectedRootKey]) : { rows: [] };
    if (base && (anchor.rows.length !== 1 || anchor.rows[0].review_status !== 'approved_for_first_exposure'
      || anchor.rows[0].approved_morphology_rows !== 1)) blockers.push(`${row.normalisedWord}: base anchor is not approved`);
    if (base && selectedKey) {
      const family = selectedFamily.rows[0];
      if (!family || family.review_status !== 'approved' || family.base_lemma !== base.sourceText.toLowerCase()
        || family.base_part_of_speech !== row.payload.freeBaseFamilyReview?.basePartOfSpeech)
        blockers.push(`${row.normalisedWord}: selected free-base family is not current and approved`);
    } else if (base && anchor.rows[0]?.families_with_same_lemma !== 0)
      blockers.push(`${row.normalisedWord}: new family conflicts with an existing lemma`);
    if (selectedRootKey) {
      const root = selectedRoot.rows[0];
      const rootText = row.payload.canonicalMorphology.parts.find((part) => part.kind === 'root')?.sourceText;
      if (!root || root.review_status !== 'approved' || root.base_kind !== 'bound_root'
        || root.base_lemma !== rootText?.toLowerCase())
        blockers.push(`${row.normalisedWord}: selected bound-root family is not current and approved`);
    }
    const skills = await db.query(`select distinct p.micro_skill_key from adle_reviewed_word_skill_pairs p
      join adle_reviewed_word_skill_releases r on r.id=p.release_id and r.environment_key='production'
      where p.canonical_word_id=$1
        and not exists(select 1 from adle_reviewed_word_skill_withdrawals x where x.release_id=r.id)
        and not exists(select 1 from teaching_dictionary_pair_latest_decisions x
          where x.environment_key='production' and x.canonical_word_id=p.canonical_word_id
            and x.micro_skill_key=p.micro_skill_key and x.action='deassign')
      order by p.micro_skill_key`, [row.canonicalWordId]);
    const liveSkills = skills.rows.map((item) => item.micro_skill_key);
    report.push({
      word: row.normalisedWord,
      identityMatches: row.sourceRowHash === word.source_row_hash,
      changedSharedFields,
      base: base?.sourceText ?? null,
      matchingApprovedFamilies: families.rows.map((family) => `${family.family_key}@${family.revision}`),
      selectedFamilyRevision: selectedFamily.rows[0]?.revision ?? selectedRoot.rows[0]?.revision ?? null,
      baseAnchor: base ? {
        activeCount: anchor.rows.length,
        approved: anchor.rows.length === 1 && anchor.rows[0].review_status === 'approved_for_first_exposure',
        approvedMorphologyRows: anchor.rows.length === 1 ? anchor.rows[0].approved_morphology_rows : 0,
        familiesWithSameLemma: anchor.rows.length === 1 ? anchor.rows[0].families_with_same_lemma : 0,
      } : null,
      suffixMembers: word.suffix_members,
      legacyFamilyMembers: word.legacy_family_members,
      lexicalFamilyRows: word.lexical_family_rows,
      registryMembers: word.registry_members,
      learningItems: word.learning_items,
      publishedRoutes: word.published_routes,
      skillsToAdd: row.payload.skillKeys.filter((key) => !liveSkills.includes(key)),
      skillsToRemove: liveSkills.filter((key) => !row.payload.skillKeys.includes(key)),
    });
  }
  console.log(JSON.stringify(report, null, 2));
  if (blockers.length) throw new Error(`PILOT_IMPORT_PRECONDITIONS_FAILED: ${blockers.join('; ')}`);
} finally {
  await db.query("rollback").catch(() => {});
  await db.end().catch(() => {});
}
