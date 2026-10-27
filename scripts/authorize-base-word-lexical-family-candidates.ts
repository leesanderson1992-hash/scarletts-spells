#!/usr/bin/env node
/** Freeze the owner's current family-source approval without approving words,
 * lesson content, or route activation. Dry-run unless --apply is supplied. */
import { readFileSync } from "node:fs";
import pg from "pg";

type Entry = { familyKey: string; revision: number; semanticFingerprint: string;
  memberCount: number; authorizationReference: string };
type Manifest = { schemaVersion: 1; scope: string; authorizedBy: string; families: Entry[];
  excluded: { familyKey: string; reason: string }[] };
const manifest = JSON.parse(readFileSync("data/adle/approved/base-word-regular-family-authorization-2026-10-27.json", "utf8")) as Manifest;
const url = process.env.TEACHING_DICTIONARY_RELEASE_DB_URL;
if (!url) throw new Error("Set TEACHING_DICTIONARY_RELEASE_DB_URL to the intended database");
if (manifest.schemaVersion !== 1 || manifest.scope !== "base_word_lab_candidate_source_only" ||
  manifest.families.length !== 39 || manifest.excluded.length !== 20 ||
  new Set(manifest.families.map((entry) => entry.familyKey)).size !== manifest.families.length)
  throw new Error("Candidate authorization manifest is incomplete or duplicated");

async function main() {
  const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    await db.query("begin transaction isolation level serializable");
    const keys = manifest.families.map((entry) => entry.familyKey);
    const rows = (await db.query<{ family_key: string; revision: number; semantic_fingerprint: string;
      base_kind: string; review_status: string; member_count: number; irregular_count: number;
      contraction_count: number }>(`select family.family_key,family.revision,family.semantic_fingerprint,
        family.base_kind,family.review_status,
        count(distinct member.canonical_word_id)::integer member_count,
        count(*) filter (where exists (select 1 from jsonb_array_elements(member.morphology_transformations) t
          where coalesce(t->>'kind',t->>'type')='irregular_form'))::integer irregular_count,
        count(*) filter (where exists (select 1 from jsonb_array_elements(member.morphology_transformations) t
          where coalesce(t->>'kind',t->>'type')='contraction'))::integer contraction_count
        from public.canonical_teaching_dictionary_lexical_base_families family
        join public.canonical_teaching_dictionary_lexical_base_family_members member
          on member.family_key=family.family_key and member.revision=family.revision
        where family.family_key=any($1::text[])
        group by family.family_key,family.revision,family.semantic_fingerprint,
          family.base_kind,family.review_status`, [keys])).rows;
    const byKey = new Map<string, typeof rows>();
    for (const row of rows) byKey.set(row.family_key, [...(byKey.get(row.family_key) ?? []), row]);
    for (const entry of manifest.families) {
      const current = (byKey.get(entry.familyKey) ?? []).filter((row) => row.review_status === "approved")
        .sort((left, right) => right.revision - left.revision)[0];
      if (!current || current.revision !== entry.revision ||
        current.semantic_fingerprint !== entry.semanticFingerprint || current.base_kind !== "free_base" ||
        current.member_count !== entry.memberCount || current.member_count < 2 ||
        current.irregular_count || current.contraction_count)
        throw new Error(`Candidate source changed or is unsuitable: ${entry.familyKey}`);
    }
    const existing = (await db.query<{ family_key: string; revision: number; semantic_fingerprint: string;
      withdrawn_at: Date | null }>(`select family_key,revision,semantic_fingerprint,withdrawn_at
      from public.adle_base_word_lexical_family_authorizations where family_key=any($1::text[])`, [keys])).rows;
    const existingByKey = new Map(existing.map((row) => [row.family_key, row]));
    for (const entry of manifest.families) {
      const row = existingByKey.get(entry.familyKey);
      if (row && (row.revision !== entry.revision || row.semantic_fingerprint !== entry.semanticFingerprint || row.withdrawn_at))
        throw new Error(`Existing candidate authorization differs: ${entry.familyKey}`);
    }
    const pending = manifest.families.filter((entry) => !existingByKey.has(entry.familyKey));
    if (process.argv.includes("--apply")) {
      for (const entry of pending) await db.query(`insert into public.adle_base_word_lexical_family_authorizations
        (family_key,revision,semantic_fingerprint,authorization_reference,authorized_by)
        values ($1,$2,$3,$4,$5)`, [entry.familyKey, entry.revision, entry.semanticFingerprint,
        entry.authorizationReference, manifest.authorizedBy]);
      await db.query("commit");
    } else await db.query("rollback");
    console.log(JSON.stringify({ mode: process.argv.includes("--apply") ? "applied" : "dry_run",
      authorized: manifest.families.length, alreadyAuthorized: existing.length,
      newlyAuthorized: pending.length, held: manifest.excluded.length }));
  } catch (error) {
    await db.query("rollback").catch(() => undefined);
    throw error;
  } finally { await db.end(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
