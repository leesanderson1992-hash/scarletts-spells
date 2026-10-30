#!/usr/bin/env node
/** Exact-source review release of the owner-approved lexical family plan. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { parseCsv } from "./teaching-dictionary-release-contract";

const mode = process.argv[2];
if (!["plan", "prove", "release", "verify"].includes(mode)) {
  throw new Error("Usage: release-owner-approved-teaching-dictionary-families.mts plan|prove|release|verify [--confirm <sha-prefix>]");
}
const dir = "outputs/teaching-dictionary-import-plan-2026-10-30/";
const names = ["lexical-family-definitions-draft.csv", "lexical-memberships-draft.csv",
  "existing-base-family-anchor-memberships-draft.csv", "existing-word-family-memberships-draft.csv",
  "lexical-variants-draft.csv"];
const inputs = Object.fromEntries(names.map((name) => [name, parseCsv(readFileSync(dir + name, "utf8"))]));
const sourceSha = createHash("sha256").update(names.map((name) =>
  `${name}:${createHash("sha256").update(readFileSync(dir + name)).digest("hex")}`).join("\n")).digest("hex");
const families = inputs[names[0]];
const newWordMembers = inputs[names[1]];
const anchors = inputs[names[2]];
const existingWordMembers = inputs[names[3]];
const variants = inputs[names[4]];
assert.equal(families.length, 169);
assert.equal(newWordMembers.length, 327);
assert.equal(anchors.length, 23);
assert.equal(existingWordMembers.length, 3);
assert.equal(variants.length, 2);
const newKeys = new Set(families.map((row) => row.family_key));
assert.equal(newKeys.size, 169);
const allMembers = [...newWordMembers, ...anchors, ...existingWordMembers];
assert.equal(allMembers.length, 353);
const sourceReference = `Owner-approved Teaching Dictionary batch, 30 October 2026; lexical source ${sourceSha}`;
const approvalReference = `Katie Sanderson owner approvals in Codex, 30 October 2026; lexical source ${sourceSha}`;
if (mode === "release" && (process.argv[3] !== "--confirm" || process.argv[4] !== sourceSha.slice(0, 12))) {
  throw new Error(`Exact source confirmation required: --confirm ${sourceSha.slice(0, 12)}`);
}
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_TRANSACTION;
if (!url || !`${new URL(url).hostname}|${decodeURIComponent(new URL(url).username)}`.includes("wwohrqtunajrbwxyssjf")) {
  throw new Error("Verified Production transaction-pooler URL required");
}
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 });
db.on("error", () => { /* The active query or transaction handles a lost connection. */ });
const protectedTables = ["children", "daily_assignments", "assignment_items", "adle_learning_items", "learning_item_evidence", "child_word_treasures"];
async function protectedCounts() {
  const counts: Record<string, number> = {};
  for (const table of protectedTables) {
    const r = await db.query(`select count(*)::int n from public.${table}`);
    counts[table] = r.rows[0].n;
  }
  return counts;
}
type Fact = { id: string; morphology_id: string; normalised_word: string; word_sum: string;
  morphology_parts: unknown; morphology_joins: unknown; morphology_transformations: unknown };
