/**
 * ADLE Slice 5 (5F): micro-skill proficiency regression — fixture-backed,
 * DB-independent. Covers the v1 credit table, the per-word-per-skill cap,
 * link filtering (contrast excluded, approval + active required), the
 * status-5 breadth gate, override-aware level assignment, the allocation-
 * derived target formula, gated-never-averaged levels (including the
 * first-populated-level rule and re-gating), state-based slipped crediting,
 * the reporting shape + parent vocabulary constants, the 5D composer
 * "not yet secure" extension, and determinism.
 */

import {
  PROFICIENCY_POLICY_V1,
  PROFICIENCY_VOCABULARY,
  isLimitedAllocation,
  levelTarget,
  stateCredit,
} from "../lib/adle/proficiency-policy";
import {
  computeAllSkillProficiency,
  computeSkillProficiency,
  notYetSecureSkillKeys,
  type ProficiencyInputs,
} from "../lib/adle/micro-skill-proficiency";
import type {
  BandingOverrideFact,
  BandingVersionFact,
  ChildBandProfile,
  DictionaryWordFact,
  SkillLevelAllocationFact,
  WordBandingFact,
  WordSupportFact,
} from "../lib/adle/dictionary-eligibility";
import type { WordEvidenceState, WordEvidenceStateResult } from "../lib/adle/word-evidence-state";
import { selectPartTwoSkill, type SkillSelectionFacts } from "../lib/adle/composer-skill-selection";
import type { LearningItemFact } from "../lib/adle/learning-items";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
}
function approx(a: number, b: number, message: string) {
  assert(Math.abs(a - b) < 1e-9, `${message} (got ${a}, expected ${b})`);
}

const policy = PROFICIENCY_POLICY_V1;
const CHILD = "child-1";
const VERSION = "banding_v1.1_2026-07-04";
const ACTIVE_VERSION: BandingVersionFact = { bandingVersion: VERSION, isActive: true, levelCount: 3 };
const CHILD_BAND: ChildBandProfile = { allowedFrequencyBands: ["high", "medium"], allowedAgeBands: ["5-7", "7-9"] };

// --- fixture builders -------------------------------------------------------

function word(id: string, overrides: Partial<DictionaryWordFact> = {}): DictionaryWordFact {
  return {
    canonicalWordId: id,
    wordKey: id,
    normalisedWord: id.replace(/[^a-z]/g, "") || "w",
    displayWord: id.replace(/[^a-z]/g, "") || "w",
    rowStatus: "active",
    reviewStatus: "approved_for_first_exposure",
    frequencyBand: "high",
    ageBand: "5-7",
    ...overrides,
  };
}
function support(
  wordId: string,
  skill: string,
  overrides: Partial<WordSupportFact> = {},
): WordSupportFact {
  return {
    canonicalWordId: wordId,
    microSkillKey: skill,
    supportRole: "support_example",
    rowStatus: "active",
    reviewStatus: "approved_for_first_exposure",
    ...overrides,
  };
}
function banding(wordId: string, level: number, overrides: Partial<WordBandingFact> = {}): WordBandingFact {
  return {
    canonicalWordId: wordId,
    bandingVersion: VERSION,
    structuralScore: level,
    complexityLevel: level,
    rowStatus: "active",
    ...overrides,
  };
}
function alloc(skill: string, level: number, allocation: number): SkillLevelAllocationFact {
  return { microSkillKey: skill, complexityLevel: level, allocation, bandingVersion: VERSION, rowStatus: "active" };
}
function state(wordId: string, s: WordEvidenceState, slipped = false): WordEvidenceStateResult {
  return {
    childId: CHILD,
    canonicalWordId: wordId,
    state: s,
    slipped,
    unresolvedSlips: [],
    score: 0,
    explanation: [],
  };
}
function inputs(overrides: Partial<ProficiencyInputs> = {}): ProficiencyInputs {
  return {
    childId: CHILD,
    wordStates: [],
    words: [],
    supports: [],
    bandings: [],
    overrides: [],
    activeBandingVersion: ACTIVE_VERSION,
    childBand: CHILD_BAND,
    allocations: [],
    ...overrides,
  };
}

