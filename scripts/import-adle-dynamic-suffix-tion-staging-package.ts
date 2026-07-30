import { runDynamicSuffixStagingImport } from "./lib/adle-dynamic-suffix-staging-import";

runDynamicSuffixStagingImport({
  profileKey: "D4_MOR_SUFFIXES_TION",
  packagePath: "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-29-dynamic-suffix-tion/reviewed-staging-package.json",
  sourceFolder: "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-29-dynamic-suffix-tion",
  validatorVersion: "adle_dynamic_suffix_tion_staging_import_v1",
  stagingProjectRef: "jlhotktspjvffslvuyfz",
  displayName: "-tion",
  expectedWords: ["action", "invention", "education", "celebration"],
  expectedMeaningStatement: "The suffix -tion usually means the action, process or result of.",
  requireReviewedFacts: true,
}).catch((error) => { console.error(error); process.exitCode = 1; });
