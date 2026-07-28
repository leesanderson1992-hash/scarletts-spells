/**
 * Controlled future intake for -ity members. The submitted package must be a
 * complete, human-reviewed roster; words are never inferred from their ending.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runDynamicSuffixStagingImport } from "./lib/adle-dynamic-suffix-staging-import";

const packageArgument = process.argv[process.argv.indexOf("--package") + 1];
if (!packageArgument) throw new Error("Use --package <reviewed-roster-package.json>.");
const packagePath = resolve(packageArgument);
const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
if (pkg.profile?.microSkillKey !== "D4_MOR_SUFFIXES_ITY") throw new Error("The reviewed roster must be for D4_MOR_SUFFIXES_ITY.");

runDynamicSuffixStagingImport({
  profileKey: "D4_MOR_SUFFIXES_ITY",
  packagePath,
  sourceFolder: dirname(packagePath),
  validatorVersion: "adle_dynamic_suffix_ity_reviewed_roster_v1",
  stagingProjectRef: "jlhotktspjvffslvuyfz",
  displayName: "-ity reviewed roster",
  minimumMemberCount: 4,
  expectedMeaningStatement: "-ity turns a describing word into the name of a quality or state.",
  requireReviewedFacts: true,
}).catch((error) => { console.error(error); process.exitCode = 1; });