// --- 1. credit table truth --------------------------------------------------

assert(policy.proficiencyPolicyVersion === "proficiency_policy_v1_2026-07-05", "policy version");
approx(stateCredit(policy, "unseen"), 0, "unseen credit");
approx(stateCredit(policy, "active"), 0.1, "active credit");
approx(stateCredit(policy, "produced"), 0.4, "produced credit");
approx(stateCredit(policy, "secure"), 1.0, "secure credit");
approx(stateCredit(policy, "review_retired"), 1.0, "review_retired credit");
approx(stateCredit(policy, "mastered"), 1.0, "mastered credit");

// --- 2. target formula ------------------------------------------------------

assert(levelTarget(policy, 0) === null, "allocation 0 -> unpopulated (no target)");
assert(levelTarget(policy, 4) === 4, "allocation 4 -> target 4 (limited, full allocation)");
assert(isLimitedAllocation(policy, 4), "allocation 4 is limited");
assert(levelTarget(policy, 8) === 8, "allocation 8 -> target 8 (floor binds)");
assert(!isLimitedAllocation(policy, 8), "allocation 8 not limited");
assert(levelTarget(policy, 12) === 8, "allocation 12 -> target 8 (0.6x=7.2->8 floor)");
assert(levelTarget(policy, 20) === 12, "allocation 20 -> target 12");
assert(levelTarget(policy, 40) === 20, "allocation 40 -> target 20 (cap binds)");

// --- 3. per-word-per-skill cap + multi-skill words --------------------------

{
  // One word, two qualifying links to the same skill -> credited once.
  const inp = inputs({
    words: [word("w1")],
    supports: [
      support("w1", "SK_A", { supportRole: "support_example" }),
      support("w1", "SK_A", { supportRole: "review_example" }),
    ],
    bandings: [banding("w1", 1)],
    allocations: [alloc("SK_A", 1, 10)],
    wordStates: [state("w1", "secure")],
  });
  const rep = computeSkillProficiency(policy, inp, "SK_A");
  approx(rep.levels[0].creditSum, 1.0, "two links to one skill credit once (1.0 cap)");
  assert(rep.levels[0].creditedWords.length === 1, "word appears once");
}
{
  // Multi-skill word credits each mapped skill.
  const inp = inputs({
    words: [word("w1")],
    supports: [support("w1", "SK_A"), support("w1", "SK_B")],
    bandings: [banding("w1", 1)],
    allocations: [alloc("SK_A", 1, 10), alloc("SK_B", 1, 10)],
    wordStates: [state("w1", "produced")],
  });
  approx(computeSkillProficiency(policy, inp, "SK_A").levels[0].creditSum, 0.4, "multi-skill credits SK_A");
  approx(computeSkillProficiency(policy, inp, "SK_B").levels[0].creditSum, 0.4, "multi-skill credits SK_B");
}

// --- 4. link filtering ------------------------------------------------------

{
  const inp = inputs({
    words: [word("w1"), word("w2"), word("w3"), word("w4")],
    supports: [
      support("w1", "SK_A", { supportRole: "contrast" }), // excluded
      support("w2", "SK_A", { supportRole: "review_example" }), // credits
      support("w3", "SK_A", { rowStatus: "superseded" }), // inactive -> excluded
      support("w4", "SK_A", { reviewStatus: "in_review" }), // unapproved -> not evidence-eligible
    ],
    bandings: [banding("w1", 1), banding("w2", 1), banding("w3", 1), banding("w4", 1)],
    allocations: [alloc("SK_A", 1, 10)],
    wordStates: [state("w1", "secure"), state("w2", "secure"), state("w3", "secure"), state("w4", "secure")],
  });
  const rep = computeSkillProficiency(policy, inp, "SK_A");
  approx(rep.levels[0].creditSum, 1.0, "only the approved active non-contrast review_example link credits");
  assert(rep.levels[0].creditedWords[0].canonicalWordId === "w2", "credited word is w2");
}

