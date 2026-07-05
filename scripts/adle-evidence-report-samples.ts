/**
 * ADLE Slice 4 (4G): owner QA artefact generator — prices two fixture
 * children's complete evidence histories through the real modules and
 * renders the per-word evidence report as markdown (the Slice 3
 * composed-plan-samples pattern). Fixture-only: no DB access anywhere.
 *
 * Output: docs/implementation/adle-slice-4-evidence-report-samples-2026-07-05.md
 */

import { writeFileSync } from "fs";
import { resolve } from "path";
import { EVIDENCE_POLICY_V1 } from "../lib/adle/evidence-policy";
import {
  priceWordEvidence,
  type AuthenticUseEventFact,
  type OutcomeEventFact,
  type SlippageEventFact,
  type TaughtHistoryFact,
  type WordPricingFacts,
} from "../lib/adle/evidence-pricing";
import { computeWordEvidenceState } from "../lib/adle/word-evidence-state";
import { applyAuthenticUseCredit } from "../lib/adle/authentic-use";
import { respondToSlip } from "../lib/adle/slippage";
import {
  createReviewBundle,
  resolveBundleReview,
  REVIEW_POLICY_V1,
} from "../lib/adle/review-scheduler";
import { dueReviewWords } from "../lib/adle/review-due-queue";

const policy = EVIDENCE_POLICY_V1;
const reviewPolicy = REVIEW_POLICY_V1;

function taughtFact(childId: string, wordId: string, occurredOn: string, attemptText: string, kind: "taught" | "probed" = "taught"): TaughtHistoryFact {
  return { childId, canonicalWordId: wordId, eventKind: kind, occurredOn, sourceRef: `${kind}:${occurredOn}`, rowStatus: "active", attemptText };
}

function cleanLadder(childId: string, wordId: string, word: string, taughtOn: string, retire: boolean): OutcomeEventFact[] {
  let { bundle, words } = createReviewBundle(reviewPolicy, {
    bundleId: `${wordId}-b1`, childId, sourceRef: `lesson:${taughtOn}`, taughtOn,
    words: [{ canonicalWordId: wordId }],
  });
  const events: OutcomeEventFact[] = [];
  while (bundle.bundleStatus === "active") {
    const resolution = resolveBundleReview(
      reviewPolicy, bundle, words,
      words.filter((w) => w.membershipStatus === "scheduled").map((w) => ({ canonicalWordId: w.canonicalWordId, passed: true })),
      bundle.nextDueOn,
      { hasAuthenticUseSince: () => retire },
    );
    bundle = resolution.bundle;
    words = resolution.words;
    events.push(...resolution.events.map((event) => ({ ...event, attemptText: word })));
  }
  return events;
}

interface WordFixture {
  facts: WordPricingFacts;
  displayWord: string;
  storyline: string;
}

function renderWord(fixture: WordFixture): string {
  const pricing = priceWordEvidence(policy, fixture.facts);
  const state = computeWordEvidenceState(policy, pricing, fixture.facts);
  const lines: string[] = [];
  lines.push(`### \`${fixture.displayWord}\` — state: **${state.state}**${state.slipped ? " · flag: **slipped**" : ""} · score: **${pricing.score}**`);
  lines.push("");
  lines.push(`_${fixture.storyline}_`);
  lines.push("");
  lines.push("| date | event | weight | recency | cap | note |");
  lines.push("|---|---|---:|---|---|---|");
  for (const entry of pricing.entries) {
    lines.push(
      `| ${entry.occurredOn} | ${entry.kind} | ${entry.weight} | ${entry.recency ?? "—"} | ${entry.capApplied ?? "—"} | ${entry.note} |`,
    );
  }
  lines.push("");
  lines.push("Explanation trail:");
  for (const line of state.explanation) {
    lines.push(`- ${line}`);
  }
  lines.push("");
  return lines.join("\n");
}

const sections: string[] = [];

// ---------------------------------------------------------------------------
// Child A — "Fixture Child A"
// ---------------------------------------------------------------------------

