import { runDynamicSuffixStagingImport } from "./lib/adle-dynamic-suffix-staging-import";

runDynamicSuffixStagingImport({
  profileKey: "D4_MOR_SUFFIXES_ITY",
  packagePath: "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-28-dynamic-suffix-ity/reviewed-staging-package.json",
  sourceFolder: "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-28-dynamic-suffix-ity",
  validatorVersion: "adle_dynamic_suffix_ity_staging_import_v1",
  stagingProjectRef: "jlhotktspjvffslvuyfz",
  displayName: "-ity",
  expectedWords: ["equality", "possibility", "responsibility", "curiosity"],
  expectedMeaningStatement: "-ity turns a describing word into the name of a quality or state.",
  requireReviewedFacts: true,
}).catch((error) => { console.error(error); process.exitCode = 1; });
