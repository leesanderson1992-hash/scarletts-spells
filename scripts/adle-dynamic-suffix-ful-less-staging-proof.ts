import { runDynamicSuffixStagingProof } from "./lib/adle-dynamic-suffix-staging-proof";

runDynamicSuffixStagingProof({
  profileKey: "D4_MOR_SUFFIXES_FUL_LESS",
  slug: "ful-less",
  childName: "ADLE Ful Less Proof",
  targetWord: "careful",
  sourceAttemptText: "carefull",
  reflectionKey: "ful-less-opposite-meanings-v1",
  statePath: ".tmp/adle-dynamic-suffix-ful-less-proof/state.json",
  stagingHost: "jlhotktspjvffslvuyfz.supabase.co",
  expectedItemCount: 18,
  expectedAttemptCount: 16,
  expectedGuidedCount: 8,
});
