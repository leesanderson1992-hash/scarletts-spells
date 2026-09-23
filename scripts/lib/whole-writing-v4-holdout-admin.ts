import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { CONTEXT_V4_DEVELOPMENT_CANDIDATES } from "../../lib/writing-engine/whole-writing/context-candidates-v4";
import type { ContextFamilyKey } from "../../lib/writing-engine/whole-writing/context";
import {
  ordinaryEvaluationFingerprint,
  type OrdinaryWritingV3Case,
  type OrdinaryWritingV3Gold,
} from "./whole-writing-v3-ordinary-evaluation";

export const HOLDOUT_V4_ADMIN_VERSION = "S8_V4_HOLDOUT_ADMIN_V2_SINGLE_AUTHOR_2026_09_23";
export const HOLDOUT_V4_PROTECTED = ["fragment", "quotation", "gerund", "run_on", "task_dependent"] as const;
export const HOLDOUT_V4_FAMILIES = CONTEXT_V4_DEVELOPMENT_CANDIDATES.map((row) => row.manifest.familyKey);
export type ProtectedTag = typeof HOLDOUT_V4_PROTECTED[number];
export type Classification = "VALID" | "INVALID" | "UNCERTAIN";
export type UncertainReason = "GENUINE_SEMANTIC_AMBIGUITY" | "UNSUPPORTED_CONSTRUCTION_OR_MEANING" | "OTHER_UNCERTAIN";
export type SourceRow = Readonly<{
  writingSnapshotId: string;
  sourceReference: string;
  sourceText: string;
  authorId: string;
  authoredBy: string;
  consentReference: string;
  stage: "A" | "B";
}>;
export type InventoryRow = Readonly<{
  schemaVersion: 1;
  passageId: string;
  caseId: string;
  writingSnapshotId: string;
  sourceReference: string;
  sourceText: string;
  sourceFingerprint: string;
  authorId: string;
  authoredBy: string;
  consentReference: string;
  stage: "A" | "B";
  family: ContextFamilyKey;
  focusSurface: string;
  startUtf16: number;
  endUtf16: number;
  inventoryFingerprint: string;
}>;
export type SelectionRow = Readonly<{
  caseId: string;
  primaryFocus: boolean;
  selectedBy: string;
  selectionMethod: string;
  selectionFingerprint: string;
}>;
export type DecisionRow = Readonly<{
  caseId: string;
  decisionId: string;
  reviewerId: string;
  reviewerKind: "HUMAN" | "AI";
  classification: Classification;
  uncertainReason: UncertainReason | null;
  intendedAlternative: string | null;
  supportedConstruction: boolean;
  declaredConstruction: string;
  declaredSubtype: string;
  protectedSetTags: readonly ProtectedTag[];
  decisionFingerprint: string;
}>;
export type AdjudicationRow = Readonly<{
  caseId: string;
  adjudicationId: string;
  adjudicatorId: string;
  classification: Classification;
  uncertainReason: UncertainReason | null;
  intendedAlternative: string | null;
  supportedConstruction: boolean;
  declaredConstruction: string;
  declaredSubtype: string;
  protectedSetTags: readonly ProtectedTag[];
  adjudicationFingerprint: string;
}>;
export type SimilarityFlag = Readonly<{
  passageId: string;
  referenceId: string;
  kind: "EXACT_PASSAGE" | "EXACT_SENTENCE" | "NEAR_SENTENCE" | "FUNCTION_SHELL";
  score: number;
}>;
export type SimilarityResolution = Readonly<{
  passageId: string;
  referenceId: string;
  kind: SimilarityFlag["kind"];
  resolution: "INDEPENDENT_CONFIRMED" | "EXCLUDE";
  resolvedBy: string;
  reason: string;
  resolutionFingerprint: string;
}>;

export function bytesSha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function requiredString(value: unknown, field: string): string {
  assert(typeof value === "string" && value.trim().length > 0, `${field} must be a non-empty string`);
  return value;
}

