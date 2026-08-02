/* Select-only proof rows are narrowed by the unchanged production loaders. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { fingerprintSnapshotValue } from "../lib/adle/composable-lesson/canonical-fingerprint";
import type { ComposedDailyPlan, DailyPlanFacts } from "../lib/adle/daily-assignment-composer";
import type { LearningItemFact } from "../lib/adle/learning-items";
import {
  compileDynamicAffixWordLabPayload,
  selectDynamicAffixWordLab,
  validateDynamicAffixWordLabPayload,
  type DynamicAffixProfile,
} from "../lib/adle/morphology/affix-word-lab";
import { buildDynamicAffixAssignmentPlan } from "../lib/adle/morphology/dynamic-affix-assignment-plan";
import { dynamicAffixRuntime } from "../lib/adle/morphology/dynamic-affix-runtime";
import { buildDynamicPrefixAssignmentPlan } from "../lib/adle/morphology/dynamic-prefix-assignment-plan";
import { loadDynamicPrefixProfiles } from "../lib/adle/morphology/dynamic-prefix-profile-loader";
import {
  compileDynamicPrefixWordLabPayload,
  selectDynamicPrefixWordLab,
  validateDynamicPrefixWordLabPayload,
  type DynamicPrefixProfile,
} from "../lib/adle/morphology/dynamic-prefix-word-lab";
import { dynamicPrefixRuntime } from "../lib/adle/morphology/dynamic-prefix-runtime";
import { loadDynamicSuffixProfiles } from "../lib/adle/morphology/dynamic-suffix-profile-loader";
import {
  compareSharedAffixPayloadParity,
  compileDynamicAffixSelectionThroughSharedCompiler,
  compileDynamicPrefixSelectionThroughSharedCompiler,
} from "../lib/adle/morphology/shared-affix-compatibility";
import { SHARED_AFFIX_PROFILE_REGISTRY } from "../lib/adle/morphology/shared-affix-profile-registry";

const STAGING_HOST = "jlhotktspjvffslvuyfz.supabase.co";
const STAGING_REF = "jlhotktspjvffslvuyfz";
const PRODUCTION_HOST = "wwohrqtunajrbwxyssjf.supabase.co";
const CONFIRMATION = "ADLE-SHARED-AFFIX-SELECT-ONLY-STAGING-V1";
const DEFAULT_RECEIPT = "docs/implementation/qa/adle-shared-affix-staging-proof-2026-08-01.json";
const FIXTURE_CHILD_ID = "00000000-0000-4000-8000-000000000001";

function required(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`Missing one of: ${names.join(", ")}`);
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function assertStagingUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.host === PRODUCTION_HOST || url.host !== STAGING_HOST || !url.host.startsWith(`${STAGING_REF}.`)) {
    throw new Error("Refusing every project except the pinned Scarlett's Spells staging project");
  }
  return url;
}

function productionRejectionVerified() {
  try {
    assertStagingUrl(`https://${PRODUCTION_HOST}`);
    return false;
  } catch {
    return true;
  }
}

function proofItems(profileKey: string, wordIds: readonly string[], targetId: string, targetSlot: number): LearningItemFact[] {
  const companions = wordIds.filter((id) => id !== targetId).slice(0, 3);
  assert(companions.length === 3, "Every staging profile needs three valid authentic companions");
  const ordered = [...companions];
  ordered.splice(targetSlot, 0, targetId);
  return ordered.map((canonicalWordId, index) => ({
    learningItemId: `select-only:${profileKey}:${targetSlot}:${index}`,
    childId: FIXTURE_CHILD_ID,
    canonicalWordId,
    microSkillKey: profileKey,
    itemStatus: "pending",
    sourceKind: "verified_misspelling",
    sourceRef: "select-only-staging-proof",
    sourceAttemptText: null,
    reteachPriority: false,
    ejectedOn: null,
    intakeOn: `2026-08-0${index + 1}`,
    rowStatus: "active",
  }));
}

const basePlan = {
  childId: FIXTURE_CHILD_ID,
  planDate: "2026-08-01",
  composerPolicyVersion: "unchanged-select-only-proof",
  schedulePolicyVersion: "unchanged-select-only-proof",
  throttle: {},
  partOne: {},
  partTwo: {},
  budget: { budgetResponses: 0, estimatedResponses: 0, guidedWordCount: 0, introTrimmed: false, trims: [] },
} as unknown as ComposedDailyPlan;

function bindingView(plan: ComposedDailyPlan) {
  return plan.partTwo.sections.flatMap((section) => section.items).map((item) => {
    const payload = item.payload as Record<string, unknown>;
    return {
      activityId: payload.dynamicPrefixActivityId ?? payload.dynamicAffixActivityId,
      sectionKey: item.sectionKey,
      templateKey: item.templateKey,
      canonicalWordId: item.canonicalWordId,
      expectedEvidenceKind: item.expectedEvidenceKind,
    };
  });
}

const UN_WORDS = [
  { wordKey: "unhappy_en_gb", baseWord: "happy", baseMeaning: "feeling pleased", derivedMeaning: "not happy", effect: "not" },
  { wordKey: "unfair_en_gb", baseWord: "fair", baseMeaning: "fair and equal", derivedMeaning: "not fair", effect: "not" },
  { wordKey: "unkind_en_gb", baseWord: "kind", baseMeaning: "caring and helpful", derivedMeaning: "not kind", effect: "not" },
  { wordKey: "unlock_en_gb", baseWord: "lock", baseMeaning: "close with a lock", derivedMeaning: "reverse the lock", effect: "reverse" },
  { wordKey: "untidy_en_gb", baseWord: "tidy", baseMeaning: "neat and ordered", derivedMeaning: "not tidy", effect: "not" },
  { wordKey: "unnatural_en_gb", baseWord: "natural", baseMeaning: "found in nature", derivedMeaning: "not natural", effect: "not" },
  { wordKey: "unnecessary_en_gb", baseWord: "necessary", baseMeaning: "needed", derivedMeaning: "not necessary", effect: "not" },
] as const;

async function loadReviewedStagingUnProfile(db: SupabaseClient): Promise<DynamicPrefixProfile> {
  const { data, error } = await db.from("canonical_teaching_dictionary_words")
    .select("id,word_key,display_word,row_status,review_status,canonical_teaching_dictionary_dictation_sentences!inner(dictation_sentence,dictation_target_token_index,audio_text,row_status,review_status)")
    .in("word_key", UN_WORDS.map((word) => word.wordKey));
  if (error) throw new Error("Select-only UN dictionary read failed");
  assert(data?.length === UN_WORDS.length, "Expected seven reviewed staging UN words");
  const byKey = new Map(data.map((word: any) => [word.word_key, word]));
  const words = UN_WORDS.map((definition) => {
    const word: any = byKey.get(definition.wordKey);
    const dictations = word?.canonical_teaching_dictionary_dictation_sentences?.filter((entry: any) => entry.row_status === "active" && entry.review_status === "approved_for_first_exposure");
    assert(word?.row_status === "active" && word.review_status === "approved_for_first_exposure" && dictations?.length === 1, "UN reviewed staging facts are incomplete");
    const dictation = dictations[0];
    return {
      canonicalWordId: word.id,
      displayWord: word.display_word,
      audioText: dictation.audio_text,
      baseWord: definition.baseWord,
      teachingBuildText: definition.baseWord,
      baseMeaning: definition.baseMeaning,
      derivedMeaning: definition.derivedMeaning,
      effect: definition.effect,
      parts: [
        { id: `${word.id}:prefix`, text: "un", sourceText: "un", role: "prefix" as const, gloss: definition.effect === "reverse" ? "opposite of" : "not", start: 0, end: 2 },
        { id: `${word.id}:base`, text: definition.baseWord, sourceText: definition.baseWord, role: "base" as const, start: 2, end: word.display_word.length },
      ],
      joins: [{ afterPartId: `${word.id}:prefix`, beforePartId: `${word.id}:base`, joinType: "none" as const }],
      splitPoints: [2],
      dictationSentence: dictation.dictation_sentence,
      dictationTargetTokenIndex: dictation.dictation_target_token_index,
      prefixText: "un",
      prefixLabel: "un-",
      prefixMeaning: definition.effect === "reverse" ? "opposite of" : "not",
      approvedTransfer: true,
    };
  });
  return {
    microSkillKey: "D4_MOR_PREFIXES_UN",
    productionEnabled: true,
    prefixLabel: "un-",
    prefixText: "un",
    prefixMeaning: "not or the opposite of",
    meaningBins: [
      { id: "not", label: "NOT", description: "not" },
      { id: "reverse", label: "REVERSE", description: "reverse" },
    ],
    wordsByCanonicalId: new Map(words.map((word) => [word.canonicalWordId, word])),
    transferCanonicalWordIds: words.map((word) => word.canonicalWordId),
    prefixChoices: [
      { text: "un", label: "un-", outcome: "correct", meaning: "not or the opposite of", status: "target" },
      { text: "re", label: "re-", outcome: null, meaning: "again", status: "valid_alternative" },
      { text: "", label: "no prefix", outcome: null, meaning: null, status: "unsupported" },
    ],
    reflection: { promptKey: "dynamic-prefix-un-observation-v2", promptText: "What did un- do to the meaning of each word?" },
  };
}

async function main() {
  assert(process.argv.includes(CONFIRMATION), `Pass ${CONFIRMATION} to acknowledge the select-only staging proof`);
  const rawUrl = required("STAGING_SUPABASE_URL", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const stagingUrl = assertStagingUrl(rawUrl);
  const key = required("STAGING_SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SB_SERVICE_ROLE_KEY");
  let readRequests = 0;
  let remoteWriteRequests = 0;
  const guardedFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = assertStagingUrl(request.url);
    assert(url.host === stagingUrl.host, "Request escaped the pinned staging host");
    const method = request.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      remoteWriteRequests += 1;
      throw new Error(`Select-only proof rejected remote ${method}`);
    }
    readRequests += 1;
    return fetch(request);
  };
  const db = createClient(stagingUrl.toString(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: guardedFetch },
  });
  const [prefixLoaded, affixLoaded] = await Promise.all([
    loadDynamicPrefixProfiles(db, FIXTURE_CHILD_ID, { allowStagingProfiles: true }),
    loadDynamicSuffixProfiles(db, FIXTURE_CHILD_ID, { allowStagingProfiles: true }),
  ]);
  assert(prefixLoaded.learningItems.length === 0 && affixLoaded.learningItems.length === 0, "Synthetic child ID unexpectedly has learner rows");
  const prefixProfiles = [await loadReviewedStagingUnProfile(db), ...prefixLoaded.profiles];
  assert(prefixProfiles.length === 5, `Expected five staging Prefix profiles, received ${prefixProfiles.length}; loaded hashes=${prefixProfiles.map((profile) => fingerprintSnapshotValue(profile.microSkillKey)).sort().join(",")}`);
  assert(affixLoaded.profiles.length === 10, `Expected ten staging Affix profiles, received ${affixLoaded.profiles.length}`);
  const liveProfileKeys = [...prefixProfiles, ...affixLoaded.profiles].map((profile) => profile.microSkillKey).sort();
  assert(
    JSON.stringify(liveProfileKeys) === JSON.stringify(SHARED_AFFIX_PROFILE_REGISTRY.map((profile) => profile.microSkillKey).sort()),
    "Staging profiles and shared declarative registry disagree",
  );

  const lessonFingerprints: string[] = [];
  const profileSummaries: Array<{ profileHash: string; eligibleWordCount: number; authenticSlotCases: number }> = [];
  let eligibleWordCount = 0;
  let authenticSlotCases = 0;

  for (const profile of prefixProfiles) {
    const wordIds = [...profile.wordsByCanonicalId.keys()];
    let profileCases = 0;
    for (const targetId of wordIds) {
      for (const targetSlot of [0, 1, 2, 3]) {
        const selection = selectDynamicPrefixWordLab({ profiles: [profile], learningItems: proofItems(profile.microSkillKey, wordIds, targetId, targetSlot) });
        assert(selection && selection.authenticTargets[targetSlot]?.canonicalWordId === targetId, "Prefix selector changed authentic slot order");
        const authoritative = compileDynamicPrefixWordLabPayload(selection);
        assert(authoritative && validateDynamicPrefixWordLabPayload(authoritative), "Authoritative Prefix V2 compilation failed");
        const shadow = compileDynamicPrefixSelectionThroughSharedCompiler(selection, "teaching_dictionary");
        assert(shadow.ok, `Shared Prefix compilation blocked: ${shadow.ok ? "" : JSON.stringify(shadow.blockers)}`);
        assert(compareSharedAffixPayloadParity(authoritative, shadow.payload).ok, "Prefix V2 payload parity failed");
        assert(dynamicPrefixRuntime(authoritative) && dynamicPrefixRuntime(shadow.payload), "Prefix runtime reconstruction failed");
        const plan = buildDynamicPrefixAssignmentPlan({ basePlan, facts: {} as DailyPlanFacts, selection, payload: authoritative });
        assert(JSON.stringify(bindingView(plan)) === JSON.stringify(shadow.lesson.assignmentBindings), "Prefix assignment bindings changed");
        lessonFingerprints.push(shadow.lesson.fingerprint);
        authenticSlotCases += 1;
        profileCases += 1;
      }
    }
    eligibleWordCount += wordIds.length;
    profileSummaries.push({ profileHash: fingerprintSnapshotValue(profile.microSkillKey), eligibleWordCount: wordIds.length, authenticSlotCases: profileCases });
  }

  for (const profile of affixLoaded.profiles as DynamicAffixProfile[]) {
    const wordIds = [...profile.wordsByCanonicalId.keys()];
    let profileCases = 0;
    for (const targetId of wordIds) {
      for (const targetSlot of [0, 1, 2, 3]) {
        const selection = selectDynamicAffixWordLab({ profiles: [profile], learningItems: proofItems(profile.microSkillKey, wordIds, targetId, targetSlot) });
        assert(selection && selection.authenticTargets[targetSlot]?.canonicalWordId === targetId, "Affix selector changed authentic slot order");
        const authoritative = compileDynamicAffixWordLabPayload(selection);
        assert(authoritative && validateDynamicAffixWordLabPayload(authoritative), "Authoritative Affix V3 compilation failed");
        const shadow = compileDynamicAffixSelectionThroughSharedCompiler(selection, "teaching_dictionary");
        assert(shadow.ok, `Shared Affix compilation blocked: ${shadow.ok ? "" : JSON.stringify(shadow.blockers)}`);
        assert(compareSharedAffixPayloadParity(authoritative, shadow.payload).ok, "Affix V3 payload parity failed");
        assert(dynamicAffixRuntime(authoritative) && dynamicAffixRuntime(shadow.payload), "Affix runtime reconstruction failed");
        const plan = buildDynamicAffixAssignmentPlan({ basePlan, selection, payload: authoritative });
        assert(JSON.stringify(bindingView(plan)) === JSON.stringify(shadow.lesson.assignmentBindings), "Affix assignment bindings changed");
        lessonFingerprints.push(shadow.lesson.fingerprint);
        authenticSlotCases += 1;
        profileCases += 1;
      }
    }
    eligibleWordCount += wordIds.length;
    profileSummaries.push({ profileHash: fingerprintSnapshotValue(profile.microSkillKey), eligibleWordCount: wordIds.length, authenticSlotCases: profileCases });
  }

  assert(eligibleWordCount === 75, `Expected 75 assignment-eligible staging words, received ${eligibleWordCount}`);
  assert(authenticSlotCases === 300, `Expected 300 authentic-slot cases, received ${authenticSlotCases}`);
  assert(remoteWriteRequests === 0, "Remote writes were attempted");
  assert(productionRejectionVerified(), "Production host rejection guard failed");
  const receipt = {
    receiptVersion: "adle_shared_affix_staging_proof_v1",
    recordedOn: new Date().toISOString(),
    status: "passed",
    projectPin: {
      expectedProjectRefHash: fingerprintSnapshotValue(STAGING_REF),
      observedHostHash: fingerprintSnapshotValue(stagingUrl.host),
      productionHostRejected: true,
    },
    access: {
      mode: "select_only",
      readRequests,
      remoteWriteRequests,
      learnerRowsRead: 0,
      learnerRowsWritten: 0,
      dictionaryRowsWritten: 0,
      assignmentsCreated: 0,
    },
    coverage: {
      profileCount: profileSummaries.length,
      prefixProfileCount: prefixProfiles.length,
      affixProfileCount: affixLoaded.profiles.length,
      eligibleWordCount,
      authenticSlotsPerWord: 4,
      authenticSlotCases,
      profiles: profileSummaries.sort((left, right) => left.profileHash.localeCompare(right.profileHash)),
      aggregateLessonFingerprint: fingerprintSnapshotValue(lessonFingerprints.sort()),
    },
    parity: {
      prefixPayloadVersion: 2,
      affixPayloadVersion: 3,
      selectors: "unchanged_authoritative",
      payloads: "exact_canonical_parity",
      runtimeReconstruction: "passed",
      assignmentBindings: "passed",
      routesActivated: false,
      persistenceChanged: false,
    },
  };
  const receiptPath = process.env.ADLE_SHARED_AFFIX_RECEIPT_PATH?.trim() || DEFAULT_RECEIPT;
  mkdirSync(dirname(receiptPath), { recursive: true });
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({
    status: receipt.status,
    projectRefHash: receipt.projectPin.expectedProjectRefHash,
    productionHostRejected: receipt.projectPin.productionHostRejected,
    remoteWriteRequests: receipt.access.remoteWriteRequests,
    profileCount: receipt.coverage.profileCount,
    eligibleWordCount: receipt.coverage.eligibleWordCount,
    authenticSlotCases: receipt.coverage.authenticSlotCases,
    aggregateLessonFingerprint: receipt.coverage.aggregateLessonFingerprint,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Select-only staging proof failed");
  process.exitCode = 1;
});
