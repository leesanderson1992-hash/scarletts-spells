import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  canonicalWordSkillPair,
  evaluateCanonicalIntakeReadiness,
  type CanonicalIntakeReadinessFacts,
} from "../lib/adle/canonical-intake";
import {
  parseApprovalGovernedOccurrenceSources,
  parseAuthorizedCandidateMappingIds,
  R8C_AWAITING_HANDOFF_STATE,
} from "../lib/adle/canonical-intake/exact-id-handoff";

const COMPOUND = "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS";
const PREFIX = "D4_MOR_PREFIXES_RE_PRE";
const rows = [
  {
    writing_issue_id: "10000000-0000-4000-8000-000000000101",
    source_misspelling_instance_id: "10000000-0000-4000-8000-000000000201",
    candidate_mapping_id: "10000000-0000-4000-8000-000000000301",
    misspelling_normalized: "futball",
    correct_spelling_normalized: "football",
    micro_skill_key: COMPOUND,
    candidate_status: "parent_local_promoted",
    canonical_intake_handoff_state: R8C_AWAITING_HANDOFF_STATE,
  },
  {
    writing_issue_id: "10000000-0000-4000-8000-000000000102",
    source_misspelling_instance_id: "10000000-0000-4000-8000-000000000202",
    candidate_mapping_id: "10000000-0000-4000-8000-000000000302",
    misspelling_normalized: "ranebow",
    correct_spelling_normalized: "rainbow",
    micro_skill_key: COMPOUND,
    candidate_status: "parent_local_promoted",
    canonical_intake_handoff_state: null,
  },
  {
    writing_issue_id: "10000000-0000-4000-8000-000000000103",
    source_misspelling_instance_id: "10000000-0000-4000-8000-000000000203",
    candidate_mapping_id: "10000000-0000-4000-8000-000000000303",
    misspelling_normalized: "riplay",
    correct_spelling_normalized: "replay",
    micro_skill_key: PREFIX,
    candidate_status: "parent_local_promoted",
    canonical_intake_handoff_state: null,
  },
  {
    writing_issue_id: "10000000-0000-4000-8000-000000000104",
    source_misspelling_instance_id: "10000000-0000-4000-8000-000000000204",
    candidate_mapping_id: "10000000-0000-4000-8000-000000000304",
    misspelling_normalized: "rinew",
    correct_spelling_normalized: "renew",
    micro_skill_key: PREFIX,
    candidate_status: "parent_local_promoted",
    canonical_intake_handoff_state: R8C_AWAITING_HANDOFF_STATE,
  },
] as const;

const governed = parseApprovalGovernedOccurrenceSources({
  governed_occurrence_sources: rows,
});
assert.equal(governed.length, 4);
assert.equal(new Set(governed.map((source) => source.candidateMappingId)).size, 4);
assert.equal(
  new Set(governed.map((source) => source.sourceMisspellingInstanceId)).size,
  4,
);
assert.equal(new Set(governed.map((source) => source.microSkillKey)).size, 2);

const exactIds = governed.map((source) => source.candidateMappingId);
assert.deepEqual(
  parseAuthorizedCandidateMappingIds(
    { candidate_mapping_ids: [...exactIds].reverse() },
    exactIds,
  ),
  [...exactIds].sort(),
);
assert.throws(
  () =>
    parseAuthorizedCandidateMappingIds(
      { candidate_mapping_ids: exactIds.slice(0, 3) },
      exactIds,
    ),
  /changed the exact candidate ID set/,
);
assert.throws(
  () =>
    parseApprovalGovernedOccurrenceSources({
      governed_occurrence_sources: [rows[0], rows[0]],
    }),
  /duplicate identity/,
);
assert.throws(
  () =>
    parseApprovalGovernedOccurrenceSources({
      governed_occurrence_sources: [
        { ...rows[0], candidate_status: "superseded" },
      ],
    }),
  /not intake-compatible/,
);

const unrelatedSameSubmissionCandidateId =
  "30000000-0000-4000-8000-000000000301";
assert.equal(exactIds.includes(unrelatedSameSubmissionCandidateId), false);
const approvalSubset = parseApprovalGovernedOccurrenceSources({
  governed_occurrence_sources: [rows[0], rows[2]],
});
assert.deepEqual(
  approvalSubset.map((source) => source.candidateMappingId),
  [rows[0].candidate_mapping_id, rows[2].candidate_mapping_id],
  "an approval result containing only A/C remains A/C",
);