// --- 5. status-5 gate (out-of-band earns zero breadth) ----------------------

{
  const inp = inputs({
    words: [word("w1"), word("w2", { frequencyBand: "rare" })],
    supports: [support("w1", "SK_A"), support("w2", "SK_A")],
    bandings: [banding("w1", 1), banding("w2", 1)],
    allocations: [alloc("SK_A", 1, 10)],
    wordStates: [state("w1", "mastered"), state("w2", "mastered")],
  });
  const rep = computeSkillProficiency(policy, inp, "SK_A");
  approx(rep.levels[0].creditSum, 1.0, "out-of-band mastered word earns zero breadth (status-5 gate)");
  assert(rep.levels[0].creditedWords.length === 1 && rep.levels[0].creditedWords[0].canonicalWordId === "w1", "only in-band word credits");
}

// --- 6. override-aware level + unbanded exclusion ---------------------------

{
  const inp = inputs({
    words: [word("w1"), word("w2")],
    supports: [support("w1", "SK_A"), support("w2", "SK_A")],
    bandings: [banding("w1", 1)], // w2 unbanded -> excluded
    overrides: [{ canonicalWordId: "w1", overrideLevel: 3, overrideReason: "admin", rowStatus: "active" } as BandingOverrideFact],
    allocations: [alloc("SK_A", 1, 10), alloc("SK_A", 3, 10)],
    wordStates: [state("w1", "secure"), state("w2", "secure")],
  });
  const rep = computeSkillProficiency(policy, inp, "SK_A");
  approx(rep.levels[0].creditSum, 0, "override moves w1 off L1");
  approx(rep.levels[2].creditSum, 1.0, "override lands w1 at L3");
  assert(rep.levels[2].creditedWords[0].levelSource === "override", "level source is override");
  assert(rep.explanation.some((line) => line.includes("1 excluded unbanded")), "unbanded word excluded and noted");
}

// --- 7. gating never averaging + first-populated-level + re-gating ----------

