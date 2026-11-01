/** Read-only active-word format audit. Never prints child evidence or DB credentials. */
import pg from "pg";
import { auditCanonicalMorphology } from "../lib/teaching-dictionary-manager/canonical-morphology";

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
  const result = await db.query(`select m.id,m.morphology_parts parts,m.morphology_joins joins,
      w.display_word,exists(select 1 from public.canonical_teaching_dictionary_lexical_base_family_members f
        where f.canonical_morphology_id=m.id) linked_to_family
    from public.canonical_teaching_dictionary_word_morphology m
    join public.canonical_teaching_dictionary_words w on w.id=m.canonical_word_id
    where m.row_status='active' and w.row_status='active'`);
  const counts = new Map<string, number>();
  for (const row of result.rows) {
    const audit = auditCanonicalMorphology({ parts: row.parts, joins: row.joins,
      displayWord: row.display_word, linkedToFamily: row.linked_to_family });
    const key = `${audit.status}:${audit.reason}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  console.log(JSON.stringify({ environment, activeMorphologyRows: result.rows.length,
    categories: Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b))) }, null, 2));
} finally {
  await db.end().catch(() => {});
} }
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
