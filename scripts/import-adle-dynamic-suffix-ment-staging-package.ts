import { runDynamicSuffixStagingImport } from "./lib/adle-dynamic-suffix-staging-import";

runDynamicSuffixStagingImport({
  profileKey: "D4_MOR_SUFFIXES_MENT",
  packagePath: "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-27-dynamic-suffix-ment/reviewed-staging-package.json",
  sourceFolder: "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-27-dynamic-suffix-ment",
  validatorVersion: "adle_dynamic_suffix_ment_staging_import_v1",
  stagingProjectRef: "jlhotktspjvffslvuyfz",
  displayName: "-ment",
  expectedWords: ["enjoyment", "payment", "agreement", "movement"],
  expectedMeaningStatement: "Add -ment to a word to turn an action into a thing, process or result.",
  requireReviewedFacts: true,
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
