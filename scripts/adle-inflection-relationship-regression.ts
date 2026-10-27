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

const heads = [
  { environment_key: "staging", route_id: "ing_endings_word_lab", route_version: "v1", micro_skill_key: ingSkill, current_revision_id: "ing-revision" },
  { environment_key: "staging", route_id: "comparative_superlative_word_lab", route_version: "v1", micro_skill_key: degreeSkill, current_revision_id: "degree-revision" },
];
const revisions = heads.map(head => ({ id: head.current_revision_id, release_manifest_id: `${head.current_revision_id}:release`, release_manifest_sha256: "manifest-hash", dependency_fingerprint: "dependency-hash", activation_status: "enabled", micro_skill_key: head.micro_skill_key }));
const releases = heads.map(head => ({ id: `${head.current_revision_id}:release`, release_key: head.current_revision_id, route_id: head.route_id, route_version: head.route_version, release_manifest_sha256: "manifest-hash", dependency_fingerprint: "dependency-hash" }));
const dependencies = heads.map((head, index) => ({ release_manifest_id: releases[index].id, micro_skill_key: head.micro_skill_key, authority_id: `${head.current_revision_id}:authority`, authority_key: head.current_revision_id, authority_type: index === 0 ? "ing_word_members" : "adjective_degree_families", semantic_fingerprint: "authority-hash" }));
const authorities = heads.map((head, index) => ({ id: dependencies[index].authority_id, authority_key: dependencies[index].authority_key, authority_type: dependencies[index].authority_type, schema_version: 1, semantic_fingerprint: "authority-hash", semantic_projection: index === 0 ? { microSkillKey: head.micro_skill_key, words: ing } : { microSkillKey: head.micro_skill_key, families: [family] } }));
const tables: Record<string, any[]> = { adle_route_activation_heads: heads, adle_route_activation_revisions: revisions,
  adle_curriculum_release_manifests: releases, adle_curriculum_release_dependencies: dependencies, adle_curriculum_dependency_authorities: authorities };
class Query {
  private predicates: ((row: any) => boolean)[] = [];
  constructor(private table: string) {}
  select(_columns: string) { return this; }
  eq(column: string, value: unknown) { this.predicates.push(row => row[column] === value); return this; }
  in(column: string, values: unknown[]) { this.predicates.push(row => values.includes(row[column])); return this; }
  then(resolve: (result: { data: any[]; error: null }) => unknown, reject?: (error: unknown) => unknown) {
    return Promise.resolve({ data: tables[this.table].filter(row => this.predicates.every(predicate => predicate(row))), error: null }).then(resolve, reject);
  }
}
const client = { from(table: string) { return new Query(table); } } as any;
async function main() {
const rows = await loadReleasedInflectionMemberships(client, "staging");
assert.equal(rows.length, 5);
const facts = adaptSpecialistMemberships(rows);
const words = [...ing, ...family.words].map(word => ({ canonicalWordId: word.canonicalWordId, normalisedWord: word.word, state: "active" as const, identityStable: true }));
const microSkills = [ingSkill, degreeSkill].map(microSkillKey => ({ microSkillKey, state: "active" as const, identityStable: true }));
const read = (pairDecisions: any[] = []) => readCanonicalWordSkillRelationships({ words, microSkills, facts, pairDecisions });
assert.equal(read().relationships.length, 4, "derived words gain reviewed positive relationships; comparative base remains a support form");
assert(!read().relationships.some(row => row.canonicalWordId === family.words[0].canonicalWordId));
assert.equal(read([{ id: "withdraw", canonicalWordId: ing[0].canonicalWordId, microSkillKey: ingSkill, action: "deassign" }]).relationships.length, 3,
  "a manager withdrawal still removes the effective pair");
revisions[0].activation_status = "disabled";
assert.equal((await loadReleasedInflectionMemberships(client, "staging")).filter(row => row.microSkillKey === ingSkill).length, 0,
  "a disabled specialist route does not grant new positive relationships");
console.log("inflection relationship regression passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
