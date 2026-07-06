/**
 * ADLE Slice 5 (5E): owner QA artefact generator — computes fixture children's
 * micro-skill proficiency through the real Slice 5 read model and renders the
 * per-skill report as markdown (the Slice 3/4 sample-artefact pattern).
 * Fixture-only: no DB access anywhere.
 *
 * Covers the cases the plan named: a limited-allocation secure, a gated
 * developing (early), an unpopulated-level skip (progress from the first
 * available level), state-based slipped crediting (produced-demotion and the
 * review_retired-keeps-1.0 case), a multi-skill word crediting two skills, and
 * an out-of-band mastered word earning zero breadth.
 *
 * Output: docs/implementation/adle-slice-5-proficiency-report-samples-2026-07-05.md
 */

import { writeFileSync } from "fs";
import { resolve } from "path";
import {
  PROFICIENCY_POLICY_V1,
  PROFICIENCY_VOCABULARY,
} from "../lib/adle/proficiency-policy";
import {
  computeAllSkillProficiency,
  type ProficiencyInputs,
  type SkillProficiencyReport,
} from "../lib/adle/micro-skill-proficiency";
import type {
  BandingVersionFact,
  ChildBandProfile,
  DictionaryWordFact,
  SkillLevelAllocationFact,
  WordBandingFact,
  WordSupportFact,
} from "../lib/adle/dictionary-eligibility";
import type { WordEvidenceState, WordEvidenceStateResult } from "../lib/adle/word-evidence-state";

const policy = PROFICIENCY_POLICY_V1;
const VERSION = "banding_v1.1_2026-07-04";
const ACTIVE_VERSION: BandingVersionFact = { bandingVersion: VERSION, isActive: true, levelCount: 3 };
const CHILD_BAND: ChildBandProfile = { allowedFrequencyBands: ["high", "medium"], allowedAgeBands: ["5-7", "7-9"] };

function word(id: string, band: Partial<DictionaryWordFact> = {}): DictionaryWordFact {
  return {
    canonicalWordId: id,
    wordKey: id,
    normalisedWord: id.replace(/[^a-z]/g, "") || "w",
    rowStatus: "active",
    reviewStatus: "approved_for_first_exposure",
    frequencyBand: "high",
    ageBand: "5-7",
    ...band,
  };
}
function support(wordId: string, skill: string, role: WordSupportFact["supportRole"] = "support_example"): WordSupportFact {
  return { canonicalWordId: wordId, microSkillKey: skill, supportRole: role, rowStatus: "active", reviewStatus: "approved_for_first_exposure" };
}
function banding(wordId: string, level: number): WordBandingFact {
  return { canonicalWordId: wordId, bandingVersion: VERSION, structuralScore: level, complexityLevel: level, rowStatus: "active" };
}
function alloc(skill: string, level: number, allocation: number): SkillLevelAllocationFact {
  return { microSkillKey: skill, complexityLevel: level, allocation, bandingVersion: VERSION, rowStatus: "active" };
}
function stateFact(childId: string, wordId: string, s: WordEvidenceState, slipped = false): WordEvidenceStateResult {
  return { childId, canonicalWordId: wordId, state: s, slipped, unresolvedSlips: [], score: 0, explanation: [] };
}

/** Parent-facing summary — progress-toward-next-level framing, never
 * pass/fail (blueprint), using the vocabulary constants. */
function parentSentence(report: SkillProficiencyReport): string {
  if (report.firstPopulatedLevel === null) {
    return "No word bank yet for this skill — nothing to report until words are added.";
  }
  const parts: string[] = [];
  if (report.highestSecureLevel !== null) {
    const badge = report.levels[report.highestSecureLevel - 1].badge;
    parts.push(`Secure through Level ${report.highestSecureLevel}${badge.includes("limited") ? " (limited word bank)" : ""}.`);
  } else {
    parts.push("Just getting started.");
  }
  if (report.developingLevel !== null) {
    const level = report.levels[report.developingLevel - 1];
    const secureWords = level.creditedWords.filter((w) => w.credit >= 1).length;
    const phrase = PROFICIENCY_VOCABULARY.developing;
    const developing = phrase.charAt(0).toUpperCase() + phrase.slice(1);
    parts.push(`${developing} at Level ${report.developingLevel} — ${secureWords} of ${level.target} words showing security.`);
  }
  for (const gated of report.gatedLevels) {
    parts.push(`Already showing early progress at Level ${gated.level} (held until the level below is secure).`);
  }
  if (report.allocationLimited) {
    parts.push("Some levels have a small word bank; progress there firms up as more words are added.");
  }
  return parts.join(" ");
}

