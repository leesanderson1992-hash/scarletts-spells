import type { WordDraftPayload } from './contracts';
import { normaliseSensePronunciations } from './senses';
import { normaliseStressPattern } from './stress-pattern';

/** Sense pronunciation governs the compatibility metadata, including on save. */
export function normaliseWordPronunciations(payload: WordDraftPayload): WordDraftPayload {
  const senseSet = payload.senseSet ? normaliseSensePronunciations(payload.senseSet) : undefined;
  const primary = senseSet?.pronunciations.find(row=>row.id===senseSet.senses[0]?.pronunciationId);
  return { ...payload, ...(senseSet ? {senseSet} : {}), metadata: { ...payload.metadata,
    ...(primary ? {phoneme_hint:primary.ipa, syllables:String(primary.spokenSyllableCount ?? ''),stress_pattern:primary.stressPattern}
      : {stress_pattern:normaliseStressPattern(payload.metadata.stress_pattern,Number(payload.metadata.syllables)||null)}) } };
}
