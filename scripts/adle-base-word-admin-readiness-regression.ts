import assert from 'node:assert/strict';
import { requiredBaseWordPreflightTargets } from '../lib/teaching-dictionary-manager/governed-preflight';

const member = (canonicalWordId: string, memberRole: string, authenticSelectionEligible = true) => ({
  canonicalWordId, memberRole, assignmentEligible: true, lessonContentEligible: true,
  authenticSelectionEligible,
});
const historical = [
  member('base', 'base'), member('transfer', 'transfer'),
  member('target_a', 'authentic_target'), member('target_b', 'authentic_target'),
];
assert.deepEqual(requiredBaseWordPreflightTargets(1, historical), ['target_a', 'target_b']);
assert.deepEqual(requiredBaseWordPreflightTargets(2, historical), ['base', 'transfer', 'target_a', 'target_b']);
assert.deepEqual(requiredBaseWordPreflightTargets(2, [member('excluded', 'authentic_target', false)]), []);
console.log('adle-base-word-admin-readiness-regression: ok');
