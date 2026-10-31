/** Read-only synthetic selector check for every currently released affixed
 * dictionary assignment. No learner records or assignments are created. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";
import { selectBaseWordFamilyLesson } from "../lib/adle/base-word-family-selection";

const SKILL = "D4_MOR_BASE_WORDS_IDENTIFY_BASE";
const folder = "docs/implementation/qa/base-word-affixed-dictionary-assignment-2026-10-31";
const parseCsv = (text: string): Record<string, string>[] => {
  const lines: string[][] = [];
  let line: string[] = [], field = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { line.push(field); field = ""; }
    else if (char === "\n" && !quoted) { line.push(field); lines.push(line); line = []; field = ""; }
    else field += char;
  }
  const [head, ...rows] = lines;
  return rows.filter((row) => row.length === head.length).map((row) =>
    Object.fromEntries(head.map((key, index) => [key, row[index]])));
};
const candidates = parseCsv(readFileSync(`${folder}/word-audit.csv`, "utf8"));
const excluded = new Set(readFileSync(`${folder}/excluded-irregular-families.txt`, "utf8").trim().split("\n"));
const db = new pg.Client({ connectionString: process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED,
  ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query("begin transaction isolation level repeatable read read only");
  const active = (await db.query(`select a.semantic_projection family,d2.authority_id closure_id
    from public.adle_route_activation_heads h
    join public.adle_route_activation_revisions r on r.id=h.current_revision_id
    join public.adle_curriculum_release_dependencies d on d.release_manifest_id=r.release_manifest_id
      and d.micro_skill_key=h.micro_skill_key and d.authority_type='family_membership'
    join public.adle_curriculum_dependency_authorities a on a.id=d.authority_id
    join public.adle_curriculum_release_dependencies d2 on d2.release_manifest_id=r.release_manifest_id
      and d2.micro_skill_key=h.micro_skill_key and d2.authority_type='teaching_dictionary_closure'
    where h.environment_key='production' and h.route_id='base_word_lab' and h.route_version='v2'
      and h.micro_skill_key=$1 and r.activation_status='enabled'`, [SKILL])).rows[0];
  assert(active);
  const closure = new Set((await db.query(`select canonical_word_id from public.adle_teaching_dictionary_closure_words
    where authority_id=$1`, [active.closure_id])).rows.map((row) => row.canonical_word_id));
  const families = active.family.families.filter((family: { baseFamilyKey: string; members: Array<{ lessonRegularity?: { status: string } }> }) =>
    !excluded.has(family.baseFamilyKey) && family.members.every((member) => member.lessonRegularity?.status === "regular"));
  const facts = {
    familyAuthoritySchemaVersion: 2 as const,
    selectionPolicyVersion: "base_word_regularity_v1" as const,
    families: families.map((family: { baseFamilyKey: string }) => ({ baseFamilyKey: family.baseFamilyKey,
      microSkillKey: SKILL, rowStatus: "active" as const, reviewStatus: "approved_for_first_exposure" as const })),
    members: families.flatMap((family: { baseFamilyKey: string; members: Array<{ canonicalWordId: string; structuralRole: string; applicableMicroSkillKeys: string[]; assignmentEligible: boolean; complexityLevel: number | null; lessonRegularity: { status: "regular" | "irregular" | "needs_review"; source: string; reason: string } }> }) =>
      family.members.map((member) => ({ baseFamilyKey: family.baseFamilyKey, canonicalWordId: member.canonicalWordId,
        memberRole: member.structuralRole === "base" ? "base" as const : "transfer" as const,
        applicableMicroSkillKeys: member.applicableMicroSkillKeys,
        authenticSelectionEligible: true, lessonContentEligible: closure.has(member.canonicalWordId),
        lessonRegularity: member.lessonRegularity, assignmentEligible: member.assignmentEligible,
        complexityLevel: member.complexityLevel, rowStatus: "active" as const,
        reviewStatus: "approved_for_first_exposure" as const }))),
  };
  const partnerIds = [...new Set(facts.members.filter((member) => member.memberRole !== "base" && member.assignmentEligible)
    .map((member) => member.canonicalWordId))];
  const item = (id: string, date: string) => ({ learningItemId: id, childId: "audit-child", canonicalWordId: id,
    microSkillKey: SKILL, itemStatus: "pending" as const, sourceKind: "verified_misspelling" as const,
    sourceRef: `synthetic-audit:${id}`, sourceAttemptText: null, reteachPriority: false,
    ejectedOn: null, intakeOn: date, rowStatus: "active" as const });
  const result: Array<{ word: string; canonicalWordId: string; status: string; partnerWordId: string; reason: string }> = [];
  for (const candidate of candidates) {
    if (candidate.active_route_member !== "true") continue;
    let witness: string | null = null;
    let reason = "no_compatible_two_family_lesson";
    for (const partner of partnerIds) {
      if (partner === candidate.canonical_word_id) continue;
      const selection = selectBaseWordFamilyLesson("audit-child", SKILL, {
        ...facts, learningItems: [item(candidate.canonical_word_id, "2026-01-01"), item(partner, "2026-01-02")],
      });
      if (selection.skipReasons.length === 0 && selection.slots.some((slot) =>
        slot.canonicalWordId === candidate.canonical_word_id && slot.assignmentRole === "primary_authentic_target")) {
        witness = partner;
        break;
      }
      reason = selection.skipReasons.join("|");
    }
    result.push({ word: candidate.word, canonicalWordId: candidate.canonical_word_id,
      status: witness ? "selector_witness_pass" : "selector_witness_blocked",
      partnerWordId: witness ?? "", reason: witness ? "" : reason });
  }
  writeFileSync(`${folder}/released-word-selector-witness.csv`, ["word,canonical_word_id,status,partner_word_id,reason",
    ...result.map((row) => [row.word,row.canonicalWordId,row.status,row.partnerWordId,row.reason]
      .map((value) => `"${value.replaceAll('"', '""')}"`).join(","))].join("\n") + "\n");
  console.log(JSON.stringify({ checked: result.length, passed: result.filter((row) => row.status === "selector_witness_pass").length,
    blocked: result.filter((row) => row.status === "selector_witness_blocked").length }));
  await db.query("rollback");
} catch (error) {
  await db.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await db.end();
}
