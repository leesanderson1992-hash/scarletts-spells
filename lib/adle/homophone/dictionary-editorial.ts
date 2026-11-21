import type {ContextualChoiceContent} from './contextual-choice-contract';

const contentWordLessons = new Set([
  'D4_HOM_CONTENT_WORD_HOMOPHONES_ALLOWED_ALOUD',
  'D4_HOM_CONTENT_WORD_HOMOPHONES_ED_FOR_T',
  'D4_HOM_CONTENT_WORD_HOMOPHONES_MORNING_MOURNING',
]);

/** Keep the three migrated lessons' explanatory copies aligned with their
 * approved senses. Independent questions remain separately authored content. */
export function dictionaryEditorialContent(content: ContextualChoiceContent): ContextualChoiceContent {
  if (!contentWordLessons.has(content.microSkillKey) || !content.dictionaryFacts) return content;
  const comparisons = content.sets.flatMap(set => set.members)
    .map(member => `${member.word} (${member.intendedSense.replace(/[.!]$/u, '')})`);
  const mourningVerb = content.microSkillKey === 'D4_HOM_CONTENT_WORD_HOMOPHONES_MORNING_MOURNING'
    ? content.dictionaryFacts.find(fact => fact.sense.partOfSpeech === 'verb'
      && content.sets.some(set => set.members.some(member => member.word === 'mourning'
        && member.canonicalWordId === fact.wordId))) : undefined;
  return {
    ...content,
    teachingExplanation: `Choose by meaning in the whole sentence. Compare ${comparisons.join(' / ')}.`,
    questions: content.questions.map(question => mourningVerb && question.correctWordId === mourningVerb.wordId
      ? {...question, sentenceWithBlank: 'They are ____ their grandfather, who died last week.'}
      : question),
  };
}
