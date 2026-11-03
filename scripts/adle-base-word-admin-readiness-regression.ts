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
assert.deepEqual(requiredBaseWordPreflightTargets(2, [
  { ...member('make', 'base'), lessonRegularity: { status: 'regular' as const } },
  { ...member('made', 'transfer'), lessonRegularity: { status: 'irregular' as const } },
  { ...member('making', 'transfer'), lessonRegularity: { status: 'regular' as const } },
], 'base_word_regularity_v1'), ['make', 'making'],
  'an owner-reviewed irregular form must not veto regular Base Word targets');
console.log('adle-base-word-admin-readiness-regression: ok');
