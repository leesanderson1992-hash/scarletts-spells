import assert from 'node:assert/strict';
import { canonicalBaseWordWorkflowEnabled } from '../lib/adle/base-word-canonical-workflow';
const saved = process.env.ADLE_BASE_WORD_DICTIONARY_ONLY;
try {
  delete process.env.ADLE_BASE_WORD_DICTIONARY_ONLY;
  assert(!canonicalBaseWordWorkflowEnabled('production'), 'Deploying code must not silently cut over a production pool');
  assert(!canonicalBaseWordWorkflowEnabled('staging'));
  process.env.ADLE_BASE_WORD_DICTIONARY_ONLY = 'true';
  assert(!canonicalBaseWordWorkflowEnabled('production'), 'An explicit supported opt-in is required');
  process.env.ADLE_BASE_WORD_DICTIONARY_ONLY = 'enabled';
  assert(canonicalBaseWordWorkflowEnabled('staging'));
  assert(canonicalBaseWordWorkflowEnabled('production'), 'The same tested workflow can be released without another code change');
  assert(!canonicalBaseWordWorkflowEnabled(null));
  assert(!canonicalBaseWordWorkflowEnabled('local'));
} finally {
  if (saved === undefined) delete process.env.ADLE_BASE_WORD_DICTIONARY_ONLY;
  else process.env.ADLE_BASE_WORD_DICTIONARY_ONLY = saved;
}
console.log('Base Word launch gate: explicit activation, supported environments and safe defaults passed.');
