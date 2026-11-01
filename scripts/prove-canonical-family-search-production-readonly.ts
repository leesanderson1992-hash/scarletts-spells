/** Read-only proof that live approved roots fit the deployed search query and projection. */
import assert from "node:assert/strict";
import pg from "pg";
import { familySearchResults, type FamilySearchRow } from "../lib/teaching-dictionary-manager/family-search";

const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
if (!url) throw new Error("PRODUCTION_READ_URL_REQUIRED");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000 });
async function main() { try {
  await db.connect();
  await db.query("begin read only");
  const root = await db.query<{ base_lemma: string }>(`select base_lemma
    from public.canonical_teaching_dictionary_lexical_base_families
    where review_status='approved' and base_kind='bound_root'
      and length(base_lemma)>=2 order by base_lemma limit 1`);
  assert.ok(root.rows[0], "Production has an approved bound-root family");
  const term = root.rows[0].base_lemma.toLocaleLowerCase("en-GB");
  const rows = await db.query<FamilySearchRow>(`select family_key,revision,base_lemma,
      base_meaning,base_kind from public.canonical_teaching_dictionary_lexical_base_families
    where review_status='approved' and base_lemma ilike $1
    order by base_lemma,revision desc limit 500`, [`%${term}%`]);
  const matches = familySearchResults(rows.rows, term);
  assert.ok(matches.some((item) => item.baseLemma.toLocaleLowerCase("en-GB") === term &&
    item.baseKind === "bound_root"), "approved bound root appears in lemma search");
  console.log(JSON.stringify({ result: "passed", environment: "production",
    approvedBoundRootSearch: true, mutations: 0 }));
} finally {
  await db.query("rollback").catch(() => {});
  await db.end().catch(() => {});
} }
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
