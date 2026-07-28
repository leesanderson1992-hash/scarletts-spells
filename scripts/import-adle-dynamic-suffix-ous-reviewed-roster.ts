/**
 * Controlled future intake for -ous members. The submitted package must be a
 * complete, human-reviewed roster; words are never inferred from their ending.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runDynamicSuffixStagingImport } from "./lib/adle-dynamic-suffix-staging-import";

const packageArgument = process.argv[process.argv.indexOf("--package") + 1];
if (!packageArgument) throw new Error("Use --package <reviewed-roster-package.json>.");
const packagePath = resolve(packageArgument);
const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
if (pkg.profile?.microSkillKey !== "D4_MOR_SUFFIXES_OUS") throw new Error("The reviewed roster must be for D4_MOR_SUFFIXES_OUS.");

runDynamicSuffixStagingImport({
  profileKey: "D4_MOR_SUFFIXES_OUS",
  packagePath,
  sourceFolder: dirname(packagePath),
  validatorVersion: "adle_dynamic_suffix_ous_reviewed_roster_v1",
  stagingProjectRef: "jlhotktspjvffslvuyfz",
  displayName: "-ous reviewed roster",
  minimumMemberCount: 4,
  expectedMeaningStatement: "-ous turns a naming word into a describing word meaning “full of” or “having.”",
  requireReviewedFacts: true,
}).catch((error) => { console.error(error); process.exitCode = 1; });
