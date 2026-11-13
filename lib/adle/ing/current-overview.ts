import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import type { IngDictionaryWordV1 } from "./contracts";
import { candidateDecisionIsCurrent, type CandidateDecisionEvent } from "@/lib/teaching-dictionary-manager/candidate-decision-current";
import { generateIngWordFromOverview } from "@/lib/teaching-dictionary-manager/ing-overview-recipe";
import type { CandidateFamilyLink, CandidateMorphology } from "@/lib/teaching-dictionary-manager/lesson-candidate";
import type { DictionarySenseSet } from "@/lib/teaching-dictionary-manager/senses";

/** A released Overview recipe is usable only while its selected approved
 * meaning, pronunciation, family, morphology and generated content still agree. */
export function ingReleasedWordMatchesCurrentOverview(input: {
  released: IngDictionaryWordV1;
  senseSet: DictionarySenseSet | null;
  morphology: (CandidateMorphology & { id: string }) | null;
  familyLinks: readonly (CandidateFamilyLink & { id: string })[];
  decision: CandidateDecisionEvent | null;
  boundSenseIds: readonly string[];
  sourceName: string | null;
  sourceUrl: string | null;
}): boolean {
  const { released } = input;
  if (!released.senseId || !released.pronunciationId || !released.pronunciationIpa || !input.morphology
    || !input.boundSenseIds.includes(released.senseId)) return false;
  if (!candidateDecisionIsCurrent({ event: input.decision, senseId: released.senseId,
    senseSet: input.senseSet, morphologyId: input.morphology.id,
    familyLinkIds: input.familyLinks.filter(link => link.sense_id === released.senseId)
      .map(link => link.id) })) return false;
  const generated = generateIngWordFromOverview({ wordId: released.canonicalWordId,
    displayWord: released.word, skillKey: released.microSkillKey,
    senseId: released.senseId, senseSet: input.senseSet,
    morphology: input.morphology, familyLinks: input.familyLinks,
    provenance: { sourceName: input.sourceName, sourceUrl: input.sourceUrl } });
  if (generated.status !== "ready") return false;
  const fields = (word: typeof generated.word | IngDictionaryWordV1) => ({
    canonicalWordId: word.canonicalWordId, microSkillKey: word.microSkillKey,
    senseId: word.senseId, pronunciationId: word.pronunciationId,
    pronunciationIpa: word.pronunciationIpa,
    base: word.base, word: word.word, meaning: word.meaning,
    ...(word.doublingPattern ? { doublingPattern: word.doublingPattern } : {}),
    dictationSentence: word.dictationSentence, audioText: word.audioText,
    sourceRefs: word.sourceRefs,
  });
  return fingerprintSnapshotValue(fields(generated.word)) === fingerprintSnapshotValue(fields(released));
}
