/** Read-only check that the fixed pilot's affix glosses can enter the import path. */
import { readFileSync } from "node:fs";
import pg from "pg";
import { parseDictionaryCsv } from "../lib/teaching-dictionary-manager/csv";
import { reviewedAffixMeanings, unreviewedAffixMeaningParts } from
  "../lib/teaching-dictionary-manager/affix-meanings";

const target = process.argv[2] ?? "production";
if (target !== "production" && target !== "staging") throw new Error("STAGING_OR_PRODUCTION_REQUIRED");
const url = target === "production" ? process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED
  : process.env.SUPABASE_STAGING_DB_URL;
const projectRef = target === "production" ? "wwohrqtunajrbwxyssjf" : "qkpjbajicacbrphthibk";
if (!url || new URL(url).username.split(".").at(-1) !== projectRef)
  throw new Error("READ_ONLY_DATABASE_TARGET_REQUIRED");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const rows = parseDictionaryCsv(readFileSync(
  "docs/implementation/seed-data/teaching-dictionary/candidates/2026-11-03-canonical-pilot/reviewed-14-word-pilot.csv", "utf8"));
try {
  await db.connect();
  await db.query("begin read only");
  const table = await db.query(`select to_regclass('public.canonical_teaching_dictionary_affix_meanings') table_name`);
  const prefixes = await db.query(`select prefix_choices from canonical_teaching_dictionary_prefix_profiles
    where row_status='active' and review_status='approved_for_first_exposure'`);
  const suffixes = await db.query(`select micro_skill_key,meaning_bins from canonical_teaching_dictionary_suffix_profiles
    where row_status='active' and review_status='approved_for_first_exposure'`);
  const dictionary = table.rows[0]?.table_name
    ? await db.query(`select part_kind,source_text,gloss from canonical_teaching_dictionary_affix_meanings
      where row_status='active' and review_status='approved'`) : { rows: [] };
  const choices = reviewedAffixMeanings(prefixes.rows, suffixes.rows, dictionary.rows);
  const failures = rows.flatMap((row) => unreviewedAffixMeaningParts(
    row.payload.canonicalMorphology.parts, choices).map((part) => ({ word: row.normalisedWord,
    part, form: row.payload.canonicalMorphology.parts[part - 1]?.sourceText,
    gloss: row.payload.canonicalMorphology.parts[part - 1]?.gloss,
    reviewed: choices[row.payload.canonicalMorphology.parts[part - 1]?.sourceText ?? ""] ?? [] })));
  console.log(JSON.stringify({ target, pilotWords: rows.length,
    reviewedAffixTableReady: Boolean(table.rows[0]?.table_name),
    reviewedAffixRows: dictionary.rows.length,
    suffixAbleChoices: choices.able ?? [], prefixEnChoices: choices.en ?? [], failures }, null, 2));
  if (!table.rows[0]?.table_name || failures.length) process.exitCode = 1;
} finally {
  await db.query("rollback").catch(() => {});
  await db.end().catch(() => {});
}
