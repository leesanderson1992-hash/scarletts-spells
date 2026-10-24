#!/usr/bin/env node
/** Publish owner-approved definitions after the immutable canonical release. */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import pg from "pg";
import { loadCanonicalPackage, parseCsv } from "./teaching-dictionary-release-contract";
import { assertDatabaseTarget, TARGETS } from "./teaching-dictionary-release";

type Target = "staging" | "production";
type WordFacts = {
  word_key: string; id: string; source_row_hash: string;
  metadata_id: string; morphology_id: string; dictation_id: string;
  definition: string | null;
};

const releaseDir = resolve(
  "docs/implementation/seed-data/teaching-dictionary/releases/2026-10-23-reviewed-root-homophone-words-v2",
);
const expectedHash = "7a6bbffd6b989309746cb238dc056836bd42f064abdcd9ca0d7ed7fe2e06cb25";

async function main() {
  const target = process.argv[2] as Target;
  const mode = process.argv[3];
  if (!(target in TARGETS) || !["plan", "release", "verify"].includes(mode)) {
    throw new Error("Usage: publish-reviewed-root-homophone-definitions.ts staging|production plan|release|verify");
  }
  const pkg = await loadCanonicalPackage(releaseDir);
  if (pkg.manifest.packageSha256 !== expectedHash) throw new Error("Canonical package hash changed");
  const sourceBytes = await readFile(resolve(releaseDir, "approved-source.csv"));
  const sourceHash = createHash("sha256").update(sourceBytes).digest("hex");
  const source = parseCsv(sourceBytes.toString("utf8"));
  const expectedKeys = new Set(pkg.csv["canonical_words.csv"].map(row => row.word_key));
  if (source.length !== 194 || expectedKeys.size !== 194 ||
      source.some(row => !expectedKeys.has(row.word_key) || !row.definition?.trim()) ||
      new Set(source.map(row => row.word_key)).size !== 194) {
    throw new Error("Approved definitions do not cover exactly the canonical package words");
  }
  const url = process.env[TARGETS[target].databaseUrlEnv];
  if (!url) throw new Error(`Missing ${TARGETS[target].databaseUrlEnv}`);
  assertDatabaseTarget(url, target);
  const db = new pg.Client({ connectionString: url, ssl: {
    rejectUnauthorized: process.env.SUPABASE_DB_SSL_REJECT_UNAUTHORIZED !== "false",
  } });
  await db.connect();
  try {
    await db.query("begin");
    const facts = (await db.query<WordFacts>(`
      select w.word_key,w.id,w.source_row_hash,
        (select id from public.canonical_teaching_dictionary_word_metadata where canonical_word_id=w.id and row_status='active') metadata_id,
        (select id from public.canonical_teaching_dictionary_word_morphology where canonical_word_id=w.id and row_status='active') morphology_id,
        (select id from public.canonical_teaching_dictionary_dictation_sentences where canonical_word_id=w.id and row_status='active') dictation_id,
        (select definition from public.teaching_dictionary_definition_versions
         where canonical_word_id=w.id and route_id is null order by published_at desc,id desc limit 1) definition
      from public.canonical_teaching_dictionary_words w
      join public.canonical_teaching_dictionary_import_batches b on b.id=w.import_batch_id
      where b.release_id=$1 and b.package_sha256=$2 and b.batch_status='applied'
        and w.row_status='active' and w.review_status='approved_for_first_exposure'
      order by w.word_key`, [pkg.manifest.releaseId, expectedHash])).rows;
    const byKey = new Map(facts.map(row => [row.word_key, row]));
    if (facts.length !== 194 || facts.some(row => !row.metadata_id || !row.morphology_id || !row.dictation_id)) {
      throw new Error("Released word facts are incomplete or changed");
    }
    let alreadyPublished = 0;
    for (const row of source) {
      const fact = byKey.get(row.word_key);
      if (!fact) throw new Error(`Released word missing: ${row.word_key}`);
      if (fact.definition === row.definition) alreadyPublished += 1;
      else if (fact.definition !== null) throw new Error(`Different definition already published: ${row.word_key}`);
    }
    if (mode === "plan" || mode === "verify") {
      if (mode === "verify" && alreadyPublished !== 194) throw new Error(`Only ${alreadyPublished}/194 definitions are published`);
      await db.query("rollback");
      console.log(JSON.stringify({ target, mode, approved: 194, alreadyPublished,
        remaining: 194 - alreadyPublished, sourceHash }));
      return;
    }
    let actor: string;
    if (target === "staging") {
      const existing = await db.query<{ id: string }>(`select created_by as id from public.teaching_dictionary_manager_drafts
        where source_reference=$1 limit 1`, [`${pkg.manifest.releaseId}:${sourceHash}`]);
      actor = existing.rows[0]?.id ?? randomUUID();
      if (!existing.rowCount) await db.query("insert into auth.users(id) values($1)", [actor]);
    } else {
      const email = process.env.TEACHING_DICTIONARY_APPROVER_EMAIL;
      if (!email) throw new Error("TEACHING_DICTIONARY_APPROVER_EMAIL is required for Production");
      const match = await db.query<{ id: string }>("select id from auth.users where lower(email)=lower($1)", [email]);
      if (match.rowCount !== 1) throw new Error("Expected exactly one Production approver identity");
      actor = match.rows[0].id;
    }
    let published = 0;
    for (const row of source) {
      const fact = byKey.get(row.word_key)!;
      if (fact.definition === row.definition) continue;
      const draft = await db.query<{ id: string }>(`
        insert into public.teaching_dictionary_manager_drafts
          (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
        select id,normalised_word,dialect_code,$2::jsonb,'approved_submission',$3,$4
        from public.canonical_teaching_dictionary_words where id=$1
        returning id`, [fact.id, JSON.stringify({ definition: row.definition, routeContents: [] }),
          `${pkg.manifest.releaseId}:${sourceHash}`, actor]);
      await db.query("select public.publish_teaching_dictionary_definition_only($1,$2,$3,$4,$5,$6)",
        [draft.rows[0].id, actor, fact.source_row_hash, fact.metadata_id, fact.dictation_id,
          fact.morphology_id]);
      published += 1;
    }
    await db.query("commit");
    const receipt = { target, projectRef: TARGETS[target].projectRef,
      releaseId: pkg.manifest.releaseId, packageSha256: expectedHash,
      approvedSourceSha256: sourceHash, definitionsPublished: published,
      definitionsPreviouslyPublished: alreadyPublished, publishedAt: new Date().toISOString() };
    const path = resolve(releaseDir, "receipts", `definitions-${target}.json`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(JSON.stringify({ ...receipt, receiptPath: path }));
  } catch (error) {
    await db.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await db.end();
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
