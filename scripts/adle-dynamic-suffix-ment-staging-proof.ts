import { runDynamicSuffixStagingProof } from "./lib/adle-dynamic-suffix-staging-proof";

runDynamicSuffixStagingProof({
  profileKey: "D4_MOR_SUFFIXES_MENT",
  slug: "ment",
  childName: "ADLE Ment Proof",
  targetWord: "enjoyment",
  sourceAttemptText: "enjoymant",
  reflectionKey: "ment-base-preservation-v1",
  statePath: ".tmp/adle-dynamic-suffix-ment-proof/state.json",
  stagingHost: "jlhotktspjvffslvuyfz.supabase.co",
});
