/** Read-only audit of reviewed Base Word candidates staged from short drafts. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import pg from "pg";
import { auditCanonicalMorphology } from "../lib/teaching-dictionary-manager/canonical-morphology";

const environment = process.argv[2];
const exportPath = process.argv[3];
assert(environment === "production" || environment === "staging",
  "Usage: tsx scripts/audit-canonical-base-route-candidates.mts production|staging");
const key = environment === "production" ? "SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED" : "SUPABASE_STAGING_DB_URL";
delete process.env[key];
process.loadEnvFile(environment === "production" ? ".env.local" : ".env.staging.local");
const url = process.env[key];
assert(url, "Database URL required");
assert.equal(new URL(url).username.split(".").at(-1),
  environment === "production" ? "wwohrqtunajrbwxyssjf" : "qkpjbajicacbrphthibk");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query("begin read only");
  const rows = await db.query(`with latest as (
      select distinct on (canonical_word_id,micro_skill_key) *
      from public.teaching_dictionary_route_content_versions where route_id='base_word_lab'
      order by canonical_word_id,micro_skill_key,published_at desc,id desc
    ), candidates as (
      select v.* from latest v
      join public.teaching_dictionary_route_content_reviews r on r.content_version_id=v.id
      join public.teaching_dictionary_manager_drafts d on d.id=v.draft_id
      left join public.teaching_dictionary_route_content_publications p on p.content_version_id=v.id
      where p.content_version_id is null and not (d.payload ? 'metadata')
        and r.dictionary_fingerprint=public.teaching_dictionary_route_dictionary_fingerprint(v.canonical_word_id)
    )
    select w.id,w.display_word,w.row_status,w.review_status,w.age_band,w.frequency_band,w.complexity_band,
      w.source_category,w.source_name,w.source_use_note,w.confidence,
      m.analysis_status,m.review_status morphology_review_status,m.morphology_parts,m.morphology_joins,m.word_sum,
      m.morphology_transformations,
      md.review_status metadata_review_status,md.syllables,md.phoneme_hint,md.stress_pattern,md.written_syllable_breakdown,
      ds.review_status dictation_review_status,ds.dictation_sentence,ds.dictation_target_token_index,
      def.definition,c.content,
      exists(select 1 from public.canonical_teaching_dictionary_lexical_base_family_members f
        where f.canonical_word_id=w.id and f.canonical_morphology_id=m.id) linked_to_family,
      (select string_agg(distinct family_key, '; ' order by family_key)
        from public.canonical_teaching_dictionary_lexical_base_family_members
        where canonical_word_id=w.id) family_keys
    from candidates c join public.canonical_teaching_dictionary_words w on w.id=c.canonical_word_id
    left join public.canonical_teaching_dictionary_word_morphology m on m.canonical_word_id=w.id and m.row_status='active'
    left join lateral (select review_status,syllables,phoneme_hint,stress_pattern,written_syllable_breakdown
      from public.canonical_teaching_dictionary_word_metadata where canonical_word_id=w.id and row_status='active'
      order by created_at desc,id desc limit 1) md on true
    left join lateral (select review_status,dictation_sentence,dictation_target_token_index
      from public.canonical_teaching_dictionary_dictation_sentences where canonical_word_id=w.id and row_status='active'
      order by created_at desc,id desc limit 1) ds on true
    left join lateral (select definition from public.teaching_dictionary_definition_versions
      where canonical_word_id=w.id and route_id is null order by published_at desc,id desc limit 1) def on true
    order by w.display_word`);
  const counts = new Map<string, { count: number; examples: string[] }>();
  const reviewRows: Record<string, string>[] = [];
  const add = (category: string, word: string) => {
    const item = counts.get(category) ?? { count: 0, examples: [] };
    item.count++;
    if (item.examples.length < 8) item.examples.push(word);
    counts.set(category, item);
  };
  for (const row of rows.rows) {
    const audit = auditCanonicalMorphology({ parts: row.morphology_parts, joins: row.morphology_joins,
      displayWord: row.display_word, linkedToFamily: row.linked_to_family });
    const parts = Array.isArray(row.morphology_parts) ? row.morphology_parts : [];
    const joins = Array.isArray(row.morphology_joins) ? row.morphology_joins : [];
    const cell = (value: unknown) => value == null ? "" : String(value);
    const flattened: Record<string, string> = {};
    for (let index = 0; index < 4; index++) {
      const part = parts[index] ?? {};
      const number = index + 1;
      flattened[`part_${number}_kind`] = cell(part.kind ?? part.type ?? part.role);
      flattened[`part_${number}_source`] = cell(part.sourceText ?? part.text);
      flattened[`part_${number}_surface`] = cell(part.surfaceText ?? part.text);
      flattened[`part_${number}_meaning`] = cell(part.gloss ?? part.meaning);
    }
    for (let index = 0; index < 3; index++) {
      const join = joins[index];
      flattened[`join_${index + 1}`] = typeof join === "string" ? join : cell(join?.joinType);
    }
    const transformations = Array.isArray(row.morphology_transformations)
      ? row.morphology_transformations.map((item: Record<string, unknown>) =>
        `${cell(item.kind)}: ${cell(item.sourceText)} → ${cell(item.surfaceText)}`).join("; ") : "";
    const guidance = audit.reason === "join_count" ? "Review the join between every adjacent part and the resulting spelling."
      : audit.reason === "unreviewed_part_fact" ? "Review each part's kind, source spelling, visible spelling and meaning."
      : audit.reason === "immutable_family_evidence" ? "Review display ranges and revise the linked family evidence together."
      : "Review the current morphology and linked family evidence.";
    reviewRows.push({ word: row.display_word, word_id: row.id, issue: `${audit.status}: ${audit.reason}`,
      review_guidance: guidance,
      family_keys: cell(row.family_keys), definition: cell(row.definition),
      syllables: cell(row.written_syllable_breakdown), dictation_sentence: cell(row.dictation_sentence),
      word_sum: cell(row.word_sum), transformations, ...flattened,
      review_decision: "", reviewer_notes: "",
      overview_url: `https://scarletts-spells.vercel.app/admin/teaching-dictionary/${row.id}#td-canonical-parts` });
    add(`morphology:${audit.status}:${audit.reason}`, row.display_word);
    if (row.content?.wordMeaning && row.content.wordMeaning !== row.definition)
      add("route_meaning_differs_from_overview", row.display_word);
    if (row.content?.wordSum && row.content.wordSum !== row.word_sum)
      add("route_word_sum_differs_from_overview", row.display_word);
    if (row.review_status !== "approved_for_first_exposure" || row.row_status !== "active" ||
      row.analysis_status !== "approved" || row.morphology_review_status !== "approved_for_first_exposure" ||
      row.metadata_review_status !== "approved_for_first_exposure" ||
      row.dictation_review_status !== "approved_for_first_exposure" || !row.definition)
      add("overview_facts_not_fully_approved", row.display_word);
  }
  if (exportPath) {
    const columns = ["word", "word_id", "issue", "review_guidance", "family_keys", "definition", "syllables",
      "dictation_sentence", "word_sum", "transformations",
      ...Array.from({ length: 4 }, (_, index) => ["kind", "source", "surface", "meaning"]
        .map((field) => `part_${index + 1}_${field}`)).flat(),
      "join_1", "join_2", "join_3", "review_decision", "reviewer_notes", "overview_url"];
    const quote = (value: string) => `"${(/^[=+@\-\t\r]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`;
    writeFileSync(exportPath, `${[columns.join(","), ...reviewRows.map((row) =>
      columns.map((column) => quote(row[column] ?? "")).join(","))].join("\n")}\n`, { flag: "wx" });
  }
  console.log(JSON.stringify({ environment, reviewedShortDraftCandidates: rows.rows.length,
    categories: Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b))),
    exportPath: exportPath ?? null }, null, 2));
} finally {
  await db.query("rollback").catch(() => {});
  await db.end();
}
