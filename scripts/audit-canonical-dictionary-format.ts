/** Read-only active-word format audit. Never prints child evidence or DB credentials. */
import pg from "pg";
import { auditCanonicalMorphology } from "../lib/teaching-dictionary-manager/canonical-morphology";
import { routeContentFromStoredRow } from "../lib/teaching-dictionary-manager/contracts";

const environment = process.argv[2];
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
    db.query(`select w.id word_id,w.display_word,m.id morphology_id,m.morphology_parts parts,
        m.morphology_joins joins,m.word_sum,
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
      where w.row_status='active'`),
    db.query(`select distinct on (r.canonical_word_id,r.route_id,r.micro_skill_key)
        r.canonical_word_id,r.route_id,r.route_version,r.micro_skill_key,r.content
      from public.teaching_dictionary_route_content_versions r
      join public.canonical_teaching_dictionary_words w on w.id=r.canonical_word_id and w.row_status='active'
      order by r.canonical_word_id,r.route_id,r.micro_skill_key,r.published_at desc,r.id desc`),
  ]);
  const counts = new Map<string, number>();
  const byWord = new Map<string, { definition: string | null; wordSum: string | null }>();
  let missingMorphology = 0;
  let safeButGoverned = 0;
  for (const row of result.rows) {
    byWord.set(row.word_id, { definition: row.definition, wordSum: row.word_sum });
    if (!row.morphology_id) { missingMorphology++; continue; }
    const audit = auditCanonicalMorphology({ parts: row.parts, joins: row.joins,
      displayWord: row.display_word, linkedToFamily: row.linked_to_family });
    const key = `${audit.status}:${audit.reason}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
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
    else if (route.wordMeaning.trim() && route.wordMeaning.trim() !== shared.definition.trim()) routeMeaningConflicts++;
    if (!shared.wordSum) routesWithoutSharedWordSum++;
    else if (route.wordSum.trim() && route.wordSum.trim() !== shared.wordSum.trim()) routeWordSumConflicts++;
  }
  console.log(JSON.stringify({ environment, activeWords: result.rows.length,
    activeMorphologyRows: result.rows.length - missingMorphology, missingMorphology,
    safeConversionBlockedByGovernedRoute: safeButGoverned,
    latestRouteVersions: routes.rows.length, routeMeaningConflicts, routeWordSumConflicts,
    routesWithoutSharedDefinition, routesWithoutSharedWordSum,
    categories: Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b))) }, null, 2));
} finally {
  await db.end().catch(() => {});
} }
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
