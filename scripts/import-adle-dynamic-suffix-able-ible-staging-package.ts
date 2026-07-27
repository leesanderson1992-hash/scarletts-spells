import { runDynamicSuffixStagingImport } from "./lib/adle-dynamic-suffix-staging-import";

runDynamicSuffixStagingImport({
  profileKey: "D4_MOR_SUFFIXES_ABLE_IBLE",
  packagePath: "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-27-dynamic-suffix-able-ible/reviewed-staging-package.json",
  sourceFolder: "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-27-dynamic-suffix-able-ible",
  validatorVersion: "adle_dynamic_suffix_able_ible_staging_import_v1",
  stagingProjectRef: "jlhotktspjvffslvuyfz",
  displayName: "-able/-ible",
  expectedWords: ["comfortable", "enjoyable", "possible", "visible"],
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
