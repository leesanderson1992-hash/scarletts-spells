import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canonicalBaseWordFamilyMembership } from '../lib/adle/base-word-canonical-analysis';
import { includeActiveWorkbookReview } from '../lib/teaching-dictionary-manager/active-workbook-review';
import { IDENTIFY_BASE_SKILL } from '../lib/teaching-dictionary-manager/lesson-candidate';
import { familyDisplayName } from '../lib/teaching-dictionary-manager/family-display-name';

async function main() {
const parts = [{ id: 'base', kind: 'base' as const, sourceText: 'play', surfaceText: 'play', gloss: 'Make music.', displayRange: { start: 0, end: 4 } },
  { id: 's', kind: 'suffix' as const, sourceText: 's', surfaceText: 's', gloss: 'Present action.', displayRange: { start: 4, end: 5 } }];
const input = { displayWord: 'plays', parts, joins: [{ afterPartId: 'base', beforePartId: 's', joinType: 'none' }], transformations: [], wordSum: 'play + s → plays',
  anchor: { familyKey: 'music', equivalentFamilyKeys: ['music-old'], parts: [parts[0]] },
  links: [{ familyKey: 'music', componentPartId: 'base', relationshipKind: 'regular_inflection' },
    { familyKey: 'music-old', componentPartId: 'base', relationshipKind: 'regular_inflection' }] };
assert(canonicalBaseWordFamilyMembership(input), 'Equivalent family IDs must agree in review and ADLE');
assert.equal(canonicalBaseWordFamilyMembership({ ...input, links: [{ ...input.links[0], familyKey: 'game' }] }), null, 'Different meanings are not aliases');
assert.equal(canonicalBaseWordFamilyMembership({ ...input, wordSum: 'play + ed → plays' }), null, 'Malformed parts still block publishing');
assert.equal(canonicalBaseWordFamilyMembership({ ...input, parts: parts.map(p => p.id === 'base' ? { ...p, kind: 'root' as const } : p) }), null, 'A bound root is not a free base');
const db = { from() { throw Error('A second, generic check must not override the canonical Base Word projection'); } } as unknown as SupabaseClient;
const rows = [{ id: 'waiting', word: 'waiting', note: 'Needs reviewed information.', href: '/waiting' }];
assert.equal(await includeActiveWorkbookReview(db, IDENTIFY_BASE_SKILL, [{ canonicalWordId: 'active', word: 'plays' }], rows), rows);
assert.equal(familyDisplayName({ base: 'graph', kind: 'bound_root', meaning: 'to write, draw, or record information' }), 'graph (bound root) — to write, draw, or record information');
console.log('Shared review/publishing morphology checks, family aliases, root rejection and canonical Active status passed.');

}
void main();
