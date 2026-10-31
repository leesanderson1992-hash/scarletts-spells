#!/usr/bin/env node
/** Read-only synthetic witness for every owner-approved target in the pending
 * family release. Learner records and assignments are never created. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";
import { selectBaseWordFamilyLesson } from "../lib/adle/base-word-family-selection";
import { eligibleBaseFamilyCounts, shortlistBaseFamilyPairs } from "../lib/adle/base-word-family-counts";
import type { BaseWordFamilyAuthorityProjectionV2 } from "../lib/adle/curriculum-release-activation";

const SKILL = "D4_MOR_BASE_WORDS_IDENTIFY_BASE";
const CLUSTER = [SKILL, "D4_MOR_BASE_WORDS_PRESERVE_BASE",
  "D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX", "D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX"];
const folder = "/tmp/identify-approved-family-release-2026-10-31";
const family = JSON.parse(readFileSync(`${folder}/family-authority.json`, "utf8")) as BaseWordFamilyAuthorityProjectionV2;
const closure = JSON.parse(readFileSync(`${folder}/dictionary-closure.json`, "utf8")) as {
  words: Array<{ wordKey: string }> };
const bindings = JSON.parse(readFileSync(`${folder}/dictionary-source-bindings.json`, "utf8")) as
  Array<{ wordKey: string; canonicalWordId: string }>;
const report = readFileSync("docs/implementation/qa/identify-base-word-next-family-release-review-2026-10-31.md", "utf8");
const section = report.split("## Exact word content to review\n")[1]?.split("## Act and govern exception\n")[0];
assert(section);
const targets = section.split("\n").filter((line) => line.startsWith("|")).slice(2)
  .map((line) => line.split("|")[1].trim());
assert.equal(targets.length, 61);
const bindingByKey = new Map(bindings.map((row) => [row.wordKey, row.canonicalWordId]));
const closureIds = new Set(closure.words.map((row) => bindingByKey.get(row.wordKey)).filter((id): id is string => Boolean(id)));
assert.equal(closureIds.size, closure.words.length);
const db = new pg.Client({ connectionString: process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED,
  ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query("begin transaction isolation level repeatable read read only");
  const words = (await db.query<{ id: string; normalised_word: string }>(`select id,normalised_word
    from public.canonical_teaching_dictionary_words where normalised_word=any($1::text[])`, [targets])).rows;
  assert.equal(words.length, 61);
  const idByWord = new Map(words.map((row) => [row.normalised_word, row.id]));
  const vetoes = (await db.query<{ canonical_word_id: string }>(`select distinct canonical_word_id
    from public.teaching_dictionary_pair_latest_decisions where environment_key='production'
      and micro_skill_key=any($1::text[]) and action='deassign'`, [CLUSTER])).rows;
  const excluded = new Set(vetoes.map((row) => row.canonical_word_id));
  const counts = eligibleBaseFamilyCounts(family, SKILL, closureIds, excluded);
  const pairs = shortlistBaseFamilyPairs(counts);
  const baseByFamily = new Map(family.families.map((entry) => [entry.baseFamilyKey, entry.baseWordId]));
  const facts = {
    familyAuthoritySchemaVersion: 2 as const,
    selectionPolicyVersion: "base_word_regularity_v1" as const,
    excludedCanonicalWordIds: excluded,
    eligibleFamilyPairs: pairs,
    families: family.families.map((entry) => ({ baseFamilyKey: entry.baseFamilyKey,
      microSkillKey: SKILL, rowStatus: "active" as const, reviewStatus: "approved_for_first_exposure" as const })),
    members: family.families.flatMap((entry) => entry.members.map((member) => ({
      baseFamilyKey: entry.baseFamilyKey, canonicalWordId: member.canonicalWordId,
      memberRole: member.structuralRole === "base" ? "base" as const : "transfer" as const,
      applicableMicroSkillKeys: member.applicableMicroSkillKeys,
      authenticSelectionEligible: member.authenticTargetEligible,
      assignmentEligible: member.assignmentEligible, complexityLevel: member.complexityLevel,
      lessonRegularity: member.lessonRegularity,
      lessonContentEligible: closureIds.has(member.canonicalWordId),
      rowStatus: "active" as const, reviewStatus: "approved_for_first_exposure" as const,
    }))),
  };
  const item = (id: string, date: string) => ({ learningItemId: id, childId: "synthetic-proof-child",
    canonicalWordId: id, microSkillKey: SKILL, itemStatus: "pending" as const,
    sourceKind: "verified_misspelling" as const, sourceRef: `synthetic:${id}`,
    sourceAttemptText: null, reteachPriority: false, ejectedOn: null, intakeOn: date,
    rowStatus: "active" as const });
  const targetIds = targets.map((word) => idByWord.get(word)!);
  const blocked: Array<{ word: string; reasons: string[] }> = [];
  let passed = 0;
  for (const word of targets) {
    const id = idByWord.get(word)!;
    let witness = false;
    const reasons = new Set<string>();
    for (const partner of targetIds) {
      if (partner === id) continue;
      const selection = selectBaseWordFamilyLesson("synthetic-proof-child", SKILL, {
        ...facts, learningItems: [item(id, "2026-01-01"), item(partner, "2026-01-02")],
      });
      if (!selection.skipReasons.length && selection.slots.some((slot) =>
        slot.canonicalWordId === id && slot.assignmentRole === "primary_authentic_target")) {
        assert(selection.slots.every((slot) => !excluded.has(slot.canonicalWordId) ||
          slot.canonicalWordId === baseByFamily.get(slot.baseFamilyKey)));
        assert(selection.guidedFamilySections.every((section) => section.guidedWordIds.every((wordId) =>
          !excluded.has(wordId) || wordId === baseByFamily.get(section.baseFamilyKey))));
        witness = true; break;
      }
      for (const reason of selection.skipReasons) reasons.add(reason);
    }
    if (witness) passed += 1;
    else blocked.push({ word, reasons: [...reasons] });
  }
  console.log(JSON.stringify({ checked: targets.length, passed, blocked,
    families: family.families.length, candidateFamilyPairs: pairs.length,
    excludedGovernedWordIds: excluded.size }));
  await db.query("rollback");
  if (blocked.length) process.exitCode = 1;
} catch (error) {
  await db.query("rollback").catch(() => undefined);
  throw error;
} finally { await db.end(); }
