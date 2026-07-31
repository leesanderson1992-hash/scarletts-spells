import { spawnSync } from "node:child_process";

/**
 * Characterisation suite for the production ADLE paths protected by the
 * composable-lesson foundation. The listed regressions own their semantic
 * fixtures; this runner gives CI and reviewers one non-mutating parity gate.
 */
const regressions = [
  "adle-composer-regression.ts",
  "adle-composer-persistence-regression.ts",
  "adle-composer-payload-regression.ts",
  "adle-activity-registry-regression.ts",
  "adle-generic-snapshot-contract-regression.ts",
  "adle-generic-snapshot-reader-regression.ts",
  "adle-curriculum-readiness-regression.ts",
  "adle-dynamic-prefix-assignment-plan-regression.ts",
  "adle-dynamic-prefix-runtime-regression.ts",
  "adle-dynamic-prefix-word-lab-regression.ts",
  "adle-dynamic-suffix-word-lab-regression.ts",
  "adle-dynamic-suffix-ment-regression.ts",
  "adle-dynamic-suffix-ful-less-regression.ts",
  "adle-dynamic-suffix-ity-regression.ts",
  "adle-dynamic-suffix-ous-regression.ts",
  "adle-dynamic-suffix-al-regression.ts",
  "adle-dynamic-suffix-tion-regression.ts",
  "adle-dynamic-suffix-sion-regression.ts",
  "adle-closed-compound-regression.ts",
  "adle-base-word-family-selection-regression.ts",
  "adle-base-word-family-snapshot-regression.ts",
  "adle-base-word-family-session-routing-regression.ts",
  "adle-base-word-completion-boundary-regression.ts",
  "adle-base-word-transfer-evidence-regression.ts",
  "adle-word-lab-completion-contract-regression.ts",
  "adle-evidence-regression.ts",
  "adle-attempt-capture-regression.ts",
  "adle-review-scheduler-regression.ts",
  "adle-reward-bridge-regression.ts",
] as const;

for (const regression of regressions) {
  const result = spawnSync("npx", ["tsx", `scripts/${regression}`], {
    cwd: process.cwd(),
    env: {
      NODE_ENV: "test",
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      npm_config_cache: process.env.npm_config_cache,
    },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Semantic production baseline failed: scripts/${regression}`);
  }
}

console.log(
  `ADLE semantic production baseline passed (${regressions.length} regressions).`,
);
