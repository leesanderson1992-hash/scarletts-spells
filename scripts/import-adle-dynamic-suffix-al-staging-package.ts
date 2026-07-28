import { runDynamicSuffixStagingImport } from "./lib/adle-dynamic-suffix-staging-import";

runDynamicSuffixStagingImport({
  profileKey: "D4_MOR_SUFFIXES_AL",
  packagePath: "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-28-dynamic-suffix-al/reviewed-staging-package.json",
  sourceFolder: "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-28-dynamic-suffix-al",
  validatorVersion: "adle_dynamic_suffix_al_staging_import_v1",
  stagingProjectRef: "jlhotktspjvffslvuyfz",
  displayName: "-al",
  expectedWords: ["musical", "national", "personal", "seasonal"],
  expectedMeaningStatement: "-al turns a naming word into a describing word meaning “connected with.”",
  requireReviewedFacts: true,
}).catch((error) => { console.error(error); process.exitCode = 1; });