{
  const childId = "fixture-child-a";
  const wordId = "w-because";
  const ladder = cleanLadder(childId, wordId, "because", "2026-01-05", true);
  const authentic: AuthenticUseEventFact[] = [
    { childId, canonicalWordId: wordId, occurredOn: "2026-05-20", useKind: "authentic_correct_use", parentVerified: true, pieceRef: "ws:story-dragons", sourceRef: "ws:story-dragons", rowStatus: "active" },
  ];
  sections.push(renderWord({
    displayWord: "because",
    storyline:
      "Taught 2026-01-05; passed every review on the 1/3/7/14/28/56 ladder (clean run, retired with authentic use); later used correctly in a parent-reviewed story. The ladder alone prices 6.75 — below the mastery bar of 8 — and only the parent-reviewed authentic use (+2.0) completes the mastered gate.",
    facts: {
      childId, canonicalWordId: wordId, normalisedWord: "because", skillFamilyKey: "D4_IRRE",
      outcomeEvents: ladder, taughtHistory: [taughtFact(childId, wordId, "2026-01-05", "because")],
      authenticUseEvents: authentic, slippageEvents: [],
    },
  }));

  const friendId = "w-friend";
  const friendEvents: OutcomeEventFact[] = [
    { childId, canonicalWordId: friendId, bundleId: `${friendId}-b1`, eventType: "review_pass", occurredOn: "2026-02-10", intervalIndex: 0, schedulePolicyVersion: reviewPolicy.schedulePolicyVersion, attemptText: "friend" },
    { childId, canonicalWordId: friendId, bundleId: `${friendId}-b1`, eventType: "review_pass", occurredOn: "2026-02-20", intervalIndex: 1, schedulePolicyVersion: reviewPolicy.schedulePolicyVersion, attemptText: "friend" },
  ];
  const friendSlips: SlippageEventFact[] = [
    { childId, canonicalWordId: friendId, occurredOn: "2026-03-15", contextKind: "authentic_writing", selfCorrected: false, attemptText: "freind", sourceRef: "wi:diary-0315", slipOrdinal: 1, rowStatus: "active" },
  ];
  sections.push(renderWord({
    displayWord: "friend",
    storyline:
      "Secure via a probe production plus two review windows — then misspelled ('freind'), uncorrected, in real writing on 2026-03-15. The slip deducts −1.0 (half the authentic weight), sets the slipped flag, and the secure edge fails until a later correct production resolves it. The response below shows the 7-day re-entry check the slip schedules.",
    facts: {
      childId, canonicalWordId: friendId, normalisedWord: "friend", skillFamilyKey: "D4_PAT",
      outcomeEvents: friendEvents, taughtHistory: [taughtFact(childId, friendId, "2026-02-01", "friend", "probed")],
      authenticUseEvents: [], slippageEvents: friendSlips,
    },
  }));
  const response = respondToSlip(reviewPolicy, policy, {
    slip: friendSlips[0],
    microSkillKey: "D4_PAT_IE_EI",
    activeScheduleWord: null,
    taughtOn: "2026-02-01",
    reentryBundleId: "friend-reentry-1",
  });
  sections.push([
    "Slip response for `friend`:",
    "```json",
    JSON.stringify(response, null, 2),
    "```",
    "",
  ].join("\n"));

  const houseId = "w-house";
  sections.push(renderWord({
    displayWord: "house",
    storyline: "One cold correct diagnostic probe (2026-03-01): banks 1.5 and the word is `produced` — one production is not `secure`.",
    facts: {
      childId, canonicalWordId: houseId, normalisedWord: "house", skillFamilyKey: "D4_PG",
      outcomeEvents: [], taughtHistory: [taughtFact(childId, houseId, "2026-03-01", "house", "probed")],
      authenticUseEvents: [], slippageEvents: [],
    },
  }));
}

// ---------------------------------------------------------------------------
// Child B — "Fixture Child B"
// ---------------------------------------------------------------------------

