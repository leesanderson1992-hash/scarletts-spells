#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-explicit-any -- legacy v1 release JSON is deliberately runtime-projected into the immutable v2 source artifact. */
/* Builds immutable, key-addressed source artifacts for the Base+Prefix and
 * Base+Suffix family-v2 publication.  Database IDs are resolved only by the
 * guarded publisher immediately before the serializable transaction. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = resolve(ROOT, "data/adle/approved/d4-mor/v2/base-word-prefix-suffix-family-source-v1.json");
const RELEASE = resolve(ROOT, "docs/implementation/seed-data/teaching-dictionary/releases/2026-08-11-base-word-prefix-suffix-family-v2");
const OLD = resolve(ROOT, "docs/implementation/seed-data/teaching-dictionary/releases/2026-08-09-base-word-family-meanings-v1/authorities");
const PREFIX = "D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX";
const SUFFIX = "D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX";
const REUSED: Record<string, readonly string[]> = {
  [PREFIX]: ["like_base_family", "play_base_family", "tie_base_family", "write_base_family"],
  [SUFFIX]: ["care_base_family", "govern_base_family", "kind_base_family"],
};
type Part = { id: string; kind: "base" | "prefix" | "suffix"; morphemeKey: null; sourceText: string; surfaceText: string; gloss: string; displayRange: { start: number; end: number } };
type Member = { wordKey: string; wordSum: string; childFriendlyMeaning: string; structuralRole: "base" | "family_member"; assignmentEligible: boolean; morphologyParts: Part[]; morphologyJoins: unknown[]; morphologyTransformations: unknown[]; transformationNotes: string };
type Family = { familyId: string; baseFamilyKey: string; baseWordKey: string; baseMeaning: string; etymologyRoute: unknown; members: Member[]; sourceFamily: "existing_release" | "new_release" };
function canonical(value: unknown): string { if (value === null || value === undefined) return "null"; if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; return `{${Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`; }
function sha(value: unknown): string { return createHash("sha256").update(canonical(value)).digest("hex"); }
function stableId(kind: string, key: string): string { const hash = createHash("sha1").update(`scarletts-spells:base-word-v2:${kind}:${key}`).digest("hex"); return `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`; }
function parts(sum: string): Part[] { const source = sum.split("→")[0].trim().split("+").map(value => value.trim()); let offset = 0; return source.map((text, index) => { const start = offset; offset += text.length; return { id: `part_${index + 1}`, kind: index === 0 && !["im","mis","pre","re","un"].includes(text) ? "base" : (["im","mis","pre","re","un"].includes(text) ? "prefix" : "suffix"), morphemeKey: null, sourceText: text, surfaceText: text, gloss: "", displayRange: { start, end: offset } }; }); }
function genericRoute(baseWord: string, baseMeaning: string) { return { relation_type: "free_base", origin_language: "English", origin_form: baseWord, literal_meaning: baseMeaning, child_facing_meaning: baseMeaning, semantic_connection: "The visible base is retained in each reviewed family member.", evidence: { source_name: "Katie Sanderson approved Base Word workbook", source_url: "local:base-word-prefix-suffix-readiness-audit-resolved (1).xlsx", verification_status: "linked_for_human_review" } }; }
async function oldFamilies() { const entries = await Promise.all(["identify-base.json", "preserve-base.json"].map(async f => JSON.parse(await readFile(resolve(OLD, f), "utf8")))); return entries.flatMap((entry: any) => entry.families ?? []) as any[]; }
async function main() {
  const source = JSON.parse(await readFile(SOURCE, "utf8"));
  const old = await oldFamilies(); const extensions = new Map(source.existingFamilyExtensions.map((x: any) => [x.baseFamilyKey, x]));
  const all: Record<string, Family[]> = { [PREFIX]: [], [SUFFIX]: [] };
  for (const skill of [PREFIX, SUFFIX]) for (const key of REUSED[skill]) {
    const row = old.find((f: any) => f.baseFamilyKey === key) as any;
    if (!row) throw new Error(`Missing reviewed reused family ${key}.`);
    const members: Member[] = row.members.map((m: any) => ({ wordKey: m.wordKey, wordSum: m.wordSum, childFriendlyMeaning: m.childFriendlyMeaning, structuralRole: m.memberRole === "base" ? "base" : "family_member", assignmentEligible: m.assignmentEligible, morphologyParts: m.morphologyParts, morphologyJoins: m.morphologyJoins, morphologyTransformations: m.morphologyTransformations, transformationNotes: m.transformationNotes ?? "" }));
    const extra = extensions.get(key) as any;
    if (extra) members.push({ wordKey: `${extra.word}_en_gb`, wordSum: extra.wordSum, childFriendlyMeaning: extra.meaning, structuralRole: "family_member", assignmentEligible: true, morphologyParts: parts(extra.wordSum), morphologyJoins: [], morphologyTransformations: [], transformationNotes: "" });
    all[skill].push({ familyId: row.familyId, baseFamilyKey: row.baseFamilyKey, baseWordKey: row.baseWordKey, baseMeaning: row.baseMeaning, etymologyRoute: row.etymologyRoute, members, sourceFamily: "existing_release" });
  }
  for (const sourceFamily of source.families as any[]) {
    const members: Member[] = sourceFamily.members.map((m: any) => ({ wordKey: `${m.word}_en_gb`, wordSum: m.wordSum, childFriendlyMeaning: m.meaning, structuralRole: m.word === sourceFamily.baseWord ? "base" : "family_member", assignmentEligible: true, morphologyParts: parts(m.wordSum), morphologyJoins: [], morphologyTransformations: [], transformationNotes: "" }));
    all[sourceFamily.microSkillKey].push({ familyId: stableId("family", sourceFamily.baseFamilyKey), baseFamilyKey: sourceFamily.baseFamilyKey, baseWordKey: `${sourceFamily.baseWord}_en_gb`, baseMeaning: sourceFamily.baseMeaning, etymologyRoute: genericRoute(sourceFamily.baseWord, sourceFamily.baseMeaning), members, sourceFamily: "new_release" });
  }
  for (const skill of [PREFIX, SUFFIX]) {
    const seen = new Set<string>();
    for (const family of all[skill]) { if (seen.has(family.baseFamilyKey)) throw new Error(`Duplicate ${skill} family ${family.baseFamilyKey}`); seen.add(family.baseFamilyKey); if (family.members.filter(m => m.structuralRole === "base").length !== 1) throw new Error(`Family ${family.baseFamilyKey} needs one base.`); if (family.members.length < 3) throw new Error(`Family ${family.baseFamilyKey} cannot supply the two-family practice model.`); }
  }
  const sourceProjection = { schemaVersion: 1, sourceFile: "data/adle/approved/d4-mor/v2/base-word-prefix-suffix-family-source-v1.json", approval: source.approval, reusedRelease: "adle_base_word_family_meanings_v1_2026_08_09", families: all };
  const sourceProjectionSha256 = sha(sourceProjection);
  const manifestFingerprint = { schemaVersion: 1, releaseId: "adle_base_word_prefix_suffix_family_v2_2026_08_11", packageType: "base_word_family_batch_v1", packageSchemaVersion: "v2", approvedSourceSha256: source.approval.sourceSha256, sourceProjectionSha256, familyCounts: Object.fromEntries(Object.entries(all).map(([skill, families]) => [skill, families.length])), memberCounts: Object.fromEntries(Object.entries(all).map(([skill, families]) => [skill, families.reduce((n, f) => n + f.members.length, 0)])), productionDark: true };
  await mkdir(RELEASE, { recursive: true });
  await writeFile(resolve(RELEASE, "family-v2-source-projection.json"), `${JSON.stringify(sourceProjection, null, 2)}\n`);
  await writeFile(resolve(RELEASE, "manifest.json"), `${JSON.stringify({ ...manifestFingerprint, packageSha256: sha(manifestFingerprint) }, null, 2)}\n`);
  console.log(JSON.stringify({ releaseDir: RELEASE, sourceProjectionSha256, packageSha256: sha(manifestFingerprint), counts: Object.fromEntries(Object.entries(all).map(([skill, families]) => [skill, { families: families.length, members: families.reduce((n, f) => n + f.members.length, 0) }])) }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
