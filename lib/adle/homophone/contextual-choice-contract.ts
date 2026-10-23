import { selectContrastSets, type QueuedContrastItem, type ReviewedContrastSet } from "./contrast-set-selection";

export type ContextualChoiceMember = {
  canonicalWordId: string;
  word: string;
  intendedSense: string;
  grammaticalRole: string;
  teachingSentence: string;
};

export type ContextualChoiceSet = ReviewedContrastSet & {
  revision: number;
  semanticFingerprint: string;
  relationKind: "homophone" | "near_homophone" | "confusable" | "morphological_contrast" | "contraction_real_word";
  members: readonly ContextualChoiceMember[];
};

export type ContextualChoiceQuestion = {
  questionId: string;
  setId: string;
  sentenceWithBlank: string;
  correctWordId: string;
  optionWordIds: readonly string[];
  evidenceMode: "independent_sentence";
};

export type ContextualChoiceContent = {
  microSkillKey: string;
  contentVersion: string;
  teachingExplanation: string;
  sets: readonly ContextualChoiceSet[];
  questions: readonly ContextualChoiceQuestion[];
  reviewStatus: "approved";
  approvalReference: string;
};

export type FrozenContextualChoiceSnapshot = {
  route: { routeId: "homophone_contextual_choice"; routeVersion: "v1" };
  microSkillKey: string;
  contentVersion: string;
  teachingExplanation: string;
  selectedSets: Array<Pick<ContextualChoiceSet, "setId" | "setKey" | "revision" | "semanticFingerprint" | "relationKind"> & {
    members: ContextualChoiceMember[];
  }>;
  questions: Array<ContextualChoiceQuestion & { optionWordIds: string[] }>;
  approvalReference: string;
};

function completeSentence(value: string): boolean {
  return value.trim().split(/\s+/).length >= 4 && /[.!?]$/.test(value.trim());
}

/** Fail closed on content that cannot prove a contextual meaning choice. */
export function validateContextualChoiceContent(content: ContextualChoiceContent): void {
  if (!content.microSkillKey.startsWith("D4_HOM_") || !content.contentVersion
    || !content.teachingExplanation.trim() || content.reviewStatus !== "approved"
    || !content.approvalReference.trim()) throw new Error("contextual_content_authority_invalid");
  const setIds = new Set<string>();
  const questionsBySet = new Map<string, ContextualChoiceQuestion[]>();
  const questionIds = new Set<string>();
  for (const set of content.sets) {
    if (setIds.has(set.setId) || !set.setId || !set.setKey || set.revision < 1
      || !/^[a-f0-9]{64}$/.test(set.semanticFingerprint)
      || set.reviewStatus !== "approved" || set.members.length < 2 || set.members.length > 3
      || set.memberWordIds.length !== set.members.length) throw new Error("contextual_set_invalid");
    setIds.add(set.setId);
    const ids = set.members.map(member => member.canonicalWordId);
    if (new Set(ids).size !== ids.length || ids.some(id => !set.memberWordIds.includes(id))) {
      throw new Error("contextual_set_membership_invalid");
    }
    for (const member of set.members) {
      if (!member.word.trim() || !member.intendedSense.trim() || !member.grammaticalRole.trim()
        || !completeSentence(member.teachingSentence)) throw new Error("contextual_member_meaning_invalid");
    }
  }
  for (const question of content.questions) {
    const set = content.sets.find(entry => entry.setId === question.setId);
    if (!set || questionIds.has(question.questionId) || !question.questionId
      || question.evidenceMode !== "independent_sentence"
      || (question.sentenceWithBlank.match(/____/g) ?? []).length !== 1
      || !completeSentence(question.sentenceWithBlank)
      || question.optionWordIds.length !== set.memberWordIds.length
      || new Set(question.optionWordIds).size !== set.memberWordIds.length
      || question.optionWordIds.some(id => !set.memberWordIds.includes(id))
      || !set.memberWordIds.includes(question.correctWordId)) {
      throw new Error("contextual_sentence_question_invalid");
    }
    questionIds.add(question.questionId);
    questionsBySet.set(question.setId, [...(questionsBySet.get(question.setId) ?? []), question]);
  }
  for (const set of content.sets) {
    const tested = new Set((questionsBySet.get(set.setId) ?? []).map(question => question.correctWordId));
    if (set.memberWordIds.some(id => !tested.has(id))) throw new Error("contextual_member_not_independently_tested");
  }
}

/** Selected sets and their full option membership are copied into the assignment snapshot. */
export function compileContextualChoiceSnapshot(input: {
  content: ContextualChoiceContent;
  queuedItems: readonly QueuedContrastItem[];
  masteredWordIds: ReadonlySet<string>;
  rotationIndex: number;
}): FrozenContextualChoiceSnapshot | null {
  validateContextualChoiceContent(input.content);
  const selected = selectContrastSets({ sets: input.content.sets, queuedItems: input.queuedItems,
    masteredWordIds: input.masteredWordIds, rotationIndex: input.rotationIndex });
  if (!selected.length) return null;
  const selectedIds = new Set(selected.map(set => set.setId));
  return {
    route: { routeId: "homophone_contextual_choice", routeVersion: "v1" },
    microSkillKey: input.content.microSkillKey,
    contentVersion: input.content.contentVersion,
    teachingExplanation: input.content.teachingExplanation,
    selectedSets: selected.map(selection => {
      const set = input.content.sets.find(entry => entry.setId === selection.setId)!;
      return { setId: set.setId, setKey: set.setKey, revision: set.revision,
        semanticFingerprint: set.semanticFingerprint, relationKind: set.relationKind,
        members: set.members.map(member => ({ ...member })) };
    }),
    questions: input.content.questions.filter(question => selectedIds.has(question.setId))
      .map(question => ({ ...question, optionWordIds: [...question.optionWordIds] })),
    approvalReference: input.content.approvalReference,
  };
}

export type ContextualChoiceResponse = { questionId: string; selectedWordId: string };

/** Only independent complete-sentence choices can yield context evidence for this diagnosed skill. */
export function evaluateContextualChoice(input: {
  snapshot: FrozenContextualChoiceSnapshot;
  responses: readonly ContextualChoiceResponse[];
}): { microSkillKey: string; evidenceMode: "independent_sentence"; wordOutcomes: Array<{
  canonicalWordId: string; correct: boolean; questionIds: string[];
}> } {
  const { snapshot, responses } = input;
  if (responses.length !== snapshot.questions.length
    || new Set(responses.map(response => response.questionId)).size !== responses.length) {
    throw new Error("contextual_response_set_incomplete");
  }
  const responseByQuestion = new Map(responses.map(response => [response.questionId, response.selectedWordId]));
  const words = new Map<string, { canonicalWordId: string; correct: boolean; questionIds: string[] }>();
  for (const question of snapshot.questions) {
    const selectedWordId = responseByQuestion.get(question.questionId);
    if (!selectedWordId || !question.optionWordIds.includes(selectedWordId)) {
      throw new Error("contextual_response_option_invalid");
    }
    const previous = words.get(question.correctWordId);
    words.set(question.correctWordId, {
      canonicalWordId: question.correctWordId,
      correct: (previous?.correct ?? true) && selectedWordId === question.correctWordId,
      questionIds: [...(previous?.questionIds ?? []), question.questionId],
    });
  }
  return { microSkillKey: snapshot.microSkillKey, evidenceMode: "independent_sentence",
    wordOutcomes: [...words.values()] };
}
