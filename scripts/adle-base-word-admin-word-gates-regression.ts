import assert from 'node:assert/strict';
import { baseWordEntryLacksCompilerWitness } from '../lib/teaching-dictionary-manager/lesson-preflight';

const witnesses = { target: ['target', 'base'], base: ['target', 'base'] };
assert.equal(baseWordEntryLacksCompilerWitness({ requiredForRelease: true,
  assignmentEligible: true, canonicalWordId: 'target', witnesses }), false);
assert.equal(baseWordEntryLacksCompilerWitness({ requiredForRelease: true,
  assignmentEligible: true, canonicalWordId: 'orphan', witnesses }), true);
assert.equal(baseWordEntryLacksCompilerWitness({ requiredForRelease: true,
  assignmentEligible: false, canonicalWordId: 'orphan', witnesses }), false);
console.log('adle-base-word-admin-word-gates-regression: ok');
