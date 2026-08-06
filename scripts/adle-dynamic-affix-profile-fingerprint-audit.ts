/** Read-only environment audit; it has no mutation methods or fixture paths. */
import assert from "node:assert/strict";

import { createClient } from "@supabase/supabase-js";

import { fingerprintSnapshotValue } from "../lib/adle/composable-lesson/canonical-fingerprint";
import type { ComposedDailyPlan } from "../lib/adle/daily-assignment-composer";
import type { LearningItemFact } from "../lib/adle/learning-items";
import {
  selectDynamicAffixWordLab,
  type DynamicAffixProfile,
  type DynamicAffixWord,
} from "../lib/adle/morphology/affix-word-lab";
import { buildDynamicAffixAssignmentPlan } from "../lib/adle/morphology/dynamic-affix-assignment-plan";
import { compileDynamicAffixWordLabPayloadLegacy } from "../lib/adle/morphology/dynamic-affix-legacy-compiler";
import { dynamicAffixRuntime } from "../lib/adle/morphology/dynamic-affix-runtime";
import {
  fingerprintDynamicAffixEnvironmentIntegrityV1,
  fingerprintDynamicAffixSemanticProfilesV2,
  projectDynamicAffixSemanticSelectionV2,
} from "../lib/adle/morphology/dynamic-affix-semantic-fingerprint";
import {
  canonicalDynamicAffixPublicV3Bytes,
  compileDynamicAffixSelectionThroughSharedCompiler,
} from "../lib/adle/morphology/shared-affix-compatibility";
import { loadDynamicSuffixProfiles } from "../lib/adle/morphology/dynamic-suffix-profile-loader";

const TARGETS = {
  staging: { supabaseRef: "jlhotktspjvffslvuyfz", vercelProjectId: "prj_oJkffstOtacc4juYloXajHpjJUha" },
  production: { supabaseRef: "wwohrqtunajrbwxyssjf", vercelProjectId: "prj_PShWdOn82RyJ4P6BND0DBZ1TSIEl" },
} as const;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function targetEnvironment(): keyof typeof TARGETS {
  const argument = process.argv.find((entry) => entry.startsWith("--environment="));
  const value = argument?.split("=")[1];
  if (value !== "staging" && value !== "production") {
    throw new Error("Use --environment=staging or --environment=production");
  }
  return value;
}

function permutations<T>(values: readonly T[], count: number, prefix: T[] = []): T[][] {
  if (prefix.length === count) return [prefix];
  return values.flatMap((value) => prefix.includes(value)
    ? []
    : permutations(values, count, [...prefix, value]));
}

function item(profile: DynamicAffixProfile, word: DynamicAffixWord, index: number): LearningItemFact {
  return {
    learningItemId: `semantic-audit:${word.displayWord}:${index}`,
    childId: "00000000-0000-0000-0000-000000000000",
    canonicalWordId: word.canonicalWordId,
    microSkillKey: profile.microSkillKey,
    itemStatus: "pending",
    sourceKind: "verified_misspelling",
    sourceRef: "read-only-semantic-audit",
    sourceAttemptText: null,
    reteachPriority: false,
    ejectedOn: null,
    intakeOn: `2026-08-${String(index + 1).padStart(2, "0")}`,
    rowStatus: "active",
  };
}

const basePlan = {
  childId: "00000000-0000-0000-0000-000000000000",
  planDate: "2026-08-06",
  composerPolicyVersion: "semantic-audit",
  schedulePolicyVersion: "semantic-audit",
  throttle: {}, partOne: {}, partTwo: {},
  budget: { budgetResponses: 0, estimatedResponses: 0, guidedWordCount: 0, introTrimmed: false, trims: [] },
} as unknown as ComposedDailyPlan;

