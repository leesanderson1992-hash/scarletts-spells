/* eslint-disable @typescript-eslint/no-explicit-any -- synthetic PostgREST fixture */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ingPreviewPool } from "../lib/adle/ing/preview-fixture";
import { createDraftDegreeFamilies, bindDegreeFamilyCanonicalWords } from "../lib/adle/inflection/content";
import { loadReleasedInflectionMemberships } from "../lib/adle/word-skill-relationships/released-inflection-memberships";
import { adaptSpecialistMemberships } from "../lib/adle/word-skill-relationships/adapters";
import { readCanonicalWordSkillRelationships } from "../lib/adle/word-skill-relationships/authority";

const ingSkill = "D4_INF_ING_ENDINGS_REGULAR";
const degreeSkill = "D4_INF_COMPARATIVE_SUPERLATIVE_REGULAR";
const ing = ingPreviewPool(ingSkill).slice(0, 2).map(word => ({ ...word, canonicalWordId: randomUUID(), rowStatus: "active", reviewStatus: "approved_for_first_exposure", reviewerRef: "reviewer", approvalRef: "approval" }));
const draft = createDraftDegreeFamilies().find(family => family.microSkillKey === degreeSkill)!;
const family = bindDegreeFamilyCanonicalWords(draft, new Map(draft.words.map(word => [word.word, randomUUID()])));
family.rowStatus = "active";
family.reviewStatus = "approved_for_first_exposure";
family.provenance.reviewerRef = "reviewer";
family.provenance.approvalRef = "approval";
family.lexicalVerification = { adjective: true, gradable: true, acceptsErEst: true, childSuitable: true, oneSyllable: false, shortVowelBeforeFinalConsonant: false };

const sourceRows = [
  ...ing.map(word => ({ canonical_word_id: word.canonicalWordId, micro_skill_key: ingSkill, member_role: "derived_target", row_status: word.rowStatus, review_status: word.reviewStatus })),
  ...family.words.map(word => ({ canonical_word_id: word.canonicalWordId, micro_skill_key: degreeSkill,
    member_role: word.degree === "base" ? "support_base" : "derived_target", row_status: family.rowStatus, review_status: family.reviewStatus })),
].map((row, index) => ({ ...row, content_valid: true, provenance_id: `source:${index}`,
  release_manifest_id: "release", release_key: "release", release_manifest_sha256: "manifest-hash",
  authority_id: "authority", authority_fingerprint: "authority-hash", family_key: null }));
let enabled = true;
const calls: { environment: string; wordIds: string[] | null }[] = [];
const client = { async rpc(name: string, params: { p_environment_key: string; p_word_ids: string[] | null }) {
  assert.equal(name, "adle_released_inflection_memberships_v1");
  calls.push({ environment: params.p_environment_key, wordIds: params.p_word_ids });
  return { data: sourceRows.filter(row => (enabled || row.micro_skill_key !== ingSkill) &&
    (!params.p_word_ids || params.p_word_ids.includes(row.canonical_word_id))), error: null };
} } as any;
async function main() {
const rows = await loadReleasedInflectionMemberships(client, "staging");
assert.equal(rows.length, 5);
assert.equal(calls[0].wordIds, null, "complete reads use one compact projection");
const scoped = await loadReleasedInflectionMemberships(client, "staging", [ing[0].canonicalWordId]);
assert.equal(scoped.length, 1, "word detail reads only its requested identity");
assert.deepEqual(calls[1].wordIds, [ing[0].canonicalWordId]);
const facts = adaptSpecialistMemberships(rows);
const words = [...ing, ...family.words].map(word => ({ canonicalWordId: word.canonicalWordId, normalisedWord: word.word, state: "active" as const, identityStable: true }));
const microSkills = [ingSkill, degreeSkill].map(microSkillKey => ({ microSkillKey, state: "active" as const, identityStable: true }));
const read = (pairDecisions: any[] = []) => readCanonicalWordSkillRelationships({ words, microSkills, facts, pairDecisions });
assert.equal(read().relationships.length, 4, "derived words gain reviewed positive relationships; comparative base remains a support form");
assert(!read().relationships.some(row => row.canonicalWordId === family.words[0].canonicalWordId));
assert.equal(read([{ id: "withdraw", canonicalWordId: ing[0].canonicalWordId, microSkillKey: ingSkill, action: "deassign" }]).relationships.length, 3,
  "a manager withdrawal still removes the effective pair");
enabled = false;
assert.equal((await loadReleasedInflectionMemberships(client, "staging")).filter(row => row.microSkillKey === ingSkill).length, 0,
  "a disabled specialist route does not grant new positive relationships");
console.log("inflection relationship regression passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
