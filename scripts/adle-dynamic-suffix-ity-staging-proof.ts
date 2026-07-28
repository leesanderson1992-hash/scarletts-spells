import { runDynamicSuffixStagingProof } from "./lib/adle-dynamic-suffix-staging-proof";

runDynamicSuffixStagingProof({
  profileKey: "D4_MOR_SUFFIXES_ITY",
  slug: "ity",
  childName: "ADLE -ity Proof",
  targetWord: "equality",
  sourceAttemptText: "equalty",
  reflectionKey: "ity-quality-state-v1",
  statePath: ".tmp/adle-dynamic-suffix-ity-proof/state.json",
  stagingHost: "jlhotktspjvffslvuyfz.supabase.co",
});