const creditSection: string[] = [];
{
  const childId = "fixture-child-b";
  const thereId = "w-there";
  sections.push(renderWord({
    displayWord: "there (homophone family)",
    storyline:
      "Homophone-family word: the lesson spelling and a cold probe price 0 (plain dictation carries no homophone-choice evidence); the review production prices normally because the composer guarantees sentence-context production for homophone-family review words.",
    facts: {
      childId, canonicalWordId: thereId, normalisedWord: "there", skillFamilyKey: policy.homophoneFamilyKey,
      outcomeEvents: [
        { childId, canonicalWordId: thereId, bundleId: `${thereId}-b1`, eventType: "review_pass", occurredOn: "2026-04-10", intervalIndex: 1, schedulePolicyVersion: reviewPolicy.schedulePolicyVersion, attemptText: "there" },
      ],
      taughtHistory: [taughtFact(childId, thereId, "2026-04-01", "there"), taughtFact(childId, thereId, "2026-04-20", "there", "probed")],
      authenticUseEvents: [], slippageEvents: [],
    },
  }));

  // Authentic-use review credit walkthrough
  const saidId = "w-said";
  let { bundle, words } = createReviewBundle(reviewPolicy, {
    bundleId: `${saidId}-b1`, childId, sourceRef: "lesson:2026-06-01", taughtOn: "2026-06-01",
    words: [{ canonicalWordId: saidId }],
  });
  for (let i = 0; i < 2; i++) {
    const r = resolveBundleReview(reviewPolicy, bundle, words, [{ canonicalWordId: saidId, passed: true }], bundle.nextDueOn);
    bundle = r.bundle; words = r.words;
  }
  const today = bundle.nextDueOn;
  const queue = dueReviewWords([bundle], words, today);
  const use: AuthenticUseEventFact = {
    childId, canonicalWordId: saidId, occurredOn: "2026-06-08", useKind: "authentic_correct_use",
    parentVerified: true, pieceRef: "ws:letter-grandma", sourceRef: "ws:letter-grandma", rowStatus: "active",
  };
  const credit = applyAuthenticUseCredit(reviewPolicy, {
    queue, bundles: [bundle], scheduleWords: words, authenticUseEvents: [use],
    consumedPieceRefs: new Set(), today,
  });
  creditSection.push(
    "### Authentic-use review credit walkthrough — `said` (amendment item 3)",
    "",
    `_Taught 2026-06-01; passed the day-1 and day-3 reviews; the 7-day review is due ${today}. On 2026-06-08 — inside the current interval window — a parent verified a correct use of \"said\" in a letter. The credit resolves the due review as a pass (fed to the unchanged Slice 2 transition), priced as authentic writing (2.0), and the consumed piece_ref can never credit again._`,
    "",
    "```json",
    JSON.stringify({ dueQueue: queue, credit }, null, 2),
    "```",
    "",
  );
}

const out = [
  "# ADLE Slice 4 — Evidence Report Samples (owner QA artefact)",
  "",
  "Generated 2026-07-05 by `scripts/adle-evidence-report-samples.ts` from",
  "fixtures through the real Slice 4 modules (`evidence-policy`,",
  "`evidence-pricing`, `word-evidence-state`, `authentic-use`, `slippage`)",
  "— no DB access. Policy: `" + policy.evidencePolicyVersion + "`. This is the",
  "owner QA gate artefact (Slice 4 plan, implementation-order step 9):",
  "sign-off here authorizes DB-mode bridge/scan applies.",
  "",
  "Ladder-figure note for the owner: under the exact v1 pricing the clean",
  "1/3/7/14/28/56 run prices to **6.75**, not the ~5.75 in the blueprint",
  "amendment item 7's parenthetical (which under-adds its own sequence; the",
  "approved simulation's credit() arithmetic reproduces 6.75). The protected",
  "property — clean ladder < 8, retirement alone never masters — holds with",
  "margin and is regression-pinned. A figure-correction amendment is",
  "suggested at closeout.",
  "",
  "## Fixture Child A",
  "",
  sections[0],
  sections[1],
  sections[2],
  sections[3],
  "## Fixture Child B",
  "",
  sections[4],
  ...creditSection,
].join("\n");

const outPath = resolve("docs/implementation/adle-slice-4-evidence-report-samples-2026-07-05.md");
writeFileSync(outPath, out + "\n");
console.log(`wrote ${outPath}`);
