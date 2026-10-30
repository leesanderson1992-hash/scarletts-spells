#!/usr/bin/env node
/** Add seven existing base words to their already-approved lexical families. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { parseCsv } from "./teaching-dictionary-release-contract";

const mode = process.argv[2];
if (!["plan", "prove", "release", "verify"].includes(mode)) {
  throw new Error("Usage: release-remaining-existing-base-family-memberships.mts plan|prove|release|verify [--confirm <sha-prefix>]");
}
const path = "outputs/teaching-dictionary-import-plan-2026-10-30/remaining-existing-base-family-joins.csv";
const source = readFileSync(path, "utf8");
const sourceSha = createHash("sha256").update(source).digest("hex");
const rows = parseCsv(source);
assert.deepEqual(rows.map((row) => row.base_word).sort(),
  ["agree", "come", "cream", "head", "ice", "usual", "view"]);
assert(rows.every((row) => row.family_key === `${row.base_word}_${row.word_part_of_speech}_base_family`
  && row.relationship_kind === "free_base" && row.word_sum === row.base_word));
const index = process.argv.indexOf("--confirm");
if (mode === "release" && (index < 0 || process.argv[index + 1] !== sourceSha.slice(0, 12))) {
  throw new Error(`Exact source confirmation required: --confirm ${sourceSha.slice(0, 12)}`);
}
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_TRANSACTION;
if (!url || !`${new URL(url).hostname}|${decodeURIComponent(new URL(url).username)}`.includes("wwohrqtunajrbwxyssjf")) {
  throw new Error("Verified Production transaction-pooler URL required");
}
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 });
const sourceReference = `Owner-approved completion of seven existing base family memberships, 30 October 2026; ${sourceSha}`;
const approvalReference = `Katie Sanderson owner instruction to finish all existing base families, 30 October 2026; ${sourceSha}`;
const protectedTables = ["children", "daily_assignments", "assignment_items", "adle_learning_items", "learning_item_evidence", "child_word_treasures"];
async function counts() {
  const out: Record<string, number> = {};
  for (const table of protectedTables) out[table] = (await db.query(`select count(*)::int n from public.${table}`)).rows[0].n;
  return out;
}
async function latest(key: string) {
  const result = await db.query(`select * from public.canonical_teaching_dictionary_lexical_base_families
    where family_key=$1 order by revision desc limit 1`, [key]);
  return result.rows[0] ?? null;
}
await db.connect();
try {
  await db.query(mode === "plan" || mode === "verify" ? "begin read only" : "begin isolation level serializable");
  await db.query("set local statement_timeout='60s'");
  await db.query("set local lock_timeout='10s'");
  const before = await counts();
  const facts = new Map<string, Record<string, any>>();
  for (const row of rows) {
    const result = await db.query(`select w.id word_id,w.normalised_word,m.id morphology_id,m.word_sum,
      m.morphology_parts,m.morphology_joins,m.morphology_transformations
      from public.canonical_teaching_dictionary_words w
      join public.canonical_teaching_dictionary_word_morphology m on m.canonical_word_id=w.id
        and m.row_status='active' and m.review_status='approved_for_first_exposure' and m.analysis_status='approved'
      where w.id=$1 and w.normalised_word=$2 and w.row_status='active' and w.review_status='approved_for_first_exposure'`,
      [row.canonical_word_id, row.base_word]);
    assert.equal(result.rowCount, 1, `WORD_OR_MORPHOLOGY_MISSING:${row.base_word}`);
    const fact = result.rows[0];
    assert.equal(fact.word_sum, row.word_sum);
    assert(fact.morphology_parts.some((part: Record<string, string>) => part.kind === "base" && part.sourceText === row.base_word));
    assert.equal(fact.morphology_parts.map((part: Record<string, string>) => part.surfaceText).join(""), row.base_word);
    facts.set(row.base_word, fact);
  }
  if (mode === "verify") {
    for (const row of rows) {
      const family = await latest(row.family_key);
      assert(family?.review_status === "approved");
      const member = await db.query(`select * from public.canonical_teaching_dictionary_lexical_base_family_members
        where family_key=$1 and revision=$2 and canonical_word_id=$3`,
        [row.family_key, family.revision, facts.get(row.base_word)!.word_id]);
      assert.equal(member.rowCount, 1, `BASE_MEMBERSHIP_MISSING:${row.base_word}`);
      assert.equal(member.rows[0].relationship_kind, "free_base");
      assert.equal(member.rows[0].canonical_morphology_id, facts.get(row.base_word)!.morphology_id);
    }
    await db.query("rollback");
    console.log(JSON.stringify({ mode, verified: 7, sourceSha256: sourceSha }));
  } else {
    const current = new Map<string, Record<string, any>>();
    for (const row of rows) {
      const family = await latest(row.family_key);
      assert(family?.review_status === "approved", `FAMILY_MISSING:${row.family_key}`);
      assert.equal(family.base_kind, "free_base");
      assert.equal(family.base_lemma, row.base_word);
      assert.equal(family.canonical_base_word_id, facts.get(row.base_word)!.word_id);
      const member = await db.query(`select count(*)::int n from public.canonical_teaching_dictionary_lexical_base_family_members
        where family_key=$1 and revision=$2 and canonical_word_id=$3`,
        [row.family_key, family.revision, facts.get(row.base_word)!.word_id]);
      assert.equal(member.rows[0].n, 0, `BASE_ALREADY_MEMBER:${row.base_word}`);
      current.set(row.family_key, family);
    }
    if (mode === "plan") {
      await db.query("rollback");
      console.log(JSON.stringify({ mode, ready: 7, sourceSha256: sourceSha, protectedCounts: before }));
    } else {
      for (const row of rows) {
        const family = current.get(row.family_key)!;
        const fact = facts.get(row.base_word)!;
        const revision = family.revision + 1;
        await db.query(`insert into public.canonical_teaching_dictionary_lexical_base_families
          (family_key,revision,base_lemma,base_part_of_speech,base_kind,canonical_base_word_id,
           base_meaning,source_reference,review_status)
          values ($1,$2,$3,$4,$5,$6,$7,$8,'draft')`,
          [row.family_key, revision, family.base_lemma, family.base_part_of_speech,
            family.base_kind, family.canonical_base_word_id, family.base_meaning, sourceReference]);
        await db.query(`insert into public.canonical_teaching_dictionary_lexical_base_family_members
          (family_key,revision,canonical_word_id,word_part_of_speech,relationship_kind,
           canonical_morphology_id,word_sum,morphology_parts,morphology_joins,
           morphology_transformations,intended_meaning,source_reference)
          select family_key,$2,canonical_word_id,word_part_of_speech,relationship_kind,
           canonical_morphology_id,word_sum,morphology_parts,morphology_joins,
           morphology_transformations,intended_meaning,source_reference
          from public.canonical_teaching_dictionary_lexical_base_family_members
          where family_key=$1 and revision=$3`, [row.family_key, revision, family.revision]);
        await db.query(`insert into public.canonical_teaching_dictionary_lexical_base_variants
          (family_key,revision,canonical_word_id,source_base_text,relation_kind,
           source_reference,approval_reference,reviewed_by,reviewed_at)
          select family_key,$2,canonical_word_id,source_base_text,relation_kind,
           source_reference,approval_reference,reviewed_by,reviewed_at
          from public.canonical_teaching_dictionary_lexical_base_variants
          where family_key=$1 and revision=$3`, [row.family_key, revision, family.revision]);
        await db.query(`insert into public.canonical_teaching_dictionary_lexical_base_family_members
          (family_key,revision,canonical_word_id,word_part_of_speech,relationship_kind,
           canonical_morphology_id,word_sum,morphology_parts,morphology_joins,
           morphology_transformations,intended_meaning,source_reference)
          values ($1,$2,$3,$4,'free_base',$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11)`,
          [row.family_key, revision, fact.word_id, row.word_part_of_speech,
            fact.morphology_id, row.word_sum, JSON.stringify(fact.morphology_parts),
            JSON.stringify(fact.morphology_joins), JSON.stringify(fact.morphology_transformations),
            row.intended_meaning, sourceReference]);
        await db.query(`select public.approve_canonical_lexical_base_family($1,$2,$3,$4)`,
          [row.family_key, revision, "Katie Sanderson", approvalReference]);
      }
      assert.deepEqual(await counts(), before, "PROTECTED_TABLE_COUNT_CHANGED");
      if (mode === "prove") {
        await db.query("rollback");
        console.log(JSON.stringify({ mode, proved: 7, rolledBack: true, sourceSha256: sourceSha }));
      } else {
        await db.query("commit");
        console.log(JSON.stringify({ mode, published: 7, sourceSha256: sourceSha }));
      }
    }
  }
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally {
  await db.end();
}