function renderReport(report: SkillProficiencyReport): string {
  const lines: string[] = [];
  lines.push(`### \`${report.microSkillKey}\``);
  lines.push("");
  lines.push(`_${parentSentence(report)}_`);
  lines.push("");
  lines.push(
    `Highest secure level: **${report.highestSecureLevel ?? "none"}** · developing level: **${report.developingLevel ?? "—"}** · allocation-limited: **${report.allocationLimited}**`,
  );
  lines.push("");
  lines.push("| level | allocation | target | credit | progress | secured | badge |");
  lines.push("|---:|---:|---:|---:|---:|---|---|");
  for (const level of report.levels) {
    lines.push(
      `| ${level.level} | ${level.allocation} | ${level.target ?? "—"} | ${level.creditSum.toFixed(2)} | ${level.progress === null ? "—" : level.progress.toFixed(2)} | ${level.secured ? "yes" : "no"} | ${level.badge} |`,
    );
  }
  lines.push("");
  if (report.evidenceGaps.length > 0) {
    lines.push("Evidence gaps:");
    for (const gap of report.evidenceGaps) {
      if (gap.kind === "no_allocation") {
        lines.push(`- Level ${gap.level}: no word bank yet (\`no_allocation\`) — skipped by gating, not a blocker`);
      } else if (gap.kind === "allocation_under_floor") {
        lines.push(`- Level ${gap.level}: only ${gap.allocation} words available (\`allocation_under_floor\`, floor 8)`);
      } else {
        lines.push(`- Level ${gap.level}: still building — ${gap.produced} produced, ${gap.active} active, ${gap.unseen} unseen`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

function renderChild(name: string, inputs: ProficiencyInputs): string {
  const reports = computeAllSkillProficiency(policy, inputs);
  return [`## ${name}`, "", ...reports.map(renderReport)].join("\n");
}

// --- Fixture Child A: limited secure, gated level, unpopulated skip ----------

const childA: ProficiencyInputs = (() => {
  const childId = "fixture-child-a";
  const words: DictionaryWordFact[] = [];
  const supports: WordSupportFact[] = [];
  const bandings: WordBandingFact[] = [];
  const states: WordEvidenceStateResult[] = [];
  const allocations: SkillLevelAllocationFact[] = [];

  // SK_MAGIC_E: L1 allocation 4 (under floor), 4 secure words -> secure (limited).
  allocations.push(alloc("SK_MAGIC_E", 1, 4));
  for (let i = 0; i < 4; i++) {
    const id = `me${i}`;
    words.push(word(id)); supports.push(support(id, "SK_MAGIC_E")); bandings.push(banding(id, 1));
    states.push(stateFact(childId, id, "secure"));
  }

  // SK_VOWEL_TEAM: L1 alloc 10 (target 8) with 5 secure (developing); L2 alloc 10
  // with 8 secure -> progress 1.0 but GATED -> developing (early).
  allocations.push(alloc("SK_VOWEL_TEAM", 1, 10), alloc("SK_VOWEL_TEAM", 2, 10));
  for (let i = 0; i < 8; i++) {
    const id = `vt1_${i}`;
    words.push(word(id)); supports.push(support(id, "SK_VOWEL_TEAM")); bandings.push(banding(id, 1));
    states.push(stateFact(childId, id, i < 5 ? "secure" : "unseen"));
  }
  for (let i = 0; i < 8; i++) {
    const id = `vt2_${i}`;
    words.push(word(id)); supports.push(support(id, "SK_VOWEL_TEAM")); bandings.push(banding(id, 2));
    states.push(stateFact(childId, id, "secure"));
  }

  // SK_SUFFIX: L1 unpopulated, L2 alloc 8 with 8 secure -> L2 secure from first
  // available level; L1 reported as a no_allocation gap.
  allocations.push(alloc("SK_SUFFIX", 2, 8));
  for (let i = 0; i < 8; i++) {
    const id = `sf${i}`;
    words.push(word(id)); supports.push(support(id, "SK_SUFFIX")); bandings.push(banding(id, 2));
    states.push(stateFact(childId, id, "secure"));
  }

  return {
    childId, wordStates: states, words, supports, bandings, overrides: [],
    activeBandingVersion: ACTIVE_VERSION, childBand: CHILD_BAND, allocations,
  };
})();

// --- Fixture Child B: slipped crediting, multi-skill word, out-of-band -------

const childB: ProficiencyInputs = (() => {
  const childId = "fixture-child-b";
  const words: DictionaryWordFact[] = [];
  const supports: WordSupportFact[] = [];
  const bandings: WordBandingFact[] = [];
  const states: WordEvidenceStateResult[] = [];
  const allocations: SkillLevelAllocationFact[] = [];

  // SK_HOMO_SLIP: L1 alloc 4. Two words illustrate state-based slipped credit:
  //  - "there" secure-evidence but slipped -> Slice 4 reports `produced` -> 0.4
  //  - "friend" slipped review_retired -> still reports review_retired -> 1.0
  //  plus two clean secure words.
  allocations.push(alloc("SK_HOMO_SLIP", 1, 4));
  words.push(word("there")); supports.push(support("there", "SK_HOMO_SLIP")); bandings.push(banding("there", 1));
  states.push(stateFact(childId, "there", "produced", true));
  words.push(word("friend")); supports.push(support("friend", "SK_HOMO_SLIP")); bandings.push(banding("friend", 1));
  states.push(stateFact(childId, "friend", "review_retired", true));
  for (const id of ["said", "come"]) {
    words.push(word(id)); supports.push(support(id, "SK_HOMO_SLIP")); bandings.push(banding(id, 1));
    states.push(stateFact(childId, id, "secure"));
  }

  // Multi-skill word "cried": mapped to SK_PLURAL_Y and SK_PAST_ED, secure ->
  // credits each skill 1.0.
  allocations.push(alloc("SK_PLURAL_Y", 1, 3), alloc("SK_PAST_ED", 1, 3));
  words.push(word("cried"));
  supports.push(support("cried", "SK_PLURAL_Y"), support("cried", "SK_PAST_ED"));
  bandings.push(banding("cried", 1));
  states.push(stateFact(childId, "cried", "secure"));
  // a couple more so each skill has a small bank
  for (const [id, skill] of [["tries", "SK_PLURAL_Y"], ["baked", "SK_PAST_ED"]] as const) {
    words.push(word(id)); supports.push(support(id, skill)); bandings.push(banding(id, 1));
    states.push(stateFact(childId, id, "produced"));
  }

  // SK_OBSCURE: an out-of-band mastered word earns word evidence but ZERO
  // breadth (status-5 gate). "syzygy" is out of the child's frequency band.
  allocations.push(alloc("SK_OBSCURE", 1, 5));
  words.push(word("syzygy", { frequencyBand: "rare" }));
  supports.push(support("syzygy", "SK_OBSCURE"));
  bandings.push(banding("syzygy", 1));
  states.push(stateFact(childId, "syzygy", "mastered"));

  return {
    childId, wordStates: states, words, supports, bandings, overrides: [],
    activeBandingVersion: ACTIVE_VERSION, childBand: CHILD_BAND, allocations,
  };
})();

const out = [
  "# ADLE Slice 5 — Proficiency Report Samples (owner QA artefact)",
  "",
  "Generated 2026-07-05 by `scripts/adle-proficiency-report-samples.ts` from",
  "fixtures through the real Slice 5 read model (`proficiency-policy`,",
  "`micro-skill-proficiency`) over injected Slice 4 word evidence states — no",
  "DB access. Policy: `" + policy.proficiencyPolicyVersion + "`, banding",
  "`" + VERSION + "`. This is the owner QA gate artefact (Slice 5 plan,",
  "implementation-order step 7).",
  "",
  "What to look for:",
  "- **`SK_MAGIC_E`** — a level secured from a small (<8) word bank: badge",
  "  `secure (limited allocation)`, allocation-limited flag set.",
  "- **`SK_VOWEL_TEAM`** — gating, never averaging: Level 2 has full evidence",
  "  but reads `developing (early)` because Level 1 is not yet secure.",
  "- **`SK_SUFFIX`** — no Level-1 word bank, so progress starts at the first",
  "  available level (Level 2); Level 1 is a `no_allocation` gap, not a blocker.",
  "- **`SK_HOMO_SLIP`** — state-based slipped crediting: `there` slipped to",
  "  `produced` credits 0.4; `friend` (slipped `review_retired`) keeps 1.0.",
  "- **`SK_PLURAL_Y` / `SK_PAST_ED`** — the multi-skill word `cried` credits",
  "  both mapped skills.",
  "- **`SK_OBSCURE`** — the out-of-band mastered word `syzygy` earns zero",
  "  breadth (status-5 gate); the level reads as not started.",
  "",
  renderChild("Fixture Child A", childA),
  "",
  renderChild("Fixture Child B", childB),
].join("\n");

const outPath = resolve("docs/implementation/adle-slice-5-proficiency-report-samples-2026-07-05.md");
writeFileSync(outPath, out + "\n");
console.log(`wrote ${outPath}`);