const outcomes = governed.map((source) => {
  const ready = source.correctSpellingNormalized !== "renew";
  const canonicalWordId = ready
    ? `40000000-0000-4000-8000-${String(
        governed.indexOf(source) + 1,
      ).padStart(12, "0")}`
    : null;
  const facts: CanonicalIntakeReadinessFacts = {
    candidate: {
      candidateMappingId: source.candidateMappingId,
      parentUserId: "10000000-0000-4000-8000-000000000001",
      childId: "10000000-0000-4000-8000-000000000002",
      misspellingNormalized: source.misspellingNormalized,
      correctSpellingNormalized: source.correctSpellingNormalized,
      microSkillKey: source.microSkillKey,
      candidateStatus: source.candidateStatus,
      verifiedOn: "2026-08-28",
    },
    canonicalMappings: [
      {
        mappingId: `50000000-0000-4000-8000-${String(
          governed.indexOf(source) + 1,
        ).padStart(12, "0")}`,
        misspellingNormalized: source.misspellingNormalized,
        correctSpellingNormalized: source.correctSpellingNormalized,
        microSkillKey: source.microSkillKey,
        mappingStatus: "active",
        resolverVisibilityStatus: "visible",
        hasVisibilityEnableEvent: true,
      },
    ],
    words: canonicalWordId
      ? [
          {
            canonicalWordId,
            normalisedWord: source.correctSpellingNormalized,
            rowStatus: "active",
            reviewStatus: "approved_for_first_exposure",
            frequencyBand: "high",
            ageBand: "middle_primary",
          },
        ]
      : [],
    microSkills: [
      {
        microSkillKey: source.microSkillKey,
        masteryDomainKey: "D4",
        skillClusterKey: source.microSkillKey.startsWith("D4_MOR_PREFIXES")
          ? "D4_MOR_PREFIXES"
          : "D4_MOR_COMPOUND_WORDS",
        isActive: true,
        isAssignable: true,
      },
    ],
    supports: [],
    contentVersions: [],
    productionEnabledSkillKeys: new Set([source.microSkillKey]),
    routeSpecificReadyWordSkillPairs: canonicalWordId
      ? new Set([canonicalWordSkillPair(canonicalWordId, source.microSkillKey)])
      : new Set(),
    routeReadiness: canonicalWordId
      ? [
          {
            canonicalWordId,
            microSkillKey: source.microSkillKey,
            ready: true,
            blockers: [],
            ...(source.microSkillKey === COMPOUND
              ? {
                  curriculumRelease: {
                    releaseManifestId: "r8c-compound-release-manifest",
                    releaseKey: "r8c-compound-release",
                    releaseManifestSha256: "r8c-fixture-sha256",
                    dependencyFingerprint: "r8c-fixture-dependencies",
                  },
                }
              : {}),
          },
        ]
      : [],
    allowedFrequencyBands: new Set(["high"]),
    allowedAgeBands: new Set(["middle_primary"]),
  };
  return {
    word: source.correctSpellingNormalized,
    outcome: evaluateCanonicalIntakeReadiness(facts),
  };
});

for (const word of ["football", "rainbow", "replay"]) {
  assert.equal(
    outcomes.find((entry) => entry.word === word)?.outcome.status,
    "ready",
  );
}
const renew = outcomes.find((entry) => entry.word === "renew")?.outcome;
assert.equal(renew?.status, "blocked");
if (renew?.status !== "blocked") throw new Error("renew must be blocked");
assert.equal(renew.candidateState, "pending_content");
assert.equal(renew.blockers[0]?.code, "canonical_word_missing");

const reviewAction = readFileSync(
  "app/courses/review/actions/review-completion-actions.ts",
  "utf8",
);
const liveLoader = readFileSync(
  "lib/adle/loaders/canonical-intake-live.ts",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20260828130000_authorize_exact_id_canonical_intake_handoff.sql",
  "utf8",
);
assert.match(
  reviewAction,
  /parseApprovalGovernedOccurrenceSources\(approvalResult\)[\s\S]*intakeApprovedExactSubmissionCorrections\([\s\S]*candidateMappingIds: governedSources\.map/,
);
assert.doesNotMatch(reviewAction, /intakeApprovedSubmissionCorrections\(/);
assert.match(
  liveLoader,
  /adle_authorize_parent_approval_exact_id_handoff[\s\S]*requireExactCandidateMappingIds: true/,
);
assert.match(
  liveLoader,
  /Canonical intake did not load the exact governed candidate ID set/,
);
assert.match(
  liveLoader,
  /if \(!params\.requireExactCandidateMappingIds\)[\s\S]*candidateQuery = params\.submissionId/,
  "exact-ID mode must not discard task-thread sources anchored to an earlier submission",
);
assert.match(
  migration,
  /revoke all on function public\.adle_authorize_parent_approval_exact_id_handoff\([\s\S]*authenticated[\s\S]*grant execute[\s\S]*service_role/,
);

console.log(
  "r8c-exact-id-handoff-regression: 4 exact IDs, 2 teaching groups, 3 READY, 1 canonical_word_missing, no submission inference",
);