{
  // L1 alloc 10 (target 8) with 7 secure words -> progress 0.875 (not secure).
  // L2 alloc 10 (target 8) with 8 secure words -> progress 1.0 but GATED.
  const l1Words = Array.from({ length: 7 }, (_, i) => `a${i}`);
  const l2Words = Array.from({ length: 8 }, (_, i) => `b${i}`);
  const inp = inputs({
    words: [...l1Words, ...l2Words].map((id) => word(id)),
    supports: [...l1Words.map((id) => support(id, "SK_A")), ...l2Words.map((id) => support(id, "SK_A"))],
    bandings: [...l1Words.map((id) => banding(id, 1)), ...l2Words.map((id) => banding(id, 2))],
    allocations: [alloc("SK_A", 1, 10), alloc("SK_A", 2, 10)],
    wordStates: [...l1Words.map((id) => state(id, "secure")), ...l2Words.map((id) => state(id, "secure"))],
  });
  const rep = computeSkillProficiency(policy, inp, "SK_A");
  assert(rep.firstPopulatedLevel === 1, "first populated level is 1");
  assert(rep.highestSecureLevel === null, "nothing secure while L1 below target");
  assert(rep.levels[1].secured === false, "L2 not secure while L1 ungated");
  assert(rep.levels[1].badge === "developing (early)", "L2 reports developing (early), not secure, not averaged");
  assert(rep.gatedLevels.length === 1 && rep.gatedLevels[0].level === 2, "L2 collected as gated");
  assert(rep.developingLevel === 1, "developing level is L1");

  // Now L1 reaches target (add an 8th secure word) -> L2 flips secure.
  const inp2 = inputs({
    ...inp,
    words: [...inp.words, word("a7")],
    supports: [...inp.supports, support("a7", "SK_A")],
    bandings: [...inp.bandings, banding("a7", 1)],
    wordStates: [...inp.wordStates, state("a7", "secure")],
  });
  const rep2 = computeSkillProficiency(policy, inp2, "SK_A");
  assert(rep2.levels[0].secured === true, "L1 secure at target");
  assert(rep2.levels[1].secured === true, "L2 flips secure once L1 gate opens");
  assert(rep2.highestSecureLevel === 2, "highest secure level is 2");
}
{
  // First-populated-level rule: L1 unpopulated (alloc 0), L2 populated & full.
  // L2 is gated only by populated lower levels -> secure; L1 is a no_allocation gap.
  const l2Words = Array.from({ length: 8 }, (_, i) => `b${i}`);
  const inp = inputs({
    words: l2Words.map((id) => word(id)),
    supports: l2Words.map((id) => support(id, "SK_A")),
    bandings: l2Words.map((id) => banding(id, 2)),
    allocations: [alloc("SK_A", 2, 10)], // L1 has no cell
    wordStates: l2Words.map((id) => state(id, "secure")),
  });
  const rep = computeSkillProficiency(policy, inp, "SK_A");
  assert(rep.firstPopulatedLevel === 2, "first populated level is 2 (L1 empty)");
  assert(rep.levels[1].secured === true, "L2 secure despite empty L1 (progress from first available level)");
  assert(rep.highestSecureLevel === 2, "highest secure level is 2");
  assert(rep.evidenceGaps.some((g) => g.kind === "no_allocation" && g.level === 1), "empty L1 surfaced as no_allocation gap");

  // Re-gating: a later import populates L1 with words the child hasn't secured.
  const inp2 = inputs({
    ...inp,
    words: [...inp.words, word("a0")],
    supports: [...inp.supports, support("a0", "SK_A")],
    bandings: [...inp.bandings, banding("a0", 1)],
    allocations: [alloc("SK_A", 1, 8), alloc("SK_A", 2, 10)],
    wordStates: [...inp.wordStates, state("a0", "produced")],
  });
  const rep2 = computeSkillProficiency(policy, inp2, "SK_A");
  assert(rep2.firstPopulatedLevel === 1, "L1 now populated");
  assert(rep2.levels[0].secured === false, "L1 not secure (only 0.4 of 8)");
  assert(rep2.levels[1].secured === false, "previously-secure L2 re-gates when L1 populates");
  assert(rep2.levels[1].badge === "developing (early)", "L2 back to developing (early) after re-gating");
}

// --- 8. state-based slipped crediting ---------------------------------------

{
  // Slice 4 pin: a secure-evidence word with an unresolved slip reports
  // `produced` -> credits 0.4 automatically (no separate flag penalty).
  const inp = inputs({
    words: [word("w1")],
    supports: [support("w1", "SK_A")],
    bandings: [banding("w1", 1)],
    allocations: [alloc("SK_A", 1, 10)],
    wordStates: [state("w1", "produced", true)],
  });
  approx(computeSkillProficiency(policy, inp, "SK_A").levels[0].creditSum, 0.4, "slipped-to-produced word credits 0.4");
}
{
  // A slipped `review_retired` word still reports review_retired -> 1.0.
  const inp = inputs({
    words: [word("w1")],
    supports: [support("w1", "SK_A")],
    bandings: [banding("w1", 1)],
    allocations: [alloc("SK_A", 1, 10)],
    wordStates: [state("w1", "review_retired", true)],
  });
  approx(computeSkillProficiency(policy, inp, "SK_A").levels[0].creditSum, 1.0, "slipped review_retired keeps 1.0 (state-based, no double-punish)");
}

// --- 9. reporting shape + vocabulary ----------------------------------------

