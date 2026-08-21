"use client";

import { useState } from "react";

import { ClosedCompoundGuidedLesson } from "@/components/adle/morphology/closed-compound-guided-lesson";
import {
  CLOSED_COMPOUND_CONTENT_VERSION,
  CLOSED_COMPOUND_MICRO_SKILL,
  type ClosedCompoundLessonPayloadV1,
} from "@/lib/adle/morphology/closed-compound-word-lab";

const ASSIGNMENT_ID = "dev-closed-compound-g7-teaching-pages";
const lessonWords = [
  ["rainbow", "rain", "bow", "A rainbow appeared after rain.", 1],
  ["football", "foot", "ball", "Children play football after school.", 2],
  ["bedroom", "bed", "room", "The bedroom was quiet.", 1],
  ["playground", "play", "ground", "We met at the playground.", 4],
] as const;

const payload = {
  schemaVersion: 1,
  experience: "D4_MOR_CLOSED_COMPOUND",
  contentVersion: CLOSED_COMPOUND_CONTENT_VERSION,
  microSkillId: CLOSED_COMPOUND_MICRO_SKILL,
  experienceProfile: "closed_compound_word_lab_v1",
  words: {
    lesson: lessonWords.map(([word, firstWord, secondWord, sentence, targetTokenIndex]) => ({
      canonicalWordId: word,
      displayWord: word,
      firstWord,
      secondWord,
      firstWordMeaning: `${firstWord} meaning`,
      secondWordMeaning: `${secondWord} meaning`,
      childFriendlyDefinition: `${word} definition`,
      audioText: sentence,
      dictationSentence: sentence,
      dictationTargetTokenIndex: targetTokenIndex,
      parts: [],
      joins: [],
      trueMorphology: { parts: [], joins: [], transformations: [], notes: "Local browser fixture", provenance: { fixture: true } },
      approvedTransfer: true,
    })),
  },
  activities: {
    introduction: {
      title: "Closed compound words",
      childFriendlyExplanation: "Two whole words can join to make one word.",
      summary: "Keep every letter and remove the space.",
      examples: [],
    },
    reflection: {
      promptKey: "closed-compounds-two-bases-v1",
      promptText: "How do the two smaller words help you spell a closed compound?",
    },
    dictation: lessonWords.map(([word, , , sentence, targetTokenIndex]) => ({
      canonicalWordId: word,
      targetWord: word,
      sentence,
      targetTokenIndex,
    })),
  },
} as unknown as ClosedCompoundLessonPayloadV1;

export default function ClosedCompoundReflectionPreviewPage() {
  const [reflection, setReflection] = useState<string | null>(null);
  if (reflection !== null) {
    return <main className="mx-auto max-w-3xl p-6"><section className="brand-card grid gap-3 rounded-3xl p-8 text-center" data-testid="closed-compound-preview-complete"><h1 className="text-3xl font-black">Closed Compound preview complete</h1><p>This local fixture did not submit or write learner evidence.</p><blockquote>{reflection}</blockquote></section></main>;
  }
  return <main className="mx-auto max-w-4xl p-6" data-testid="closed-compound-reflection-fixture"><ClosedCompoundGuidedLesson childId="dev-closed-compound-child" assignmentId={ASSIGNMENT_ID} items={[]} payload={payload} onPreviewComplete={setReflection} /></main>;
}