async function main() {
  const environment = targetEnvironment();
  const target = TARGETS[environment];
  const url = new URL(required("NEXT_PUBLIC_SUPABASE_URL"));
  assert.equal(url.hostname, `${target.supabaseRef}.supabase.co`, "Supabase identity");
  const serviceRoleKey = process.env.SB_SERVICE_ROLE_KEY || required("SUPABASE_SERVICE_ROLE_KEY");
  const db = createClient(url.toString(), serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const loaded = await loadDynamicSuffixProfiles(
    db,
    "00000000-0000-0000-0000-000000000000",
    { allowStagingProfiles: environment === "staging" },
  );
  const { data: rawIdentityRows, error: rawIdentityError } = await db
    .from("canonical_teaching_dictionary_suffix_profiles")
    .select("id,micro_skill_key,canonical_teaching_dictionary_suffix_members(id,canonical_word_id)")
    .in("micro_skill_key", loaded.profiles.map((profile) => profile.microSkillKey))
    .eq("row_status", "active")
    .eq("review_status", "approved_for_first_exposure");
  if (rawIdentityError) throw new Error(`Raw integrity identity: ${rawIdentityError.message}`);
  const rawProjection = loaded.profiles.map((profile) => ({
    profileKey: profile.microSkillKey,
    productionEnabled: profile.productionEnabled,
    memberIds: [...profile.wordsByCanonicalId.keys()],
    memberWords: [...profile.wordsByCanonicalId.values()].map((word) => word.displayWord),
  }));
  const profileCount = loaded.profiles.length;
  const memberCount = loaded.profiles.reduce((count, profile) => count + profile.wordsByCanonicalId.size, 0);
  assert.equal(profileCount, 10);
  assert.equal(memberCount, 40);
  assert.deepEqual(loaded.diagnostics, []);

  const selections: unknown[] = [];
  let exactCompilerParity = 0;
  let exactPlanRuntimeCases = 0;
  for (const profile of [...loaded.profiles].sort((left, right) => left.microSkillKey.localeCompare(right.microSkillKey))) {
    const words = [...profile.wordsByCanonicalId.values()]
      .sort((left, right) => left.displayWord.localeCompare(right.displayWord))
      .slice(0, 4);
    assert.equal(words.length, 4, `${profile.microSkillKey}: four-member ordered regression basis`);
    for (const authenticCount of [1, 2, 3, 4]) {
      for (const authentic of permutations(words, authenticCount)) {
        const selection = selectDynamicAffixWordLab({
          profiles: [profile],
          learningItems: authentic.map((word, index) => item(profile, word, index)),
        });
        assert(selection, `${profile.microSkillKey}: selection`);
        const legacy = compileDynamicAffixWordLabPayloadLegacy(selection);
        const shared = compileDynamicAffixSelectionThroughSharedCompiler(selection, "teaching_dictionary");
        assert(legacy && shared.ok, `${profile.microSkillKey}: compilation`);
        assert.equal(canonicalDynamicAffixPublicV3Bytes(legacy), canonicalDynamicAffixPublicV3Bytes(shared.payload));
        const plan = buildDynamicAffixAssignmentPlan({ basePlan, selection, payload: legacy });
        assert(dynamicAffixRuntime(legacy));
        assert.equal(plan.partTwo.sections.flatMap((section) => section.items).length, profile.includeMeaningSort ? 18 : 16);
        selections.push(projectDynamicAffixSemanticSelectionV2(selection));
        exactCompilerParity += 1;
        exactPlanRuntimeCases += 1;
      }
    }
  }
  assert.equal(selections.length, 640);
  console.log(JSON.stringify({
    status: "passed",
    mode: "read_only",
    environment,
    identities: { supabaseRef: target.supabaseRef, vercelProjectId: target.vercelProjectId },
    profileCount,
    memberCount,
    diagnostics: loaded.diagnostics,
    legacyRawProfileFingerprint: fingerprintSnapshotValue(rawProjection),
    environmentIntegrityFingerprint: fingerprintDynamicAffixEnvironmentIntegrityV1(loaded.profiles, {
      projectIdentity: target.supabaseRef,
      rawProfileAndMemberIdentity: rawIdentityRows ?? [],
    }),
    semanticProfileFingerprintV2: fingerprintDynamicAffixSemanticProfilesV2(loaded.profiles),
    orderedSelectionSemanticFingerprintV2: fingerprintSnapshotValue(selections),
    orderedSelectionCases: selections.length,
    exactCompilerParity,
    exactPlanRuntimeCases,
    mutationPerformed: false,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
