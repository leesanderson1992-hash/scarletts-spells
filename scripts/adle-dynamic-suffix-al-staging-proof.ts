import { runDynamicSuffixStagingProof } from "./lib/adle-dynamic-suffix-staging-proof";

runDynamicSuffixStagingProof({
  profileKey: "D4_MOR_SUFFIXES_AL",
  slug: "al",
  childName: "ADLE Al Proof",
  targetWord: "musical",
  sourceAttemptText: "musicel",
  reflectionKey: "al-connected-with-v1",
  statePath: ".tmp/adle-dynamic-suffix-al-proof/state.json",
  stagingHost: "jlhotktspjvffslvuyfz.supabase.co",
});
