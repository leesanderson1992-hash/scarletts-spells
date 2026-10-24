import approved from "@/data/adle/homophone/convergence-v1/approved-lesson-content.json";
import type { ContextualChoiceContent, ContextualChoiceSet } from "./contextual-choice-contract";
import { validateContextualChoiceContent } from "./contextual-choice-contract";

export type PublishedContrastAuthority = {
  setId: string;
  setKey: string;
  microSkillKey: string;
  revision: number;
  semanticFingerprint: string;
  reviewStatus: "approved";
  relationKind: ContextualChoiceSet["relationKind"];
  members: readonly { canonicalWordId: string; word: string; intendedSense: string;
    grammaticalRole: string; teachingSentence: string }[];
};

/** Bind the exact approved workbook to reviewed database set and word identities. */
export function buildApprovedContextualContent(microSkillKey: string, publishedSets: readonly PublishedContrastAuthority[]): ContextualChoiceContent {
  const source = approved.lessons.find(lesson => lesson.microSkillKey === microSkillKey);
  if (!source) throw new Error(`homophone_contextual_skill_unknown:${microSkillKey}`);
  const byKey = new Map(publishedSets.map(set => [set.setKey, set]));
  if (byKey.size !== publishedSets.length) throw new Error("homophone_contextual_set_duplicate");
  const sets: ContextualChoiceSet[] = source.sets.map(reviewed => {
    const published = byKey.get(reviewed.setKey);
    if (!published || published.microSkillKey !== microSkillKey || published.reviewStatus !== "approved"
      || published.relationKind !== reviewed.relationKind || published.members.length !== reviewed.members.length
      || published.members.some((member, index) => member.word !== reviewed.members[index].word
        || member.intendedSense !== reviewed.members[index].intendedSense
        || member.grammaticalRole !== reviewed.members[index].grammaticalRole
        || member.teachingSentence !== reviewed.members[index].teachingSentence)) {
      throw new Error(`homophone_contextual_set_authority_mismatch:${reviewed.setKey}`);
    }
    return { setId: published.setId, setKey: published.setKey, revision: published.revision,
      semanticFingerprint: published.semanticFingerprint, reviewStatus: "approved",
      relationKind: published.relationKind, members: published.members.map(member => ({ ...member })),
      memberWordIds: published.members.map(member => member.canonicalWordId) };
  });
  if (byKey.size !== sets.length) throw new Error("homophone_contextual_set_scope_mismatch");
  const questions = source.sets.flatMap((reviewed, index) => reviewed.choiceQuestions.map(question => {
    const set = sets[index];
    const correct = set.members.find(member => member.word === question.word);
    if (!correct) throw new Error(`homophone_contextual_question_word_invalid:${question.id}`);
    return { questionId: question.id, setId: set.setId, sentenceWithBlank: question.sentenceWithBlank,
      correctWordId: correct.canonicalWordId, optionWordIds: [...set.memberWordIds],
      evidenceMode: "independent_sentence" as const };
  }));
  const content: ContextualChoiceContent = { microSkillKey, contentVersion: approved.contentVersion,
    teachingExplanation: source.teachingExplanation, sets, questions,
    reviewStatus: "approved", approvalReference: approved.approvalReference };
  validateContextualChoiceContent(content);
  return content;
}