{
  // Limited-allocation secure: alloc 4, target 4, 4 secure words.
  const words4 = Array.from({ length: 4 }, (_, i) => `c${i}`);
  const inp = inputs({
    words: words4.map((id) => word(id)),
    supports: words4.map((id) => support(id, "SK_A")),
    bandings: words4.map((id) => banding(id, 1)),
    allocations: [alloc("SK_A", 1, 4)],
    wordStates: words4.map((id) => state(id, "secure")),
  });
  const rep = computeSkillProficiency(policy, inp, "SK_A");
  assert(rep.levels[0].secured === true, "limited-allocation level secures from full allocation");
  assert(rep.levels[0].badge === "secure (limited allocation)", "limited badge token");
  assert(rep.allocationLimited === true, "allocation-limited flag set");
  assert(rep.evidenceGaps.some((g) => g.kind === "allocation_under_floor" && g.level === 1), "under-floor gap reported");
  assert(rep.proficiencyPolicyVersion === policy.proficiencyPolicyVersion, "policy version stamped");
  assert(rep.bandingVersion === VERSION, "banding version stamped");
  // developing-words gap on a partially-secured level.
  const inp2 = inputs({
    words: [word("d0"), word("d1"), word("d2")],
    supports: [support("d0", "SK_B"), support("d1", "SK_B"), support("d2", "SK_B")],
    bandings: [banding("d0", 1), banding("d1", 1), banding("d2", 1)],
    allocations: [alloc("SK_B", 1, 10)],
    wordStates: [state("d0", "secure"), state("d1", "active"), state("d2", "unseen")],
  });
  const rep2 = computeSkillProficiency(policy, inp2, "SK_B");
  assert(rep2.developingLevel === 1 && rep2.levels[0].badge === "developing", "developing level badge token");
  assert(PROFICIENCY_VOCABULARY.developing === "developing — on track", "parent-facing developing phrase available");
  const gap = rep2.evidenceGaps.find((g) => g.kind === "developing_words");
  assert(gap && gap.kind === "developing_words" && gap.active === 1 && gap.unseen === 1, "developing-words gap counts active/unseen");
}

// --- 10. skillsToReport + computeAll + notYetSecure --------------------------

{
  const inp = inputs({
    words: [word("w1")],
    supports: [support("w1", "SK_A"), support("w1", "SK_B", { supportRole: "contrast" })],
    bandings: [banding("w1", 1)],
    allocations: [alloc("SK_A", 1, 1), alloc("SK_C", 1, 10)],
    wordStates: [state("w1", "secure")],
  });
  const all = computeAllSkillProficiency(policy, inp);
  const keys = all.map((r) => r.microSkillKey);
  assert(keys.includes("SK_A") && keys.includes("SK_C"), "allocation skills reported");
  assert(!keys.includes("SK_B"), "contrast-only skill not reported");
  const nys = notYetSecureSkillKeys(all);
  assert(nys.has("SK_C") && !nys.has("SK_A"), "not-yet-secure = skills with no secure level");
}

// --- 11. 5D composer extension ----------------------------------------------

let composerItemCounter = 0;
function li(canonicalWordId: string, microSkillKey: string, overrides: Partial<LearningItemFact> = {}): LearningItemFact {
  composerItemCounter += 1;
  return {
    learningItemId: `li-${composerItemCounter}`,
    childId: CHILD,
    canonicalWordId,
    microSkillKey,
    itemStatus: "pending",
    sourceKind: "verified_misspelling",
    sourceRef: `fx:${composerItemCounter}`,
    sourceAttemptText: null,
    reteachPriority: false,
    ejectedOn: null,
    intakeOn: "2026-06-20",
    rowStatus: "active",
    ...overrides,
  };
}
function selFacts(items: LearningItemFact[], overrides: Partial<SkillSelectionFacts> = {}): SkillSelectionFacts {
  return {
    learningItems: items,
    skillFamilyKeyBySkill: new Map(),
    prerequisiteKeysBySkill: new Map(),
    frequencyBandByWordId: new Map(),
    previousLessonFamilyKey: null,
    ...overrides,
  };
}

