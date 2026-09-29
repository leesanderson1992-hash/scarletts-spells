import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const frozenSha = '2d76a4a536179ab6db1d4180ac35876b10eddd02';
const branch = 'experiment/ai-context-benchmark';
const baseline = JSON.parse(execFileSync('git', ['show', `${frozenSha}:vercel.json`], {
  cwd: root,
  encoding: 'utf8',
}));
const current = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

assert.equal(baseline.git, undefined, 'Frozen baseline must have no Git deployment override');
assert.deepEqual(current, {
  ...baseline,
  git: { deploymentEnabled: { [branch]: false } },
}, 'Only the exact benchmark branch deployment guard may differ from the frozen baseline');

// Vercel defaults unspecified branches to true. The exact-map assertion above
// excludes wildcard rules and any override for main or other branches.
const deploymentEnabled = (config, name) => config.git?.deploymentEnabled?.[name] ?? true;
assert.equal(deploymentEnabled(current, branch), false);
assert.equal(deploymentEnabled(current, 'main'), deploymentEnabled(baseline, 'main'));
assert.equal(deploymentEnabled(current, 'main'), true);

console.log(`${branch} → deploymentEnabled=false`);
console.log('main → deploymentEnabled=true (unchanged)');
console.log('All unrelated Vercel configuration preserved');
