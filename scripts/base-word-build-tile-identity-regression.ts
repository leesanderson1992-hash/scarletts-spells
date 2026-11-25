import assert from 'node:assert/strict';
import { baseWordDefinitionBuild } from '../components/adle/morphology/base-word-definition-build';
import type { BaseWordFamilySnapshotWord } from '../lib/adle/morphology/base-word-family-payload';
function word(id: string, suffix = ''): BaseWordFamilySnapshotWord {
  return { canonicalWordId: id, displayWord: 'jump' + suffix, wordSum: 'jump' + (suffix ? ' + ' + suffix : ''),
    parts: [{ id: 'part_1', kind: 'base', sourceText: 'jump', surfaceText: 'jump', gloss: 'move up' },
      ...suffix ? [{ id: 'part_2', kind: 'suffix', sourceText: suffix, surfaceText: suffix, gloss: 'reviewed ending' }] : []],
    joins: suffix ? [{ afterPartId: 'part_1', beforePartId: 'part_2', joinType: 'none' }] : [],
    transformations: [], transformationNotes: '', childFriendlyMeaning: id, dictationSentence: '', dictationTargetTokenIndex: 0, audioText: '' };
}
const words = [word('base'), word('plural', 's'), word('present', 'ing'), word('past', 'ed')];
for (let index = 0; index < words.length; index++) {
  const build = baseWordDefinitionBuild(words, index);
  assert.equal(new Set(build.tiles.map(tile => tile.id)).size, build.tiles.length,
    'Word-local part_2 IDs must not make different distractors the same selectable tile');
  for (const selected of build.tiles) assert.equal(build.tiles.filter(tile => tile.id === selected.id)[0].text, selected.text,
    'Selecting ed must place ed rather than the first sibling ending');
  assert.deepEqual(baseWordDefinitionBuild(words, index), build, 'Restoring an activity keeps deterministic tile identities');
  assert.deepEqual(build.expectedIds, (words[index].parts as {id:string}[]).map(part => `${words[index].canonicalWordId}:required:${part.id}`),
    'Required parts preserve their existing within-word identities');
}
console.log('Base Word build: unique cross-word choices, matching selected labels and stable required parts passed.');