const facts = new Map<string, Fact>();
async function loadFacts() {
  const words = [...new Set([...allMembers.map((row) => row.normalised_word || row.base_word),
    ...families.map((row) => row.base_lemma)])];
  const result = await db.query(`select w.id,w.normalised_word,m.id morphology_id,m.word_sum,
    m.morphology_parts,m.morphology_joins,m.morphology_transformations
    from public.canonical_teaching_dictionary_words w
    join public.canonical_teaching_dictionary_word_morphology m on m.canonical_word_id=w.id and m.row_status='active'
      and m.review_status='approved_for_first_exposure' and m.analysis_status='approved'
    where w.normalised_word=any($1::text[]) and w.dialect_code='en-GB'
      and w.row_status='active' and w.review_status='approved_for_first_exposure'`, [words]);
  for (const row of result.rows) {
    if (facts.has(row.normalised_word)) throw new Error(`DUPLICATE_FACT:${row.normalised_word}`);
    facts.set(row.normalised_word, row);
  }
  for (const word of words) assert(facts.has(word), `APPROVED_WORD_OR_MORPHOLOGY_MISSING:${word}`);
  for (const row of allMembers) {
    const word = row.normalised_word || row.base_word;
    const fact = facts.get(word)!;
    assert.equal(fact.word_sum, row.word_sum, `WORD_SUM_CONFLICT:${word}:${row.family_key}`);
    assert.deepEqual(fact.morphology_parts, JSON.parse(row.morphology_parts), `PARTS_CONFLICT:${word}:${row.family_key}`);
    assert.deepEqual(fact.morphology_joins, JSON.parse(row.morphology_joins), `JOINS_CONFLICT:${word}:${row.family_key}`);
    assert.deepEqual(fact.morphology_transformations, JSON.parse(row.morphology_transformations), `TRANSFORMS_CONFLICT:${word}:${row.family_key}`);
  }
}
async function latestFamily(key: string) {
  const result = await db.query(`select family_key,revision,review_status,base_lemma,base_kind
    from public.canonical_teaching_dictionary_lexical_base_families
    where family_key=$1 order by revision desc limit 1`, [key]);
  return result.rows[0] ?? null;
}
async function insertMany(prefix: string, rows: unknown[][], jsonIndexes: number[] = []) {
  if (!rows.length) return;
  const width = rows[0].length;
  assert(rows.every((row) => row.length === width));
  const placeholders = rows.map((_, rowIndex) => `(${Array.from({ length: width }, (_, colIndex) =>
    `$${rowIndex * width + colIndex + 1}${jsonIndexes.includes(colIndex) ? "::jsonb" : ""}`).join(",")})`);
  await db.query(`${prefix} values ${placeholders.join(",")}`, rows.flat());
}
async function verifyAll() {
  const allKeys = [...new Set(allMembers.map((row) => row.family_key))];
  const latest = await db.query(`select distinct on (family_key) family_key,revision,review_status,base_lemma
    from public.canonical_teaching_dictionary_lexical_base_families
    where family_key=any($1::text[]) order by family_key,revision desc`, [allKeys]);
  const familyRows = new Map(latest.rows.map((row) => [row.family_key, row]));
  const currentFamilies = new Map<string, number>();
  for (const key of allKeys) {
    const current = familyRows.get(key);
    assert(current?.review_status === "approved", `FAMILY_NOT_APPROVED:${key}`);
    currentFamilies.set(key, current.revision);
  }
  for (const family of families) assert.equal(familyRows.get(family.family_key)?.base_lemma, family.base_lemma);
  const memberResult = await db.query(`with latest as (
      select distinct on (family_key) family_key,revision
      from public.canonical_teaching_dictionary_lexical_base_families
      where family_key=any($1::text[]) order by family_key,revision desc)
    select m.family_key,m.canonical_word_id,m.canonical_morphology_id,m.word_sum,
      m.morphology_parts,m.morphology_joins,m.morphology_transformations
    from public.canonical_teaching_dictionary_lexical_base_family_members m
    join latest using(family_key,revision)
    where m.canonical_word_id=any($2::uuid[])`,
    [allKeys, [...new Set([...facts.values()].map((fact) => fact.id))]]);
  const members = new Map(memberResult.rows.map((row) => [`${row.family_key}:${row.canonical_word_id}`, row]));
  for (const row of allMembers) {
    const word = row.normalised_word || row.base_word;
    const member = members.get(`${row.family_key}:${facts.get(word)!.id}`);
    assert(member, `MEMBERSHIP_MISSING:${word}:${row.family_key}`);
    assert.equal(member.canonical_morphology_id, facts.get(word)!.morphology_id);
    assert.equal(member.word_sum, row.word_sum);
    assert.deepEqual(member.morphology_parts, JSON.parse(row.morphology_parts));
    assert.deepEqual(member.morphology_joins, JSON.parse(row.morphology_joins));
    assert.deepEqual(member.morphology_transformations, JSON.parse(row.morphology_transformations));
  }
  const variantResult = await db.query(`select family_key,revision,canonical_word_id,source_base_text
    from public.canonical_teaching_dictionary_lexical_base_variants
    where family_key=any($1::text[])`, [[...new Set(variants.map((row) => row.family_key))]]);
  const variantKeys = new Set(variantResult.rows.map((row) =>
    `${row.family_key}:${row.revision}:${row.canonical_word_id}:${row.source_base_text}`));
  for (const row of variants) {
    assert(variantKeys.has(`${row.family_key}:${currentFamilies.get(row.family_key)}:${facts.get(row.normalised_word)!.id}:${row.source_base_text}`),
      `VARIANT_MISSING:${row.normalised_word}`);
  }
}
await db.connect();
try {
  await db.query(mode === "plan" || mode === "verify" ? "begin read only" : "begin isolation level serializable");
  await db.query("set local statement_timeout='60s'");
  await db.query("set local lock_timeout='10s'");
  await db.query("set local idle_in_transaction_session_timeout='120s'");
  const before = await protectedCounts();
  await loadFacts();
  if (mode === "verify") {
    await verifyAll();
    await db.query("rollback");
    console.log(JSON.stringify({ mode, verifiedFamilies: 169, verifiedMemberships: 353, verifiedVariants: 2, sourceSha256: sourceSha }));
  } else {
    for (const family of families) {
      const current = await latestFamily(family.family_key);
      if (current) throw new Error(`PROPOSED_FAMILY_ALREADY_EXISTS:${family.family_key}`);
      assert.equal(family.base_meaning.length > 0, true);
      assert.equal(family.requires_new_sense_approval === "yes", family.meaning_source === "proposed_new_sense_requires_review");
    }
    const existingKeys = [...new Set(allMembers.filter((row) => !newKeys.has(row.family_key)).map((row) => row.family_key))];
    const latest = new Map<string, number>();
    for (const key of existingKeys) {
      const current = await latestFamily(key);
      assert(current?.review_status === "approved", `EXISTING_FAMILY_NOT_APPROVED:${key}`);
      latest.set(key, current.revision);
      const selected = allMembers.filter((row) => row.family_key === key);
      const ids = selected.map((row) => facts.get(row.normalised_word || row.base_word)!.id);
      const duplicates = await db.query(`select count(*)::int n from public.canonical_teaching_dictionary_lexical_base_family_members
        where family_key=$1 and revision=$2 and canonical_word_id=any($3::uuid[])`, [key, current.revision, ids]);
      assert.equal(duplicates.rows[0].n, 0, `EXISTING_MEMBERSHIP_CONFLICT:${key}`);
    }
    if (mode === "plan") {
      await db.query("rollback");
      console.log(JSON.stringify({ mode, newFamilies: 169, newWordMemberships: 327,
        existingBaseAnchors: 23, existingWordMemberships: 3,
        existingFamiliesToRevise: existingKeys.length, variants: 2,
        sourceSha256: sourceSha, protectedCounts: before }));
    } else {
      await insertMany(`insert into public.canonical_teaching_dictionary_lexical_base_families
          (family_key,revision,base_lemma,base_part_of_speech,base_kind,canonical_base_word_id,
           base_meaning,source_reference,review_status)`,
        families.map((family) => [family.family_key, 1, family.base_lemma,
          family.base_part_of_speech, "free_base", facts.get(family.base_lemma)!.id,
          family.base_meaning, sourceReference, "draft"]));
      const newMembers = allMembers.filter((member) => newKeys.has(member.family_key));
      await insertMany(`insert into public.canonical_teaching_dictionary_lexical_base_family_members
            (family_key,revision,canonical_word_id,word_part_of_speech,relationship_kind,
             canonical_morphology_id,word_sum,morphology_parts,morphology_joins,
             morphology_transformations,intended_meaning,source_reference)`,
        newMembers.map((member) => {
          const fact = facts.get(member.normalised_word || member.base_word)!;
          return [member.family_key, 1, fact.id, member.word_part_of_speech,
            member.relationship_kind, fact.morphology_id, member.word_sum,
            member.morphology_parts, member.morphology_joins, member.morphology_transformations,
            member.intended_meaning, sourceReference];
        }), [7, 8, 9]);
      await insertMany(`insert into public.canonical_teaching_dictionary_lexical_base_variants
            (family_key,revision,canonical_word_id,source_base_text,relation_kind,source_reference,
             approval_reference,reviewed_by,reviewed_at)`,
        variants.map((variant) => [variant.family_key, 1, facts.get(variant.normalised_word)!.id,
          variant.source_base_text, variant.relation_kind, sourceReference, approvalReference,
          "Katie Sanderson", new Date()]));
      for (const family of families) {
        await db.query(`select public.approve_canonical_lexical_base_family($1,1,$2,$3)`,
          [family.family_key, "Katie Sanderson", approvalReference]);
      }
      for (const row of allMembers.filter((member) => !newKeys.has(member.family_key))) {
        const word = row.normalised_word || row.base_word;
        const fact = facts.get(word)!;
        const currentRevision = latest.get(row.family_key)!;
        const next = await db.query(`select public.review_lexical_base_family_member_revision(
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10) revision`,
          [row.family_key, currentRevision, fact.id, fact.morphology_id,
            row.word_part_of_speech, row.relationship_kind, row.intended_meaning,
            sourceReference, "Katie Sanderson", approvalReference]);
        assert.equal(next.rows[0].revision, currentRevision + 1);
        latest.set(row.family_key, currentRevision + 1);
      }
      await verifyAll();
      assert.deepEqual(await protectedCounts(), before, "PROTECTED_TABLE_COUNT_CHANGED");
      if (mode === "prove") {
        await db.query("rollback");
        console.log(JSON.stringify({ mode, provedFamilies: 169, provedMemberships: 353,
          rolledBack: true, sourceSha256: sourceSha }));
      } else {
        await db.query("commit");
        console.log(JSON.stringify({ mode, publishedFamilies: 169, publishedMemberships: 353,
          variants: 2, sourceSha256: sourceSha }));
      }
    }
  }
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally {
  await db.end();
}
