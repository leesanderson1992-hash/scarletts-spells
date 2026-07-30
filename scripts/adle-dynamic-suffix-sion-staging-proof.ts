import { runDynamicSuffixStagingProof } from "./lib/adle-dynamic-suffix-staging-proof";

runDynamicSuffixStagingProof({
  profileKey: "D4_MOR_SUFFIXES_SION",
  slug: "sion",
  childName: "ADLE -sion Proof",
  targetWord: "decision",
  sourceAttemptText: "decishun",
  reflectionKey: "sion-action-result-v1",
  statePath: ".tmp/adle-dynamic-suffix-sion-proof/state.json",
  stagingHost: "jlhotktspjvffslvuyfz.supabase.co",
});
