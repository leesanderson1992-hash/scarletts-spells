import { runDynamicSuffixStagingImport } from "./lib/adle-dynamic-suffix-staging-import";

runDynamicSuffixStagingImport({
  profileKey: "D4_MOR_SUFFIXES_SION",
  packagePath: "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-29-dynamic-suffix-sion/reviewed-staging-package.json",
  sourceFolder: "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-29-dynamic-suffix-sion",
  validatorVersion: "adle_dynamic_suffix_sion_staging_import_v1",
  stagingProjectRef: "jlhotktspjvffslvuyfz",
  displayName: "-sion",
  expectedWords: ["decision", "division", "confusion", "expansion"],
  expectedMeaningStatement: "-sion turns an action into the name of the action or result.",
  requireReviewedFacts: true,
}).catch((error) => { console.error(error); process.exitCode = 1; });
