import { runDynamicSuffixStagingProof } from "./lib/adle-dynamic-suffix-staging-proof";

runDynamicSuffixStagingProof({
  profileKey: "D4_MOR_SUFFIXES_TION",
  slug: "tion",
  childName: "ADLE -tion Proof",
  targetWord: "invention",
  sourceAttemptText: "invenshun",
  reflectionKey: "tion-action-result-v1",
  statePath: ".tmp/adle-dynamic-suffix-tion-proof/state.json",
  stagingHost: "jlhotktspjvffslvuyfz.supabase.co",
});
