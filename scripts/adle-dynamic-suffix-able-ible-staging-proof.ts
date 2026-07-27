import { runDynamicSuffixStagingProof } from "./lib/adle-dynamic-suffix-staging-proof";

runDynamicSuffixStagingProof({
  profileKey: "D4_MOR_SUFFIXES_ABLE_IBLE",
  slug: "able-ible",
  childName: "ADLE Able Ible Proof",
  targetWord: "comfortable",
  sourceAttemptText: "comftable",
  reflectionKey: "able-ible-base-test-v1",
  statePath: ".tmp/adle-dynamic-suffix-able-ible-proof/state.json",
  stagingHost: "jlhotktspjvffslvuyfz.supabase.co",
});