{
  // Two competing candidate skills (each >= 2 items): SK_DEP and SK_OTHER.
  // SK_PRE has a single unresolved item (not a selectable candidate) and is
  // not yet secure. SK_DEP depends on SK_PRE.
  const prereq = new Map([["SK_DEP", ["SK_PRE"]]]);
  const items = () => [
    li("w1", "SK_DEP"), li("w2", "SK_DEP"),
    li("w3", "SK_OTHER"), li("w4", "SK_OTHER"),
    li("w5", "SK_PRE"),
  ];

  // Without the extension fact, SK_PRE is not a candidate, so the prerequisite
  // tier defers nothing; selection falls through to the stable key tie-break.
  const withoutExt = selectPartTwoSkill(selFacts(items(), { prerequisiteKeysBySkill: prereq }));
  assert(withoutExt.decidingTier !== "prerequisite_precedence", "no deferral without the extension fact");
  assert(withoutExt.microSkillKey === "SK_DEP", "SK_DEP wins the key tie-break without the extension");

  // With the extension, SK_DEP's not-yet-secure ACTIONABLE prerequisite defers
  // it; SK_OTHER survives uniquely at the prerequisite tier.
  const withExt = selectPartTwoSkill(
    selFacts(items(), { prerequisiteKeysBySkill: prereq, notYetSecureSkillKeys: new Set(["SK_PRE"]) }),
  );
  assert(withExt.microSkillKey === "SK_OTHER", "not-yet-secure actionable prerequisite defers its dependent");
  assert(withExt.decidingTier === "prerequisite_precedence", "prerequisite tier is the deciding tier");
  const audit = withExt.audit.find((a) => a.tier === "prerequisite_precedence");
  assert(audit !== undefined && !audit.candidatesAfter.includes("SK_DEP"), "audit shows SK_DEP deferred");

  // Not-yet-secure but NOT actionable (prerequisite has zero items) -> no
  // deferral; SK_DEP is not starved behind an unactionable prerequisite.
  const noPreItems = [li("w1", "SK_DEP"), li("w2", "SK_DEP"), li("w3", "SK_OTHER"), li("w4", "SK_OTHER")];
  const notActionable = selectPartTwoSkill(
    selFacts(noPreItems, { prerequisiteKeysBySkill: prereq, notYetSecureSkillKeys: new Set(["SK_PRE"]) }),
  );
  assert(notActionable.decidingTier !== "prerequisite_precedence", "unactionable prerequisite (no items) does not defer");
  assert(notActionable.microSkillKey === "SK_DEP", "SK_DEP not starved behind an unactionable prerequisite");

  // Fail-open: deferring the sole candidate would empty the survivor set, so it
  // decides nothing and that candidate is still selected.
  const selfEmpty = selectPartTwoSkill(
    selFacts([li("w1", "SK_DEP"), li("w2", "SK_DEP"), li("w5", "SK_PRE")], {
      prerequisiteKeysBySkill: prereq,
      notYetSecureSkillKeys: new Set(["SK_PRE"]),
    }),
  );
  assert(selfEmpty.microSkillKey === "SK_DEP", "deferral that empties survivors decides nothing (fail-open)");
}

// --- 12. determinism --------------------------------------------------------

{
  const inp = inputs({
    words: [word("w1"), word("w2")],
    supports: [support("w1", "SK_A"), support("w2", "SK_A")],
    bandings: [banding("w1", 1), banding("w2", 2)],
    allocations: [alloc("SK_A", 1, 10), alloc("SK_A", 2, 10)],
    wordStates: [state("w1", "secure"), state("w2", "produced")],
  });
  const run = () => JSON.stringify(computeSkillProficiency(policy, inp, "SK_A"));
  assert(run() === run(), "identical inputs -> byte-identical report");
}

console.log("adle-proficiency-regression: all checks passed");