export function validateSourceRows(rows: readonly SourceRow[]): void {
  assert(rows.length > 0, "Source intake is empty");
  const references = new Set<string>();
  for (const [index, row] of rows.entries()) {
    requiredString(row.writingSnapshotId, `source[${index}].writingSnapshotId`);
    requiredString(row.sourceReference, `source[${index}].sourceReference`);
    requiredString(row.sourceText, `source[${index}].sourceText`);
    requiredString(row.authorId, `source[${index}].authorId`);
    requiredString(row.authoredBy, `source[${index}].authoredBy`);
    requiredString(row.consentReference, `source[${index}].consentReference`);
    assert(row.stage === "A" || row.stage === "B", `source[${index}].stage must be A or B`);
    assert(!references.has(row.sourceReference), `Duplicate source reference: ${row.sourceReference}`);
    references.add(row.sourceReference);
    assert(row.sourceText.length <= 20_000, `Source text exceeds bounded intake size: ${row.sourceReference}`);
  }
}

const FORM_TO_FAMILY: Readonly<Record<string, ContextFamilyKey>> = {
  there: "THERE_THEIR_THEYRE", their: "THERE_THEIR_THEYRE", "they're": "THERE_THEIR_THEYRE",
  to: "TO_TOO_TWO", too: "TO_TOO_TWO", two: "TO_TOO_TWO",
  your: "YOUR_YOURE", "you're": "YOUR_YOURE",
  its: "ITS_ITS", "it's": "ITS_ITS",
};
// The regex index is a JavaScript UTF-16 offset. The explicit Unicode boundaries
// avoid treating a family spelling embedded in another word as an occurrence.
const OCCURRENCE = /(?<![\p{L}\p{N}_])(?:they['’ʼ]re|you['’ʼ]re|it['’ʼ]s|there|their|your|too|two|to|its)(?![\p{L}\p{N}_])/giu;

export function inventorySources(rows: readonly SourceRow[]): InventoryRow[] {
  validateSourceRows(rows);
  const passages = new Set<string>();
  const output: InventoryRow[] = [];
  for (const row of rows) {
    const passageId = `v4h-${bytesSha256(`${row.writingSnapshotId}\0${row.sourceReference}\0${row.sourceText}`).slice(0, 24)}`;
    assert(!passages.has(passageId), `Passage ID collision or duplicate source: ${passageId}`);
    passages.add(passageId);
    const sourceFingerprint = bytesSha256(row.sourceText);
    for (const match of row.sourceText.matchAll(OCCURRENCE)) {
      const focusSurface = match[0];
      const startUtf16 = match.index;
      const endUtf16 = startUtf16 + focusSurface.length;
      const form = focusSurface.toLowerCase().replace(/[’ʼ]/g, "'");
      const family = FORM_TO_FAMILY[form];
      assert(family, `Unmapped governed surface: ${focusSurface}`);
      assert.equal(row.sourceText.slice(startUtf16, endUtf16), focusSurface);
      const core = {
        schemaVersion: 1 as const, passageId,
        caseId: `${passageId}-${family.toLowerCase()}-${startUtf16}-${endUtf16}`,
        writingSnapshotId: row.writingSnapshotId, sourceReference: row.sourceReference,
        sourceText: row.sourceText, sourceFingerprint, authorId: row.authorId,
        authoredBy: row.authoredBy, consentReference: row.consentReference,
        stage: row.stage, family, focusSurface, startUtf16, endUtf16,
      };
      output.push({ ...core, inventoryFingerprint: ordinaryEvaluationFingerprint(core) });
    }
  }
  return output.sort((a, b) => a.caseId.localeCompare(b.caseId));
}

export function verifyInventory(rows: readonly InventoryRow[]): void {
  const ids = new Set<string>();
  const passageByReference = new Map<string, string>();
  const authorBySnapshot = new Map<string, string>();
  for (const row of rows) {
    assert(!ids.has(row.caseId), `Duplicate case ID: ${row.caseId}`);
    ids.add(row.caseId);
    assert.equal(row.sourceText.slice(row.startUtf16, row.endUtf16), row.focusSurface, `Span mismatch: ${row.caseId}`);
    assert.equal(row.passageId, `v4h-${bytesSha256(`${row.writingSnapshotId}\0${row.sourceReference}\0${row.sourceText}`).slice(0, 24)}`, `Passage identity mismatch: ${row.caseId}`);
    assert.equal(row.caseId, `${row.passageId}-${row.family.toLowerCase()}-${row.startUtf16}-${row.endUtf16}`, `Occurrence identity mismatch: ${row.caseId}`);
    assert.equal(bytesSha256(row.sourceText), row.sourceFingerprint, `Source fingerprint mismatch: ${row.caseId}`);
    const { inventoryFingerprint, ...core } = row;
    assert.equal(ordinaryEvaluationFingerprint(core), inventoryFingerprint, `Inventory fingerprint mismatch: ${row.caseId}`);
    const normalized = row.focusSurface.toLowerCase().replace(/[’ʼ]/g, "'");
    assert.equal(FORM_TO_FAMILY[normalized], row.family, `Family mismatch: ${row.caseId}`);
    const knownPassage = passageByReference.get(row.sourceReference);
    assert(!knownPassage || knownPassage === row.passageId, `Source reference reused for another passage: ${row.sourceReference}`);
    passageByReference.set(row.sourceReference, row.passageId);
    const knownAuthor = authorBySnapshot.get(row.writingSnapshotId);
    assert(!knownAuthor || knownAuthor === row.authorId, `Snapshot has conflicting authors: ${row.writingSnapshotId}`);
    authorBySnapshot.set(row.writingSnapshotId, row.authorId);
  }
}

/** The approved qualification source is one identified learner across all waves and families. */
export function verifySingleAuthorScope(rows: readonly Pick<InventoryRow, "authorId">[]): string {
  assert(rows.length > 0, "Single-author scope requires source occurrences");
  const authors = new Set(rows.map((row) => row.authorId));
  assert.equal(authors.size, 1, "Single-author holdout cannot mix source authors");
  return rows[0]!.authorId;
}

export function sealSelection(core: Omit<SelectionRow, "selectionFingerprint">): SelectionRow {
  return { ...core, selectionFingerprint: ordinaryEvaluationFingerprint(core) };
}
export function sealDecision(core: Omit<DecisionRow, "decisionFingerprint">): DecisionRow {
  return { ...core, decisionFingerprint: ordinaryEvaluationFingerprint(core) };
}
export function sealAdjudication(core: Omit<AdjudicationRow, "adjudicationFingerprint">): AdjudicationRow {
  return { ...core, adjudicationFingerprint: ordinaryEvaluationFingerprint(core) };
}

function verifyFingerprint<T extends object>(row: T, key: keyof T, name: string): void {
  const { [key]: actual, ...core } = row;
  assert.equal(actual, ordinaryEvaluationFingerprint(core), `${name} fingerprint mismatch`);
}

export function validateSelections(inventory: readonly InventoryRow[], selections: readonly SelectionRow[]): Map<string, SelectionRow> {
  const byCase = new Map<string, SelectionRow>();
  const primaryBySnapshotFamily = new Set<string>();
  for (const row of selections) {
    verifyFingerprint(row, "selectionFingerprint", `Selection ${row.caseId}`);
    assert(!byCase.has(row.caseId), `Duplicate selection: ${row.caseId}`);
    requiredString(row.selectedBy, "selectedBy");
    requiredString(row.selectionMethod, "selectionMethod");
    byCase.set(row.caseId, row);
  }
  for (const row of inventory) {
    const selection = byCase.get(row.caseId);
    assert(selection, `Missing selection: ${row.caseId}`);
    if (selection.primaryFocus) {
      const key = `${row.writingSnapshotId}\0${row.family}`;
      assert(!primaryBySnapshotFamily.has(key), `More than one primary for snapshot and family: ${key}`);
      primaryBySnapshotFamily.add(key);
    }
  }
  assert.equal(byCase.size, inventory.length, "Selection contains unknown cases");
  return byCase;
}

export function reviewPackets(inventory: readonly InventoryRow[], selections: readonly SelectionRow[]) {
  verifyInventory(inventory);
  const selected = validateSelections(inventory, selections);
  // Both packets are deliberately identical and contain no human/AI decisions.
  return inventory.map((row) => ({
    caseId: row.caseId, passageId: row.passageId, writingSnapshotId: row.writingSnapshotId,
    family: row.family, sourceText: row.sourceText, focusSurface: row.focusSurface,
    startUtf16: row.startUtf16, endUtf16: row.endUtf16,
    primaryFocus: selected.get(row.caseId)!.primaryFocus,
    sourceReference: row.sourceReference, authorId: row.authorId,
  }));
}

export function lockGold(args: {
  inventory: readonly InventoryRow[];
  selections: readonly SelectionRow[];
  primary: readonly DecisionRow[];
  review: readonly DecisionRow[];
  adjudications: readonly AdjudicationRow[];
}) {
  verifyInventory(args.inventory);
  const selected = validateSelections(args.inventory, args.selections);
  const primary = indexedDecisions(args.primary, "HUMAN", args.inventory.length);
  const review = indexedDecisions(args.review, "AI", args.inventory.length);
  const adjudications = new Map<string, AdjudicationRow>();
  const adjudicationIds = new Set<string>();
  for (const row of args.adjudications) {
    verifyFingerprint(row, "adjudicationFingerprint", `Adjudication ${row.caseId}`);
    requiredString(row.adjudicatorId, "adjudicatorId");
    requiredString(row.adjudicationId, "adjudicationId");
    assert(!adjudications.has(row.caseId), `Duplicate adjudication: ${row.caseId}`);
    assert(!adjudicationIds.has(row.adjudicationId), `Duplicate adjudication ID: ${row.adjudicationId}`);
    adjudications.set(row.caseId, row);
    adjudicationIds.add(row.adjudicationId);
  }
  const candidates: OrdinaryWritingV3Case[] = [];
  const gold: OrdinaryWritingV3Gold[] = [];
  const adjudicatedCaseIds: string[] = [];
  for (const row of args.inventory) {
    const human = primary.get(row.caseId);
    const nonGold = review.get(row.caseId);
    assert(human && nonGold, `Incomplete review: ${row.caseId}`);
    validateGovernedDecision(row, human);
    validateGovernedDecision(row, nonGold);
    const disagreement = decisionSignature(human) !== decisionSignature(nonGold);
    const adjudication = adjudications.get(row.caseId);
    assert(!disagreement || adjudication, `Unadjudicated substantive disagreement: ${row.caseId}`);
    assert(disagreement || !adjudication, `Unneeded adjudication: ${row.caseId}`);
    if (adjudication) {
      assert.notEqual(adjudication.adjudicatorId, human.reviewerId, `Primary human cannot self-adjudicate: ${row.caseId}`);
      adjudicatedCaseIds.push(row.caseId);
    }
    const finalDecision = adjudication ?? human;
    validateGovernedDecision(row, finalDecision);
    const candidateCore = {
      schemaVersion: 1 as const, passageId: row.passageId, caseId: row.caseId, family: row.family,
      sourceText: row.sourceText, focusSurface: row.focusSurface,
      startUtf16: row.startUtf16, endUtf16: row.endUtf16,
      declaredConstruction: finalDecision.declaredConstruction,
      declaredSubtype: finalDecision.declaredSubtype,
      primaryFocus: selected.get(row.caseId)!.primaryFocus,
      protectedSetTags: [...finalDecision.protectedSetTags],
      sourceReference: row.sourceReference, authoredBy: row.authoredBy,
    };
    candidates.push({ ...candidateCore, candidateFingerprint: ordinaryEvaluationFingerprint(candidateCore) });
    const goldCore = {
      schemaVersion: 1 as const, caseId: row.caseId, family: row.family,
      classification: finalDecision.classification,
      intendedAlternative: finalDecision.intendedAlternative,
      supportedConstruction: finalDecision.supportedConstruction,
      primaryLabelId: human.decisionId, nonGoldReviewId: nonGold.decisionId,
      adjudicationId: adjudication?.adjudicationId ?? null,
    };
    gold.push({ ...goldCore, goldFingerprint: ordinaryEvaluationFingerprint(goldCore) });
  }
  assert.equal(primary.size, args.inventory.length, "Primary labels contain unknown cases");
  assert.equal(review.size, args.inventory.length, "Non-gold review contains unknown cases");
  assert.equal(adjudications.size, adjudicatedCaseIds.length, "Adjudication contains unknown cases");
  return { candidates, gold, adjudicatedCaseIds: adjudicatedCaseIds.sort() };
}

function indexedDecisions(rows: readonly DecisionRow[], kind: DecisionRow["reviewerKind"], expected: number): Map<string, DecisionRow> {
  const indexed = new Map<string, DecisionRow>();
  const ids = new Set<string>();
  for (const row of rows) {
    assert.equal(row.reviewerKind, kind, `${row.caseId}: expected ${kind} review`);
    verifyFingerprint(row, "decisionFingerprint", `${kind} ${row.caseId}`);
    requiredString(row.reviewerId, "reviewerId");
    requiredString(row.decisionId, "decisionId");
    assert(!indexed.has(row.caseId), `Duplicate ${kind} case: ${row.caseId}`);
    assert(!ids.has(row.decisionId), `Duplicate ${kind} decision ID: ${row.decisionId}`);
    indexed.set(row.caseId, row);
    ids.add(row.decisionId);
  }
  assert.equal(indexed.size, expected, `Incomplete ${kind} decision set`);
  return indexed;
}

function decisionSignature(row: DecisionRow): string {
  return ordinaryEvaluationFingerprint({
    classification: row.classification, uncertainReason: row.uncertainReason, intendedAlternative: row.intendedAlternative,
    supportedConstruction: row.supportedConstruction, declaredConstruction: row.declaredConstruction,
    declaredSubtype: row.declaredSubtype, protectedSetTags: [...row.protectedSetTags].sort(),
  });
}

function validateGovernedDecision(row: InventoryRow, decision: DecisionRow | AdjudicationRow): void {
  const manifest = CONTEXT_V4_DEVELOPMENT_CANDIDATES.find((candidate) => candidate.manifest.familyKey === row.family)!.manifest;
  assert(["VALID", "INVALID", "UNCERTAIN"].includes(decision.classification), `Invalid classification: ${row.caseId}`);
  if (decision.classification === "UNCERTAIN") {
    assert(["GENUINE_SEMANTIC_AMBIGUITY", "UNSUPPORTED_CONSTRUCTION_OR_MEANING", "OTHER_UNCERTAIN"].includes(decision.uncertainReason ?? ""), `UNCERTAIN needs a governed reason: ${row.caseId}`);
  } else assert.equal(decision.uncertainReason, null, `Non-UNCERTAIN reason must be null: ${row.caseId}`);
  assert.equal(new Set(decision.protectedSetTags).size, decision.protectedSetTags.length, `Repeated protection tag: ${row.caseId}`);
  for (const tag of decision.protectedSetTags) assert(HOLDOUT_V4_PROTECTED.includes(tag), `Unknown protection tag: ${row.caseId}`);
  if (decision.classification === "INVALID") {
    assert(decision.intendedAlternative !== null, `Missing intended alternative: ${row.caseId}`);
    assert(manifest.members.includes(decision.intendedAlternative.toLowerCase().replace(/[’ʼ]/g, "'") as never), `Alternative outside family: ${row.caseId}`);
    assert.notEqual(decision.intendedAlternative.toLowerCase(), row.focusSurface.toLowerCase().replace(/[’ʼ]/g, "'"), `Alternative equals observed: ${row.caseId}`);
  } else assert.equal(decision.intendedAlternative, null, `Non-INVALID alternative must be null: ${row.caseId}`);
  if (decision.supportedConstruction) {
    assert(manifest.supportedConstructions.includes(decision.declaredConstruction as never), `Unsupported construction: ${row.caseId}`);
    assert(manifest.supportedSubtypes.includes(decision.declaredSubtype as never), `Unsupported subtype: ${row.caseId}`);
    assert(subtypeBelongsToConstruction(row.family, decision.declaredConstruction, decision.declaredSubtype), `Subtype/construction mismatch: ${row.caseId}`);
  } else {
    assert.equal(decision.declaredConstruction, "not_applicable", `Unsupported construction must be not_applicable: ${row.caseId}`);
    assert.equal(decision.declaredSubtype, "not_applicable", `Unsupported subtype must be not_applicable: ${row.caseId}`);
  }
}

const SUBTYPE_CONSTRUCTION: Readonly<Record<ContextFamilyKey, Readonly<Record<string, string>>>> = {
  THERE_THEIR_THEYRE: {
    embedded_existential: "existential", adverbial_locative: "locative", possessive_subject_or_object: "possessive",
    progressive_contraction: "they_are_contraction", adjectival_contraction: "they_are_contraction", passive_contraction: "they_are_contraction",
  },
  TO_TOO_TWO: {
    destination_or_recipient_preposition: "preposition", governed_infinitive: "infinitive", clause_additive: "additive",
    adjective_or_manner_degree: "degree", ordinary_count_numeral: "numeral",
  },
  YOUR_YOURE: {
    possessive_subject_or_object: "possessive", progressive_contraction: "you_are_contraction",
    adjectival_contraction: "you_are_contraction", passive_or_conventional_contraction: "you_are_contraction",
  },
  ITS_ITS: {
    possessive_subject_or_object: "possessive", progressive_contraction: "it_is_contraction",
    adjectival_contraction: "it_is_contraction", passive_contraction: "it_is_contraction", perfect_contraction: "it_has_contraction",
  },
};

// These source-side strata are stronger than the generic 30/20 manifest minima
// where a family has several governed contraction subtypes. They use human gold,
// never analyser predictions, and sum to 150 VALID and 150 supported INVALID.
export const HOLDOUT_V4_PRIMARY_STRATA: Readonly<Record<ContextFamilyKey, Readonly<Record<string, number>>>> = {
  THERE_THEIR_THEYRE: {
    embedded_existential: 30, adverbial_locative: 30, possessive_subject_or_object: 30,
    progressive_contraction: 20, adjectival_contraction: 20, passive_contraction: 20,
  },
  TO_TOO_TWO: {
    destination_or_recipient_preposition: 30, governed_infinitive: 30, clause_additive: 30,
    adjective_or_manner_degree: 30, ordinary_count_numeral: 30,
  },
  YOUR_YOURE: {
    possessive_subject_or_object: 60, progressive_contraction: 30,
    adjectival_contraction: 30, passive_or_conventional_contraction: 30,
  },
  ITS_ITS: {
    possessive_subject_or_object: 60, progressive_contraction: 20,
    adjectival_contraction: 20, passive_contraction: 20, perfect_contraction: 30,
  },
};

for (const { manifest } of CONTEXT_V4_DEVELOPMENT_CANDIDATES) {
  assert.deepEqual(Object.keys(HOLDOUT_V4_PRIMARY_STRATA[manifest.familyKey]).sort(), [...manifest.supportedSubtypes].sort(), `Holdout strata drifted from frozen manifest: ${manifest.familyKey}`);
  assert.deepEqual(Object.keys(SUBTYPE_CONSTRUCTION[manifest.familyKey]).sort(), [...manifest.supportedSubtypes].sort(), `Subtype mapping drifted from frozen manifest: ${manifest.familyKey}`);
  assert.equal(Object.values(HOLDOUT_V4_PRIMARY_STRATA[manifest.familyKey]).reduce((sum, count) => sum + count, 0), 150, `Strata must sum to 150 per class: ${manifest.familyKey}`);
}

export function subtypeBelongsToConstruction(family: ContextFamilyKey, construction: string, subtype: string): boolean {
  return SUBTYPE_CONSTRUCTION[family][subtype] === construction;
}

export function coverageLedger(candidates: readonly OrdinaryWritingV3Case[], gold: readonly OrdinaryWritingV3Gold[]) {
  const byGold = new Map(gold.map((row) => [row.caseId, row]));
  return CONTEXT_V4_DEVELOPMENT_CANDIDATES.map(({ manifest }) => {
    const rows = candidates.filter((row) => row.family === manifest.familyKey);
    const primary = rows.filter((row) => row.primaryFocus);
    const counts = { VALID: 0, INVALID: 0, UNCERTAIN: 0 };
    for (const row of primary) counts[byGold.get(row.caseId)!.classification] += 1;
    const construction = Object.fromEntries(manifest.supportedConstructions.map((name) => [name, {
      VALID: primary.filter((row) => row.declaredConstruction === name && byGold.get(row.caseId)?.classification === "VALID").length,
      INVALID: primary.filter((row) => row.declaredConstruction === name && byGold.get(row.caseId)?.classification === "INVALID" && byGold.get(row.caseId)?.supportedConstruction).length,
    }]));
    const subtype = Object.fromEntries(manifest.supportedSubtypes.map((name) => [name, {
      VALID: primary.filter((row) => row.declaredSubtype === name && byGold.get(row.caseId)?.classification === "VALID").length,
      INVALID: primary.filter((row) => row.declaredSubtype === name && byGold.get(row.caseId)?.classification === "INVALID" && byGold.get(row.caseId)?.supportedConstruction).length,
    }]));
    const protectedCounts = Object.fromEntries(HOLDOUT_V4_PROTECTED.map((tag) => [tag, rows.filter((row) => row.protectedSetTags.includes(tag)).length]));
    const distinctProtected = rows.filter((row) => row.protectedSetTags.length > 0).length;
    const issues: string[] = [];
    if (primary.length < 400) issues.push(`PRIMARY:${primary.length}/400`);
    if (counts.VALID < 150) issues.push(`VALID:${counts.VALID}/150`);
    if (counts.INVALID < 150) issues.push(`INVALID:${counts.INVALID}/150`);
    if (counts.UNCERTAIN < 100) issues.push(`UNCERTAIN:${counts.UNCERTAIN}/100`);
    for (const [name, row] of Object.entries(construction)) {
      if (row.VALID < 30 || row.INVALID < 30) issues.push(`CONSTRUCTION:${name}:${row.VALID}/30:${row.INVALID}/30`);
    }
    for (const [name, row] of Object.entries(subtype)) {
      if (row.VALID < 20 || row.INVALID < 20) issues.push(`SUBTYPE:${name}:${row.VALID}/20:${row.INVALID}/20`);
    }
    for (const [name, minimum] of Object.entries(HOLDOUT_V4_PRIMARY_STRATA[manifest.familyKey])) {
      const count = subtype[name]!;
      if (count.VALID < minimum || count.INVALID < minimum) issues.push(`STRATUM:${name}:${count.VALID}/${minimum}:${count.INVALID}/${minimum}`);
    }
    for (const [tag, count] of Object.entries(protectedCounts)) if (count < 10) issues.push(`PROTECTED:${tag}:${count}/10`);
    if (distinctProtected < 50) issues.push(`DISTINCT_PROTECTED:${distinctProtected}/50`);
    return { family: manifest.familyKey, totalOccurrences: rows.length, totalPrimary: primary.length, counts, construction, subtype, protectedCounts, distinctProtected, issues };
  });
}

const FUNCTION_WORDS = new Set("a an the and or but if when while because although as at by for from in into of on onto over under with without is are was were be been being am has have had do did does not no to too two there their they're your you're its it's it they you he she we I this that these those my our his her then than before after about through up down out so very".toLowerCase().split(" "));
function normalized(text: string): string {
  return text.normalize("NFC").toLowerCase().replace(/[’ʼ]/g, "'").replace(/\s+/g, " ").trim();
}
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/u).map(normalized).filter((value) => value.length >= 20);
}
function tokens(text: string): string[] {
  return normalized(text).match(/[\p{L}\p{N}']+/gu) ?? [];
}
function shingles(words: readonly string[], size: number): Set<string> {
  const output = new Set<string>();
  for (let index = 0; index + size <= words.length; index += 1) output.add(words.slice(index, index + size).join(" "));
  return output;
}
function jaccard(a: Set<string>, b: Set<string>): number {
  const intersection = [...a].filter((value) => b.has(value)).length;
  return a.size + b.size - intersection ? intersection / (a.size + b.size - intersection) : 0;
}
function functionShell(text: string): string[] {
  return tokens(text).map((word) => FUNCTION_WORDS.has(word) ? word : "*");
}

export function similarityFlags(inventory: readonly InventoryRow[], references: readonly { id: string; text: string }[]): SimilarityFlag[] {
  const passages = new Map(inventory.map((row) => [row.passageId, row.sourceText]));
  const referencePassages = references.map((row) => ({ id: row.id, normalizedText: normalized(row.text) }));
  const referenceIndex = references.flatMap((row) => sentences(row.text).map((sentence) => {
    const words = tokens(sentence);
    return { id: row.id, sentence, words, lexical: shingles(words, 5), shell: shingles(functionShell(sentence), 4) };
  }));
  const flags = new Map<string, SimilarityFlag>();
  for (const [passageId, text] of passages) {
    const normalizedText = normalized(text);
    for (const reference of referencePassages) {
      if (reference.id === `holdout:${passageId}`) continue;
      if (normalizedText === reference.normalizedText) {
        const key = `${passageId}\0${reference.id}\0EXACT_PASSAGE`;
        flags.set(key, { passageId, referenceId: reference.id, kind: "EXACT_PASSAGE", score: 1 });
      }
    }
    for (const sentence of sentences(text)) {
      const words = tokens(sentence);
      if (words.length < 8) continue;
      const lexicalShingles = shingles(words, 5);
      const shellShingles = shingles(functionShell(sentence), 4);
      for (const reference of referenceIndex) {
        if (reference.id === `holdout:${passageId}`) continue;
        if (reference.words.length < 8) continue;
        let kind: SimilarityFlag["kind"] | null = null;
        let score = 0;
        if (sentence === reference.sentence) { kind = "EXACT_SENTENCE"; score = 1; }
        else {
          const lexical = jaccard(lexicalShingles, reference.lexical);
          const shell = jaccard(shellShingles, reference.shell);
          if (lexical >= 0.5) { kind = "NEAR_SENTENCE"; score = lexical; }
          else if (shell >= 0.8) { kind = "FUNCTION_SHELL"; score = shell; }
        }
        if (kind) {
          const key = `${passageId}\0${reference.id}\0${kind}`;
          const previous = flags.get(key);
          if (!previous || previous.score < score) flags.set(key, { passageId, referenceId: reference.id, kind, score });
        }
      }
    }
  }
  return [...flags.values()].sort((a, b) => a.passageId.localeCompare(b.passageId) || a.referenceId.localeCompare(b.referenceId) || a.kind.localeCompare(b.kind));
}

export function sealSimilarityResolution(core: Omit<SimilarityResolution, "resolutionFingerprint">): SimilarityResolution {
  return { ...core, resolutionFingerprint: ordinaryEvaluationFingerprint(core) };
}

export function resolvedPassages(flags: readonly SimilarityFlag[], resolutions: readonly SimilarityResolution[]): Set<string> {
  const identity = (row: Pick<SimilarityFlag, "passageId" | "referenceId" | "kind">) => `${row.passageId}\0${row.referenceId}\0${row.kind}`;
  const expected = new Set(flags.map(identity));
  const seen = new Set<string>();
  const excluded = new Set<string>();
  for (const row of resolutions) {
    verifyFingerprint(row, "resolutionFingerprint", `Similarity resolution ${row.passageId}`);
    const key = identity(row);
    assert(expected.has(key), `Stale or unknown similarity resolution: ${key}`);
    assert(!seen.has(key), `Duplicate similarity resolution: ${key}`);
    assert(row.resolution === "INDEPENDENT_CONFIRMED" || row.resolution === "EXCLUDE", `Invalid similarity resolution: ${key}`);
    requiredString(row.resolvedBy, "resolvedBy");
    requiredString(row.reason, "reason");
    if (row.resolution === "EXCLUDE") excluded.add(row.passageId);
    seen.add(key);
  }
  assert.equal(seen.size, expected.size, `Unresolved similarity flags: ${expected.size - seen.size}`);
  return excluded;
}
