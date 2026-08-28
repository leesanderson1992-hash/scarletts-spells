import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  evaluateCanonicalIntakeReadiness,
  type CanonicalIntakeReadinessFacts,
} from "../lib/adle/canonical-intake";

const migration = readFileSync(
  "supabase/migrations/20260828160000_complete_governed_blocked_word_auto_resume.sql",
  "utf8",
);
const continuation = readFileSync(
  "lib/adle/canonical-intake/governed-source-continuation.ts",
  "utf8",
);
const replay = readFileSync(
  "scripts/returned-correction-stage-f-deferred-route-replay.ts",
  "utf8",
);
const loader = readFileSync("lib/adle/loaders/canonical-intake-live.ts", "utf8");
const dictionaryRelease = readFileSync("scripts/teaching-dictionary-release.ts", "utf8");
const prefixRelease = readFileSync("scripts/adle-dynamic-prefix-pedagogy-release.ts", "utf8");
const scheduler = readFileSync(
  "supabase/migrations/20260805070000_add_adle_canonical_intake_production_scheduler.sql",
  "utf8",
);

assert.match(
  migration,
  /materialize_resolved_stage_f_spelling_occurrence_source\([\s\S]*p_source_misspelling_instance_id uuid,[\s\S]*p_expected_parent_user_id uuid,[\s\S]*p_expected_child_id uuid/,
);
assert.match(
  migration,
  /returned_correction_stage_f_replay[\s\S]*attached_verified_route[\s\S]*admin_decision[\s\S]*dry_run_first/,
);
assert.match(
  migration,
  /decision\.previous_status = 'open'[\s\S]*decision\.new_status = v_case\.case_status[\s\S]*decision\.linked_micro_skill_key = v_issue\.micro_skill_key/,
);
assert.match(migration, /v_decision_count <> 1[\s\S]*ambiguous terminal admin route authority/);
assert.match(
  migration,
  /adle_authorize_governed_source_continuation\([\s\S]*p_candidate_mapping_id uuid,[\s\S]*p_expected_parent_user_id uuid,[\s\S]*p_expected_child_id uuid/,
);
assert.match(
  migration,
  /issue\.source_misspelling_instance_id = v_source\.source_misspelling_instance_id[\s\S]*issue\.final_classification in[\s\S]*issue\.micro_skill_key = v_source\.micro_skill_key/,
);
assert.match(
  migration,
  /source\.canonical_intake_handoff_state = 'awaiting_r8c_exact_id_handoff'[\s\S]*'r8c_exact_id_handed_off'/,
);
assert.match(
  migration,
  /adle_enqueue_existing_candidates_for_micro_skill_release[\s\S]*candidate\.micro_skill_key = p_micro_skill_key[\s\S]*adle_enqueue_canonical_intake_candidate/,
);
assert.match(migration, /ctd_transfer_profile_enqueue_canonical_intake/);
assert.match(migration, /ctd_content_release_enqueue_canonical_intake/);
assert.match(migration, /ctd_suffix_profile_enqueue_canonical_intake/);
assert.match(migration, /ctd_suffix_member_enqueue_canonical_intake/);
assert.match(migration, /adle_curriculum_dependency_enqueue_canonical_intake/);
assert.match(migration, /adle_activation_head_enqueue_canonical_intake/);
assert.doesNotMatch(
  migration,
  /create trigger[\s\S]{0,180}on public\.writing_issues/i,
  "arbitrary micro-skill updates must not trigger continuation",
);
for (const forbidden of [
  "adle_learning_items",
  "adle_learning_item_sources",
  "adle_review_schedule_words",
  "adle_review_schedule_word_routes",
  "daily_assignments",
  "assignment_items",
]) {
  assert.doesNotMatch(
    migration,
    new RegExp(`(?:insert\\s+into|update|delete\\s+from)\\s+public\\.${forbidden}`, "i"),
  );
}

assert.match(continuation, /adle_authorize_governed_source_continuation/);
assert.match(continuation, /resolveCanonicalIntakeRoute/);
assert.match(continuation, /adle_seed_canonical_intake_candidate/);
assert.doesNotMatch(continuation, /adle_persist_canonical_intake/);
assert.doesNotMatch(continuation, /normalized_target_token.*\.eq|correct_spelling.*\.eq/);
assert.match(
  replay,
  /plan\.routeSupport\.source === "admin_decision"[\s\S]*continueResolvedHistoricalOccurrence/,
);
assert.match(replay, /issue\.source_misspelling_instance_id/);
assert.match(
  replay,
  /hasAppliedGovernedAdminReplay\(issue\)[\s\S]*continueResolvedHistoricalOccurrence[\s\S]*!plan\.safeToApply/,
  "a lost response after the governed replay receipt must retry exact continuation",
);

assert.match(loader, /runCanonicalIntakeReconciliationSweep/);
assert.match(dictionaryRelease, /adle_enqueue_canonical_intake_by_target/);
assert.match(prefixRelease, /adle_enqueue_canonical_intake_by_target/);
assert.match(scheduler, /'\*\/5 \* \* \* \*'/);

const skill = "D4_IRRE_TRICKY_WORDS_COMMON_HIGH_FREQUENCY";
const wordId = "word-business";
const mapping = {
  mappingId: "mapping-business",
  misspellingNormalized: "buisness",
  correctSpellingNormalized: "business",
  microSkillKey: skill,
  mappingStatus: "active",
  resolverVisibilityStatus: "visible",
  hasVisibilityEnableEvent: true,
};

function businessFacts(): CanonicalIntakeReadinessFacts {
  return {
    candidate: {
      candidateMappingId: "source-business",
      parentUserId: "parent",
      childId: "child",
      misspellingNormalized: "buisness",
      correctSpellingNormalized: "business",
      microSkillKey: skill,
      candidateStatus: "parent_local_promoted",
      verifiedOn: "2026-08-28",
    },
    canonicalMappings: [mapping],
    words: [{
      canonicalWordId: wordId,
      normalisedWord: "business",
      rowStatus: "active",
      reviewStatus: "approved_for_first_exposure",
      frequencyBand: "high",
      ageBand: "middle_primary",
    }],
    microSkills: [{
      microSkillKey: skill,
      masteryDomainKey: "D4",
      skillClusterKey: "D4_IRRE_TRICKY_WORDS",
      isActive: true,
      isAssignable: true,
    }],
    supports: [],
    selectorProfiles: [],
    contentVersions: [],
    productionEnabledSkillKeys: new Set(),
    routeSpecificReadyWordSkillPairs: new Set(),
    allowedFrequencyBands: new Set(["high"]),
    allowedAgeBands: new Set(["middle_primary"]),
  };
}

const profileMissing = evaluateCanonicalIntakeReadiness(businessFacts());
assert.equal(profileMissing.status, "blocked");
if (profileMissing.status === "blocked") {
  assert.equal(profileMissing.blockers[0].code, "profile_not_enabled");
}

const contentMissingFacts = businessFacts();
contentMissingFacts.productionEnabledSkillKeys = new Set([skill]);
contentMissingFacts.selectorProfiles = [{
  microSkillKey: skill,
  rowStatus: "active",
  reviewStatus: "approved_for_first_exposure",
  allowedAgeBands: ["middle_primary"],
}];
const contentMissing = evaluateCanonicalIntakeReadiness(contentMissingFacts);
assert.equal(contentMissing.status, "blocked");
if (contentMissing.status === "blocked") {
  assert.equal(contentMissing.blockers[0].code, "payload_not_compilable");
  assert.equal(contentMissing.candidateState, "pending_content");
}

const allReadyFacts = structuredClone(contentMissingFacts);
allReadyFacts.productionEnabledSkillKeys = new Set([skill]);
allReadyFacts.routeSpecificReadyWordSkillPairs = new Set();
allReadyFacts.contentVersions = [{
  microSkillKey: skill,
  versionStatus: "active",
  isActive: true,
  finalReadinessReviewStatus: "signed_off",
  childFriendlyExplanation: "Business is a tricky word we learn as a whole.",
  ruleExplanation: "Use the governed word-specific explanation.",
}];
assert.equal(evaluateCanonicalIntakeReadiness(allReadyFacts).status, "ready");

const mappingMissingFacts = businessFacts();
mappingMissingFacts.canonicalMappings = [];
const mappingMissing = evaluateCanonicalIntakeReadiness(mappingMissingFacts);
assert.equal(mappingMissing.status, "blocked");
if (mappingMissing.status === "blocked") {
  assert.equal(mappingMissing.blockers[0].code, "mapping_missing");
}

const wordMissingFacts = businessFacts();
wordMissingFacts.words = [];
const wordMissing = evaluateCanonicalIntakeReadiness(wordMissingFacts);
assert.equal(wordMissing.status, "blocked");
if (wordMissing.status === "blocked") {
  assert.equal(wordMissing.blockers[0].code, "canonical_word_missing");
}

process.stdout.write(`${JSON.stringify({
  status: "PASS",
  exactOccurrenceContinuation: true,
  exactGovernedSourceContinuation: true,
  arbitraryMicroSkillTrigger: false,
  sourceCreatesCandidateNotTarget: true,
  profileMissing: "profile_not_enabled",
  profileReadyContentMissing: "payload_not_compilable",
  allReadinessComplete: "READY",
  genericProfileReleaseHook: true,
  teachingContentReleaseHook: true,
  dynamicSuffixReleaseHooks: true,
  baseAndCompoundReleaseHooks: true,
  lostResponseContinuationRetry: true,
  fiveMinuteSafetySweepPreserved: true,
}, null, 2)}\n`);
