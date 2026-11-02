/** Read-only active-word format audit. Never prints child evidence or DB credentials. */
import pg from "pg";
import { writeFileSync } from "node:fs";
import { auditCanonicalMorphology } from "../lib/teaching-dictionary-manager/canonical-morphology";
import { DICTIONARY_BANDS, routeContentFromStoredRow } from "../lib/teaching-dictionary-manager/contracts";

const environment = process.argv[2];
const exportPath = process.argv[3];
if (environment !== "production" && environment !== "staging")
  throw new Error("Usage: tsx scripts/audit-canonical-dictionary-format.ts production|staging");
const url = environment === "production" ? process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED :
  process.env.SUPABASE_STAGING_DB_URL;
if (!url) throw new Error("DATABASE_URL_REQUIRED");
if (environment === "staging" && new URL(url).username.split(".").at(-1) !== "qkpjbajicacbrphthibk")
  throw new Error("STAGING_DATABASE_REQUIRED");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
async function main() { try {
  await db.connect();
  const [result, routes] = await Promise.all([
    db.query(`select w.id word_id,w.display_word,w.normalised_word,w.review_status word_review_status,
        w.age_band,w.frequency_band,w.complexity_band,w.source_name,w.source_use_note,
        w.source_category,w.source_licence,w.confidence,
        m.id morphology_id,m.analysis_status,m.review_status morphology_review_status,
        m.morphology_parts parts,m.morphology_joins joins,m.word_sum,
        md.id metadata_id,md.syllables,md.phoneme_hint,md.written_syllable_breakdown,
        ds.id dictation_id,ds.dictation_sentence,ds.dictation_target_token_index,
        (select d.definition from public.teaching_dictionary_definition_versions d
          where d.canonical_word_id=w.id and d.route_id is null
          order by d.published_at desc,d.id desc limit 1) definition,
        exists(select 1 from public.canonical_teaching_dictionary_lexical_base_family_members f
          where f.canonical_morphology_id=m.id) linked_to_family,
        exists(select 1 from public.canonical_teaching_dictionary_prefix_members f
          where f.canonical_word_id=w.id and f.row_status='active')
        or exists(select 1 from public.canonical_teaching_dictionary_suffix_members f
          where f.canonical_word_id=w.id and f.row_status='active')
        or exists(select 1 from public.canonical_teaching_dictionary_base_word_family_members f
          where f.canonical_word_id=w.id and f.row_status='active')
        or exists(select 1 from public.canonical_teaching_dictionary_word_support f
          where f.canonical_word_id=w.id and f.row_status='active')
        or exists(select 1 from public.adle_reviewed_word_skill_pairs f
          where f.canonical_word_id=w.id)
        or exists(select 1 from public.adle_learning_items f
          where f.canonical_word_id=w.id and f.row_status='active') governed_route
      from public.canonical_teaching_dictionary_words w
      left join public.canonical_teaching_dictionary_word_morphology m
        on m.canonical_word_id=w.id and m.row_status='active'
      left join lateral (select id,syllables,phoneme_hint,written_syllable_breakdown
        from public.canonical_teaching_dictionary_word_metadata
        where canonical_word_id=w.id and row_status='active'
        order by created_at desc,id desc limit 1) md on true
      left join lateral (select id,dictation_sentence,dictation_target_token_index
        from public.canonical_teaching_dictionary_dictation_sentences
        where canonical_word_id=w.id and row_status='active'
        order by created_at desc,id desc limit 1) ds on true
      where w.row_status='active'`),
    db.query(`select distinct on (r.canonical_word_id,r.route_id,r.micro_skill_key)
        r.canonical_word_id,r.route_id,r.route_version,r.micro_skill_key,r.content
      from public.teaching_dictionary_route_content_versions r
      join public.canonical_teaching_dictionary_words w on w.id=r.canonical_word_id and w.row_status='active'
      order by r.canonical_word_id,r.route_id,r.micro_skill_key,r.published_at desc,r.id desc`),
  ]);
  const counts = new Map<string, number>();
  const byWord = new Map<string, { definition: string | null; wordSum: string | null }>();
  const reviewRows = new Map<string, { id: string; word: string; reviewStatus: string; issues: Set<string> }>();
  let missingMorphology = 0;
  let safeButGoverned = 0;
  const sharedFacts = { approvedWords: 0, missingDefinition: 0, missingMetadata: 0,
    missingSyllables: 0, missingPronunciationHint: 0, missingWrittenSyllableBreakdown: 0,
    missingDictation: 0, missingDictationTarget: 0, missingBands: 0,
    nonCanonicalBands: 0,
    missingProvenance: 0, morphologyNotApproved: 0, linkedToLexicalFamily: 0 };
  for (const row of result.rows) {
    const review = { id: String(row.word_id), word: String(row.display_word),
      reviewStatus: String(row.word_review_status), issues: new Set<string>() };
    reviewRows.set(review.id, review);
    byWord.set(row.word_id, { definition: row.definition, wordSum: row.word_sum });
    if (row.word_review_status === "approved_for_first_exposure") {
      sharedFacts.approvedWords++;
      if (!row.definition?.trim()) { sharedFacts.missingDefinition++; review.issues.add("Shared definition missing"); }
      if (!row.metadata_id) sharedFacts.missingMetadata++;
      if (!row.syllables?.trim()) { sharedFacts.missingSyllables++; review.issues.add("Syllables missing"); }
      if (!row.phoneme_hint?.trim()) { sharedFacts.missingPronunciationHint++; review.issues.add("Pronunciation hint missing"); }
      if (!row.written_syllable_breakdown?.trim()) { sharedFacts.missingWrittenSyllableBreakdown++; review.issues.add("Written syllable breakdown missing"); }
      if (!row.dictation_id || !row.dictation_sentence?.trim()) { sharedFacts.missingDictation++; review.issues.add("Dictation sentence missing"); }
      if (row.dictation_target_token_index == null) { sharedFacts.missingDictationTarget++; review.issues.add("Dictation target missing"); }
      if (![row.age_band, row.frequency_band, row.complexity_band].every((item) =>
        typeof item === "string" && item.trim())) { sharedFacts.missingBands++; review.issues.add("Age, frequency or complexity band missing"); }
      else if (!(DICTIONARY_BANDS.ageBand as readonly string[]).includes(row.age_band) ||
        !(DICTIONARY_BANDS.frequencyBand as readonly string[]).includes(row.frequency_band) ||
        !(DICTIONARY_BANDS.complexityBand as readonly string[]).includes(row.complexity_band))
        { sharedFacts.nonCanonicalBands++; review.issues.add("Age, frequency or complexity band needs review"); }
      if (![row.source_name, row.source_use_note, row.source_category, row.confidence].every((item) =>
        typeof item === "string" && item.trim()) ||
        (["open_licensed", "licensed_vendor"].includes(row.source_category) &&
          !row.source_licence?.trim())) { sharedFacts.missingProvenance++; review.issues.add("Source or confidence missing"); }
      if (!row.morphology_id || row.analysis_status !== "approved" ||
        row.morphology_review_status !== "approved_for_first_exposure")
        { sharedFacts.morphologyNotApproved++; review.issues.add("Morphology not approved"); }
      if (row.linked_to_family) sharedFacts.linkedToLexicalFamily++;
    }
    if (!row.morphology_id) { missingMorphology++; if (row.word_review_status === "approved_for_first_exposure") review.issues.add("Morphology missing"); continue; }
    const audit = auditCanonicalMorphology({ parts: row.parts, joins: row.joins,
      displayWord: row.display_word, linkedToFamily: row.linked_to_family });
    const key = `${audit.status}:${audit.reason}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (audit.status !== "canonical") review.issues.add(`Morphology ${audit.status}: ${audit.reason}`);
    if (audit.status === "safe_range_conversion" && row.governed_route) safeButGoverned++;
  }
  let routeMeaningConflicts = 0;
  let routeWordSumConflicts = 0;
  let routesWithoutSharedDefinition = 0;
  let routesWithoutSharedWordSum = 0;
  for (const row of routes.rows) {
    const shared = byWord.get(row.canonical_word_id);
    if (!shared) continue;
    const route = routeContentFromStoredRow(row);
    if (!shared.definition) routesWithoutSharedDefinition++;
    else if (route.wordMeaning.trim() && route.wordMeaning.trim() !== shared.definition.trim()) {
      routeMeaningConflicts++; reviewRows.get(row.canonical_word_id)?.issues.add("Route meaning differs from Overview");
    }
    if (!shared.wordSum) routesWithoutSharedWordSum++;
    else if (route.wordSum.trim() && route.wordSum.trim() !== shared.wordSum.trim()) {
      routeWordSumConflicts++; reviewRows.get(row.canonical_word_id)?.issues.add("Route word sum differs from Overview");
    }
  }
  const needsReview = [...reviewRows.values()].filter((row) => row.issues.size)
    .sort((a, b) => a.word.localeCompare(b.word) || a.id.localeCompare(b.id));
  if (exportPath) {
    const csv = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const lines = ["word,word_id,review_status,issues,review_url", ...needsReview.map((row) => [
      row.word, row.id, row.reviewStatus, [...row.issues].join("; "),
      `https://scarletts-spells.vercel.app/admin/teaching-dictionary/${row.id}#td-overview`,
    ].map(csv).join(","))];
    writeFileSync(exportPath, `${lines.join("\n")}\n`, { flag: "wx" });
  }
  console.log(JSON.stringify({ environment, activeWords: result.rows.length,
    activeMorphologyRows: result.rows.length - missingMorphology, missingMorphology,
    sharedFacts,
    safeConversionBlockedByGovernedRoute: safeButGoverned,
    latestRouteVersions: routes.rows.length, routeMeaningConflicts, routeWordSumConflicts,
    routesWithoutSharedDefinition, routesWithoutSharedWordSum,
    categories: Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b))),
    wordsNeedingReview: needsReview.length, exportPath: exportPath ?? null }, null, 2));
} finally {
  await db.end().catch(() => {});
} }
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
