import {validateContextualChoiceContent, type ContextualChoiceContent} from "./contextual-choice-contract";

export type HomophoneDictionaryFact = NonNullable<ContextualChoiceContent["dictionaryFacts"]>[number];

/** A contrast set is the smallest publishable unit. An incomplete partner can
 * never become target or practice content through a partly reviewed pair. */
export function buildDictionaryContextualContent(template: ContextualChoiceContent,
  facts: readonly HomophoneDictionaryFact[], selectedSetKeys?: readonly string[]): ContextualChoiceContent | null {
  const ready = new Map(facts.map(fact => [fact.wordId, fact]));
  const sets = template.sets.filter(set => (!selectedSetKeys || selectedSetKeys.includes(set.setKey))
    && set.memberWordIds.every(id => ready.has(id)));
  if (!sets.length || selectedSetKeys && sets.length !== selectedSetKeys.length) return null;
  const content: ContextualChoiceContent = {...template,
    contentVersion: `${template.contentVersion}:dictionary-v1`,
    approvalReference: "Reviewed Teaching Dictionary workbook and lesson meaning approval",
    dictionaryFacts: facts.filter(fact => sets.some(set => set.memberWordIds.includes(fact.wordId))),
    questions: template.questions.filter(question => sets.some(set => set.setId === question.setId)),
    sets: sets.map(set => ({...set, members: set.members.map(member => {
      const fact = ready.get(member.canonicalWordId)!;
      return {...member, intendedSense: fact.sense.definition, grammaticalRole: fact.sense.partOfSpeech,
        teachingSentence: fact.sense.dictationSentence!};
    })})),
  };
  validateContextualChoiceContent(content);
  return content;
}
