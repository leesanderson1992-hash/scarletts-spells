import { runDynamicSuffixStagingImport } from "./lib/adle-dynamic-suffix-staging-import";

runDynamicSuffixStagingImport({
  profileKey: "D4_MOR_SUFFIXES_FUL_LESS",
  packagePath: "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-28-dynamic-suffix-ful-less/reviewed-staging-package.json",
  sourceFolder: "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-28-dynamic-suffix-ful-less",
  validatorVersion: "adle_dynamic_suffix_ful_less_staging_import_v1",
  stagingProjectRef: "jlhotktspjvffslvuyfz",
  displayName: "-ful/-less",
  expectedWords: ["careful", "careless", "hopeful", "hopeless"],
  expectedMeaningStatement: "The suffix -ful means full of or having. The suffix -less means without or not having.",
  expectedIncludeMeaningSort: true,
  expectedMeaningBinCount: 2,
  requireReviewedFacts: true,
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
