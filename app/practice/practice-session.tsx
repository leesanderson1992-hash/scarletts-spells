"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import type { AppMode } from "@/lib/children";

import {
  completePracticeSession,
  savePracticeAttempt,
  type CompletePracticeSessionResult,
  type SavePracticeAttemptState,
} from "./actions";
import {
  findHomophoneSetFamilyForWord,
  getHomophoneWordsForFamily,
  type WordFamilyId,
} from "@/lib/spelling/wordFamilies";

type PracticeWord = {
  word: string;
  kind: "target" | "review";
  phase: "core" | "same_family_bonus" | "due_review" | "related_bonus";
  wordProgressId: string | null;
};

type LessonType = "tricky_word" | "rule" | "morphology" | "sound" | "homophone";

type PracticeSessionProps = {
  childId: string;
  childName: string;
  sessionMode: AppMode;
  assignmentId: string;
  assignmentTitle: string;
  lessonType: LessonType;
  familyId: string | null;
  familyLabel: string | null;
  teachingNote: string | null;
  familyWords: string[];
  promptExamples: Array<{ answer: string; sentence: string }>;
  targetWords: string[];
  reviewWords: string[];
  words: PracticeWord[];
  plannedWordCount: number;
  status: string;
  isReviewOnly: boolean;
  sameFamilyBonusCount: number;
  dueReviewCount: number;
  relatedBonusCount: number;
  goldCoinCount: number;
};

type FinishState = CompletePracticeSessionResult | null;
type MicroTaskOption = {
  id: string;
  label: string;
  isCorrect: boolean;
};

type MicroTask = {
  prompt: string;
  support: string;
  options: MicroTaskOption[];
  sentence?: string;
};

type RewardBadge = {
  label: string;
  tone: "pink" | "gold";
};

const LESSON_STEP_FLOWS: Record<LessonType, readonly string[]> = {
  tricky_word: [
    "Look",
    "Say",
    "Spot tricky bit",
    "Cover",
    "Write",
    "Check",
    "Use",
  ],
  rule: [
    "Show rule",
    "Compare example",
    "Say rule",
    "Cover",
    "Write",
    "Check",
    "Use",
  ],
  morphology: [
    "Break apart",
    "Explain parts",
    "Rebuild",
    "Cover",
    "Write",
    "Check",
    "Use",
  ],
  sound: [
    "Hear sound",
    "Compare spellings",
    "Choose grapheme",
    "Cover",
    "Write",
    "Check",
    "Use",
  ],
  homophone: [
    "Read sentence",
    "Choose meaning word",
    "Say sentence",
    "Cover",
    "Write",
    "Check",
    "Use",
  ],
};

const initialPracticeAttemptState: SavePracticeAttemptState = {
  error: null,
  savedWord: null,
  submittedWord: "",
  isCorrect: null,
  assignmentCompleted: false,
};

const CHILD_MODE_DURATION_SECONDS = 10 * 60;
const INTERACTIVE_STEP_BY_LESSON: Record<LessonType, string> = {
  tricky_word: "Spot tricky bit",
  rule: "Compare example",
  morphology: "Break apart",
  sound: "Compare spellings",
  homophone: "Choose meaning word",
};

const HOMOPHONE_SENTENCE_TEMPLATES: Partial<Record<
  WordFamilyId,
  Array<{ answer: string; sentence: string }>
>> = {
  homophone_there_their_theyre: [
    { answer: "there", sentence: "Put the book over ____ by the lamp." },
    { answer: "their", sentence: "____ coats were hanging by the door." },
    { answer: "they’re", sentence: "____ getting ready for the school trip." },
  ],
  homophone_to_too_two: [
    { answer: "to", sentence: "We are walking ____ the park after tea." },
    { answer: "too", sentence: "I would like one ____ , please." },
    { answer: "two", sentence: "She found ____ shiny shells on the beach." },
  ],
  homophone_weather_whether: [
    { answer: "weather", sentence: "The ____ was rainy all morning." },
    { answer: "whether", sentence: "I am not sure ____ we will go today." },
  ],
  homophone_whose_whos: [
    { answer: "whose", sentence: "____ pencil case is on the table?" },
    { answer: "who's", sentence: "____ coming with us to the museum?" },
  ],
  homophones_year_2: [
    { answer: "there", sentence: "Put the bag down over ____." },
    { answer: "too", sentence: "I would like some juice ____." },
  ],
  homophones_year_3_4: [
    { answer: "weather", sentence: "The ____ changed very quickly today." },
    { answer: "whose", sentence: "____ jumper is hanging on the chair?" },
  ],
};

function getExplainPrompt(lessonType: LessonType) {
  switch (lessonType) {
    case "tricky_word":
      return "Which part is the tricky bit?";
    case "rule":
      return "What rule is helping here?";
    case "morphology":
      return "What are the word parts?";
    case "sound":
      return "Which spelling pattern does this word use?";
    case "homophone":
      return "Which word makes sense in the sentence?";
    default:
      return "";
  }
}

function buildFallbackAlternative(word: string) {
  if (word.length <= 3) {
    return `${word}e`;
  }

  return `${word.slice(0, -1)}${word.slice(-1).repeat(2)}`;
}

function buildRuleAlternative(word: string) {
  if (word.endsWith("e")) {
    return word.slice(0, -1);
  }

  if (/([bcdfghjklmnpqrstvwxyz])\1/.test(word)) {
    return word.replace(/([bcdfghjklmnpqrstvwxyz])\1/, "$1");
  }

  if (word.endsWith("ies")) {
    return `${word.slice(0, -3)}ys`;
  }

  if (word.endsWith("ing")) {
    return `${word.slice(0, -3)}eing`;
  }

  if (word.endsWith("ied")) {
    return `${word.slice(0, -3)}yed`;
  }

  return buildFallbackAlternative(word);
}

function buildSoundAlternative(word: string) {
  const pairReplacements: Array<[string, string]> = [
    ["ay", "ai"],
    ["ai", "ay"],
    ["ee", "ea"],
    ["ea", "ee"],
    ["ie", "ei"],
    ["ei", "ie"],
    ["oa", "ow"],
    ["ow", "oa"],
  ];

  for (const [from, to] of pairReplacements) {
    if (word.includes(from)) {
      return word.replace(from, to);
    }
  }

  const singleReplacements: Record<string, string> = {
    a: "u",
    e: "a",
    i: "e",
    o: "u",
    u: "o",
  };

  for (const [from, to] of Object.entries(singleReplacements)) {
    const index = word.indexOf(from);
    if (index >= 0) {
      return `${word.slice(0, index)}${to}${word.slice(index + 1)}`;
    }
  }

  return buildFallbackAlternative(word);
}

function buildTrickyBitOptions(word: string) {
  const patterns = [
    "ough",
    "augh",
    "eigh",
    "igh",
    "ould",
    "ie",
    "ei",
    "ea",
    "oa",
    "oo",
    "ou",
    "ay",
    "ai",
    "ee",
    "ck",
    "ll",
    "tt",
    "ss",
    "pp",
    "dd",
    "nn",
  ];
  const lowerWord = word.toLowerCase();
  const matchedPattern = patterns.find((pattern) => lowerWord.includes(pattern));
  const patternIndex = matchedPattern ? lowerWord.indexOf(matchedPattern) : -1;

  if (matchedPattern && patternIndex >= 0) {
    const pieces = [
      word.slice(0, patternIndex),
      word.slice(patternIndex, patternIndex + matchedPattern.length),
      word.slice(patternIndex + matchedPattern.length),
    ].filter(Boolean);

    return pieces.map((piece, index) => ({
      id: `${piece}-${index}`,
      label: piece,
      isCorrect: piece.toLowerCase() === matchedPattern,
    }));
  }

  const middleStart = Math.max(1, Math.floor(word.length / 2) - 1);
  const middleEnd = Math.min(word.length - 1, middleStart + 2);
  const pieces = [
    word.slice(0, middleStart),
    word.slice(middleStart, middleEnd),
    word.slice(middleEnd),
  ].filter(Boolean);
  const correctLabel = pieces[Math.floor(pieces.length / 2)] ?? word;

  return pieces.map((piece, index) => ({
    id: `${piece}-${index}`,
    label: piece,
    isCorrect: piece === correctLabel,
  }));
}

function buildMorphologyOptions(word: string) {
  const prefixes = ["un", "re", "dis", "mis", "in", "im", "il", "ir"];
  const suffixes = ["ness", "less", "ful", "ment", "ly", "ing", "ed", "er", "est"];
  const lowerWord = word.toLowerCase();

  const matchingPrefix = prefixes.find(
    (prefix) => lowerWord.startsWith(prefix) && word.length > prefix.length + 2,
  );
  if (matchingPrefix) {
    const base = word.slice(matchingPrefix.length);
    return [
      {
        id: "correct-prefix",
        label: `${word.slice(0, matchingPrefix.length)} + ${base}`,
        isCorrect: true,
      },
      {
        id: "wrong-prefix",
        label: `${word.slice(0, matchingPrefix.length + 1)} + ${word.slice(matchingPrefix.length + 1)}`,
        isCorrect: false,
      },
    ];
  }

  const matchingSuffix = suffixes.find(
    (suffix) => lowerWord.endsWith(suffix) && word.length > suffix.length + 2,
  );
  if (matchingSuffix) {
    const base = word.slice(0, -matchingSuffix.length);
    return [
      {
        id: "correct-suffix",
        label: `${base} + ${word.slice(-matchingSuffix.length)}`,
        isCorrect: true,
      },
      {
        id: "wrong-suffix",
        label: `${word.slice(0, -(matchingSuffix.length - 1))} + ${word.slice(-(matchingSuffix.length - 1))}`,
        isCorrect: false,
      },
    ];
  }

  const splitPoint = Math.max(2, Math.floor(word.length / 2));
  return [
    {
      id: "correct-mid",
      label: `${word.slice(0, splitPoint)} + ${word.slice(splitPoint)}`,
      isCorrect: true,
    },
    {
      id: "wrong-mid",
      label: `${word.slice(0, splitPoint - 1)} + ${word.slice(splitPoint - 1)}`,
      isCorrect: false,
    },
  ];
}

function normaliseHomophoneOption(word: string) {
  return word.toLowerCase().replace(/['’]/g, "");
}

function getHomophoneFamilyId(
  familyId: string | null,
  word: string,
): WordFamilyId | null {
  const setFamilyId = findHomophoneSetFamilyForWord(word)?.id ?? null;
  if (setFamilyId) {
    return setFamilyId;
  }

  if (
    familyId === "homophones_year_2" ||
    familyId === "homophones_year_3_4" ||
    familyId === "homophone_there_their_theyre" ||
    familyId === "homophone_to_too_two" ||
    familyId === "homophone_weather_whether" ||
    familyId === "homophone_whose_whos"
  ) {
    return familyId;
  }

  return null;
}

function buildHomophoneTask(
  familyId: string | null,
  familyWords: string[],
  promptExamples: Array<{ answer: string; sentence: string }>,
  word: string,
  teachingNote: string | null,
): MicroTask {
  const homophoneFamilyId = getHomophoneFamilyId(familyId, word);
  const sentenceOptions =
    promptExamples.length > 0
      ? promptExamples
      : homophoneFamilyId
        ? HOMOPHONE_SENTENCE_TEMPLATES[homophoneFamilyId] ?? []
        : [];
  const words = familyWords.length > 0
    ? familyWords
    : homophoneFamilyId && getHomophoneWordsForFamily(homophoneFamilyId).length > 0
      ? getHomophoneWordsForFamily(homophoneFamilyId)
      : [word];
  const answerEntry =
    sentenceOptions.find(
      (option) => normaliseHomophoneOption(option.answer) === normaliseHomophoneOption(word),
    ) ??
    sentenceOptions[0];
  const prompt = getExplainPrompt("homophone");

  return {
    prompt,
    support:
      teachingNote ??
      "These words can sound the same, so choose the one that makes sense in the sentence.",
    sentence:
      answerEntry?.sentence ??
      `Choose the word that makes sense: We need the right word here: ____.`,
    options: words.map((optionWord) => ({
      id: optionWord,
      label: optionWord,
      isCorrect:
        normaliseHomophoneOption(optionWord) ===
        normaliseHomophoneOption(answerEntry?.answer ?? word),
    })),
  };
}

function buildMicroTask(
  lessonType: LessonType,
  familyId: string | null,
  familyWords: string[],
  promptExamples: Array<{ answer: string; sentence: string }>,
  word: string,
  teachingNote: string | null,
): MicroTask {
  switch (lessonType) {
    case "tricky_word":
      return {
        prompt: getExplainPrompt(lessonType),
        support:
          teachingNote ??
          "This is a tricky word. Notice the tricky part and remember the whole word.",
        options: buildTrickyBitOptions(word),
      };
    case "rule": {
      const wrongWord = buildRuleAlternative(word);
      const options =
        word.length % 2 === 0
          ? [
              { id: "wrong", label: wrongWord, isCorrect: false },
              { id: "right", label: word, isCorrect: true },
            ]
          : [
              { id: "right", label: word, isCorrect: true },
              { id: "wrong", label: wrongWord, isCorrect: false },
            ];

      return {
        prompt: getExplainPrompt(lessonType),
        support: teachingNote ?? "Look for the spelling rule that helps this word.",
        options,
      };
    }
    case "morphology":
      return {
        prompt: getExplainPrompt(lessonType),
        support: teachingNote ?? "This word is easier when you look at its parts.",
        options: buildMorphologyOptions(word),
      };
    case "homophone":
      return buildHomophoneTask(
        familyId,
        familyWords,
        promptExamples,
        word,
        teachingNote,
      );
    case "sound":
    default: {
      const wrongWord = buildSoundAlternative(word);
      const options =
        word.length % 2 === 0
          ? [
              { id: "wrong", label: wrongWord, isCorrect: false },
              { id: "right", label: word, isCorrect: true },
            ]
          : [
              { id: "right", label: word, isCorrect: true },
              { id: "wrong", label: wrongWord, isCorrect: false },
            ];

      return {
        prompt: getExplainPrompt(lessonType),
        support:
          teachingNote ??
          "Listen carefully to the sound and notice which letters spell it.",
        options,
      };
    }
  }
}

function getStageDisplayWord(word: string, currentStep: string) {
  if (currentStep === "Write" || currentStep === "Check" || currentStep === "Use") {
    return "••••••";
  }

  return word;
}

function getStepMessage(
  lessonType: LessonType,
  step: string,
  teachingNote: string | null,
) {
  switch (lessonType) {
    case "tricky_word":
      switch (step) {
        case "Look":
          return "Look closely at the whole word and notice the part that does not feel easy to remember.";
        case "Say":
          return "Say the word slowly, then say it naturally.";
        case "Spot tricky bit":
          return getExplainPrompt(lessonType);
        case "Cover":
          return "Slide to cover the word so you cannot peek.";
        case "Write":
          return "Write the whole word from memory.";
        case "Check":
          return "Check the tricky part carefully against the word.";
        case "Use":
          return "Say a short sentence using the word.";
        default:
          return "";
      }
    case "morphology":
      switch (step) {
        case "Break apart":
          return getExplainPrompt(lessonType);
        case "Explain parts":
          return "Explain how the parts change the spelling.";
        case "Rebuild":
          return "Put the word back together out loud before you write it.";
        case "Cover":
          return "Slide to cover the word and hold the parts in your mind.";
        case "Write":
          return "Write the whole word carefully from memory.";
        case "Check":
          return "Check each part and make sure the ending is right.";
        case "Use":
          return "Say a sentence that uses the whole word.";
        default:
          return "";
      }
    case "sound":
      switch (step) {
        case "Hear sound":
          return "Say the word and listen for the sound in the middle.";
        case "Compare spellings":
          return "Tap the spelling that looks right for this word.";
        case "Choose grapheme":
          return teachingNote
            ? teachingNote
            : "Choose the spelling pattern that matches this word.";
        case "Cover":
          return "Slide to cover the word and keep the spelling pattern in your mind.";
        case "Write":
          return "Write the word using the spelling you chose.";
        case "Check":
          return "Check whether the sound pattern matches the target word.";
        case "Use":
          return "Say a sentence using the word clearly.";
        default:
          return "";
      }
    case "homophone":
      switch (step) {
        case "Read sentence":
          return "Read the sentence and think about what it means.";
        case "Choose meaning word":
          return getExplainPrompt(lessonType);
        case "Say sentence":
          return "Read the whole sentence aloud with the correct word in place.";
        case "Cover":
          return "Slide to cover the word and keep the meaning in your mind.";
        case "Write":
          return "Write the word that makes sense in the sentence.";
        case "Check":
          return "Check that the word you wrote matches the meaning.";
        case "Use":
          return "Say a new sentence using the word correctly.";
        default:
          return "";
      }
    case "rule":
    default:
      switch (step) {
        case "Show rule":
          return teachingNote
            ? `Remember this rule: ${teachingNote}`
            : "Look for the spelling rule that helps this word.";
        case "Compare example":
          return getExplainPrompt(lessonType);
        case "Say rule":
          return "Say the rule out loud before you write.";
        case "Cover":
          return "Slide to cover the word and keep the pattern in your head.";
        case "Write":
          return "Write the word from memory using the rule.";
        case "Check":
          return "Check whether the rule worked in this word.";
        case "Use":
          return "Say a sentence using the word.";
        default:
          return "";
      }
  }
}

function getStepPromptLabel(currentStep: string) {
  switch (currentStep) {
    case "Look":
      return "Look carefully";
    case "Say":
      return "Say it aloud";
    case "Spot tricky bit":
      return "Find the tricky bit";
    case "Show rule":
      return "Notice the rule";
    case "Compare example":
      return "Choose the right spelling";
    case "Say rule":
      return "Say the rule";
    case "Break apart":
      return "Split the word";
    case "Explain parts":
      return "Think about the parts";
    case "Rebuild":
      return "Put it back together";
    case "Hear sound":
      return "Hear the sound";
    case "Choose grapheme":
      return "Choose the spelling";
    case "Read sentence":
      return "Read the sentence";
    case "Choose meaning word":
      return "Choose the word";
    case "Say sentence":
      return "Say the sentence";
    case "Cover":
      return "Cover it up";
    case "Write":
      return "Write it";
    case "Check":
      return "Check it";
    case "Use":
      return "Use it";
    default:
      return currentStep;
  }
}

function getMicroTaskFeedback(
  lessonType: LessonType,
  task: MicroTask,
  selectedOption: MicroTaskOption,
  word: string,
) {
  if (selectedOption.isCorrect) {
    if (lessonType === "sound") {
      return `Yes, ${word} uses that spelling pattern. Keep it in your head before you write.`;
    }

    return "Yes, that fits this word. Keep that in your head before you write.";
  }

  const correctOption = task.options.find((option) => option.isCorrect) ?? null;

  if (lessonType === "sound") {
    return correctOption
      ? `Nearly. ${word} uses ${correctOption.label}, not ${selectedOption.label}. Notice the spelling pattern before you write it.`
      : "Nearly. Have another careful look at the spelling pattern before you write it.";
  }

  return correctOption
    ? `Nearly. The better choice here was ${correctOption.label}. Notice that before you move on.`
    : "Have another look and notice what the word is showing you before you move on.";
}

function getEarnedBadges(goldCoinAwarded: boolean): RewardBadge[] {
  const badges: RewardBadge[] = [];

  if (goldCoinAwarded) {
    badges.push({ label: "+1 Gold Coin", tone: "gold" });
  }

  return badges;
}

function getNextStepIndexForInteractiveTask(
  lessonType: LessonType,
  steps: readonly string[],
  currentStepIndex: number,
  selectedOption: MicroTaskOption | null,
) {
  if (
    lessonType === "sound" &&
    selectedOption?.isCorrect
  ) {
    const coverStepIndex = steps.indexOf("Cover");
    if (coverStepIndex >= 0) {
      return coverStepIndex;
    }
  }

  return Math.min(currentStepIndex + 1, steps.length - 1);
}

function formatTimeRemaining(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function getQueueLabel(phase: PracticeWord["phase"]) {
  switch (phase) {
    case "same_family_bonus":
      return "Bonus word";
    case "due_review":
      return "Review word";
    case "related_bonus":
      return "Related word";
    case "core":
    default:
      return "Core word";
  }
}

function getStartSummaryMessage(
  plannedWordCount: number,
  sameFamilyBonusCount: number,
  dueReviewCount: number,
  relatedBonusCount: number,
  familyLabel: string | null,
) {
  if (plannedWordCount < 6) {
    return `You have ${plannedWordCount} strong words ready today, so this may be a shorter calm session.`;
  }

  if (sameFamilyBonusCount > 0) {
    return familyLabel
      ? `After your core six, you can keep going with more ${familyLabel.toLowerCase()} words.`
      : "After your core six, you can keep going with more words from the same lesson.";
  }

  if (dueReviewCount > 0) {
    return "After your core six, you can carry on with review words that are due today.";
  }

  if (relatedBonusCount > 0) {
    return "After your core six, you may get a few closely related words if there is still time.";
  }

  return "If no more strong words are ready after your core six, the session will end cleanly.";
}

export function PracticeSession({
  childId,
  childName,
  sessionMode,
  assignmentId,
  assignmentTitle,
  lessonType,
  familyId,
  familyLabel,
  teachingNote,
  familyWords,
  promptExamples,
  targetWords,
  reviewWords,
  words,
  plannedWordCount,
  status,
  isReviewOnly,
  sameFamilyBonusCount,
  dueReviewCount,
  relatedBonusCount,
  goldCoinCount,
}: PracticeSessionProps) {
  const [state, formAction, isPending] = useActionState(
    savePracticeAttempt,
    initialPracticeAttemptState,
  );
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [submittedWord, setSubmittedWord] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState(
    CHILD_MODE_DURATION_SECONDS,
  );
  const [sessionStarted, setSessionStarted] = useState(sessionMode !== "child");
  const [completedWords, setCompletedWords] = useState<string[]>([]);
  const [finishState, setFinishState] = useState<FinishState>(null);
  const [isFinalising, startFinalising] = useTransition();
  const [selectedMicroTaskOptionId, setSelectedMicroTaskOptionId] = useState<string | null>(null);
  const [coverAmount, setCoverAmount] = useState(0);
  const finalizedRef = useRef(false);
  const sessionStartedAtRef = useRef<string | null>(null);

  const isTimedChildSession = sessionMode === "child";
  const isStartScreen = isTimedChildSession && !sessionStarted;
  const steps = LESSON_STEP_FLOWS[lessonType];
  const currentStep = steps[currentStepIndex] ?? steps[0];
  const currentWord = words[currentWordIndex] ?? null;
  const timerExpired = isTimedChildSession && sessionStarted && remainingSeconds <= 0;
  const hasReachedEndOfQueue = currentWord === null;
  const isFinished = words.length === 0 || timerExpired || hasReachedEndOfQueue;
  const progressValue = isTimedChildSession
    ? ((CHILD_MODE_DURATION_SECONDS - remainingSeconds) / CHILD_MODE_DURATION_SECONDS) * 100
    : words.length === 0
      ? 0
      : ((currentWordIndex + 1) / words.length) * 100;
  const bonusWords = words.slice(plannedWordCount).map((item) => item.word);
  const isBonusWord = currentWordIndex >= plannedWordCount;
  const hasBonusWords = bonusWords.length > 0;
  const startsBonusNext =
    !isBonusWord &&
    currentWordIndex === plannedWordCount - 1 &&
    hasBonusWords;
  const completedWordCount = completedWords.length;
  const earnedGoldCoin = finishState?.goldCoinAwarded ?? false;
  const displayedGoldCoinCount = finishState?.goldCoinCount ?? goldCoinCount;
  const assignmentCompleted = finishState?.assignmentCompleted ?? status === "completed";
  const nextWord = words[currentWordIndex + 1] ?? null;
  const interactiveTaskStep = INTERACTIVE_STEP_BY_LESSON[lessonType];
  const interactiveTask =
    currentWord
      ? buildMicroTask(
          lessonType,
          familyId,
          familyWords,
          promptExamples,
          currentWord.word,
          teachingNote,
        )
      : null;
  const selectedMicroTaskOption =
    interactiveTask?.options.find((option) => option.id === selectedMicroTaskOptionId) ?? null;
  const hasCompletedInteractiveTask = selectedMicroTaskOption !== null;
  const earnedBadges = getEarnedBadges(earnedGoldCoin);

  useEffect(() => {
    if (!isTimedChildSession || !sessionStarted || remainingSeconds <= 0) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setRemainingSeconds((seconds) => Math.max(seconds - 1, 0));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isTimedChildSession, sessionStarted, remainingSeconds]);

  const latestCheckSummary = useMemo(() => {
    if (!state.savedWord || state.isCorrect === null) {
      return null;
    }

    return state.isCorrect
      ? `You spelled ${state.savedWord} correctly.`
      : `You wrote ${state.submittedWord}, and the target word was ${state.savedWord}.`;
  }, [state.isCorrect, state.savedWord, state.submittedWord]);

  useEffect(() => {
    if (!state.savedWord || state.isCorrect === null || !currentWord) {
      return;
    }

    if (state.savedWord !== currentWord.word) {
      return;
    }

    setCurrentStepIndex(5);
  }, [currentWord, state.isCorrect, state.savedWord]);

  useEffect(() => {
    setSelectedMicroTaskOptionId(null);
  }, [currentWordIndex, currentStep]);

  useEffect(() => {
    setCoverAmount(currentStep === "Cover" ? 0 : 0);
  }, [currentStep, currentWordIndex]);

  useEffect(() => {
    if (currentStep !== "Check" || !latestCheckSummary) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const useStepIndex = steps.indexOf("Use");
      if (useStepIndex >= 0) {
        setCurrentStepIndex(useStepIndex);
      }
    }, 1200);

    return () => window.clearTimeout(timeoutId);
  }, [currentStep, latestCheckSummary, steps]);

  useEffect(() => {
    if (!isTimedChildSession || !isFinished || finalizedRef.current) {
      return;
    }

    finalizedRef.current = true;
    startFinalising(async () => {
      const result = await completePracticeSession({
        childId,
        dailyAssignmentId: assignmentId,
        completedWords: completedWordCount,
        plannedWordCount,
        startedAt: sessionStartedAtRef.current,
      });
      setFinishState(result);
    });
  }, [
    assignmentId,
    childId,
    completedWordCount,
    isFinished,
    isTimedChildSession,
    plannedWordCount,
  ]);

  if (isStartScreen) {
    const focusWord = targetWords[0] ?? reviewWords[0] ?? words[0]?.word ?? "today's word";

    return (
      <section className="brand-card rounded-3xl p-6 md:p-8">
        <div className="grid gap-5 rounded-[2rem] bg-[rgba(252,228,244,0.38)] p-6 md:p-8">
          <p className="brand-eyebrow">Today&apos;s learning</p>
          <h2 className="brand-title text-4xl font-semibold tracking-tight md:text-5xl">
            Start your 10 minute spelling session
          </h2>
          <p className="brand-copy max-w-2xl text-base leading-7">
            Start when you feel ready. You&apos;ll begin with{" "}
            <span className="font-semibold text-[color:var(--ink)]">{focusWord}</span>,
            work through your core six, and then keep going with bonus practice if there is
            still time.
          </p>

          <div className="flex flex-wrap gap-3 text-sm text-[color:var(--mid)]">
            <span className="brand-chip px-4 py-2 text-sm font-medium">
              10 minutes
            </span>
            <span className="brand-chip px-4 py-2 text-sm font-medium">
              {plannedWordCount} core words
            </span>
            <span className="brand-chip px-4 py-2 text-sm font-medium">
              Gold Coins {goldCoinCount}
            </span>
          </div>

          {teachingNote ? (
            <p className="rounded-2xl border border-[var(--border)] bg-white/70 px-4 py-3 text-sm leading-6 text-[color:var(--ink)]">
              Bit of help: {teachingNote}
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => {
              sessionStartedAtRef.current = new Date().toISOString();
              setSessionStarted(true);
            }}
            className="brand-primary-btn mt-2"
          >
            Start session
          </button>
          <p className="text-sm leading-6 text-[color:var(--mid)]">
            The timer starts when you press start.{" "}
            {getStartSummaryMessage(
              plannedWordCount,
              sameFamilyBonusCount,
              dueReviewCount,
              relatedBonusCount,
              familyLabel,
            )}
          </p>
        </div>
      </section>
    );
  }

  if (isFinished) {
    return (
      <section className="brand-card rounded-3xl p-6 md:p-8">
        <p className="brand-eyebrow">
          {isTimedChildSession ? "Session complete" : "Practice complete"}
        </p>
        <h2 className="brand-title mt-3 text-3xl font-semibold tracking-tight">
          {isTimedChildSession
            ? `Lovely spelling session for ${childName}`
            : `Nice calm practice session for ${childName}`}
        </h2>
        <p className="brand-copy mt-3 max-w-2xl text-sm leading-6">
          You completed {completedWordCount} word{completedWordCount === 1 ? "" : "s"} in this session.
          {assignmentCompleted ? " The core session is complete." : ""}
          {timerExpired ? " The 10 minute timer has finished." : ""}
          {!timerExpired && !hasBonusWords ? " You reached the end of today's strong queue." : ""}
        </p>

        {earnedBadges.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-3">
            {earnedBadges.map((badge) => (
              <span
                key={badge.label}
                className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold ${
                  badge.tone === "gold"
                    ? "bg-[rgba(255,228,156,0.45)] text-[#8a5a00]"
                    : "bg-[rgba(232,145,200,0.18)] text-[color:var(--scarlett)]"
                }`}
              >
                {badge.label}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-[2rem] border border-zinc-200 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Words completed
            </p>
            <p className="mt-3 text-3xl font-semibold text-zinc-950">
              {completedWordCount}
            </p>
          </div>
          <div className="rounded-[2rem] border border-zinc-200 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Gold Coins
            </p>
            <p className="mt-3 text-3xl font-semibold text-zinc-950">
              {displayedGoldCoinCount}
            </p>
            {earnedGoldCoin ? (
              <span className="mt-3 inline-flex w-fit items-center rounded-full bg-[rgba(255,228,156,0.45)] px-3 py-1 text-sm font-semibold text-[#8a5a00]">
                +1 Gold Coin
              </span>
            ) : null}
          </div>
          <div className="rounded-[2rem] border border-zinc-200 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Daily session
            </p>
            <p className="mt-3 text-3xl font-semibold text-zinc-950">
              {assignmentCompleted ? "Done" : "Logged"}
            </p>
            <span className="mt-3 inline-flex w-fit items-center rounded-full bg-[rgba(252,228,244,0.18)] px-3 py-1 text-sm font-semibold text-[color:var(--scarlett)]">
              {assignmentCompleted ? "Meaningful session complete" : "Good progress made"}
            </span>
          </div>
        </div>

        {finishState?.error ? (
          <p className="mt-4 text-sm text-rose-600">{finishState.error}</p>
        ) : null}
        {isFinalising ? (
          <p className="mt-4 text-sm text-zinc-500">Saving your session...</p>
        ) : null}
      </section>
    );
  }

  const activeWord = currentWord!;
  const queueLabel = getQueueLabel(activeWord.phase);
  const stepPromptLabel = getStepPromptLabel(currentStep);
  const nextWordLabel =
    currentWordIndex === words.length - 1
      ? "Finish session"
      : startsBonusNext
        ? "Start bonus words"
        : "Next word";
  const queueRemaining = Math.max(words.length - currentWordIndex - 1, 0);

  return (
    <section className="brand-card grid gap-4 rounded-3xl p-5 md:p-6">
      <div className="grid gap-2">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="brand-chip px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]">
              {queueLabel}
            </span>
            <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
              {stepPromptLabel}
            </span>
          </div>

          <div className="brand-chip px-4 py-2 text-sm font-medium">
            {isTimedChildSession
              ? `${formatTimeRemaining(remainingSeconds)} left`
              : `Word ${currentWordIndex + 1} of ${words.length}`}
          </div>
        </div>

        <div className="grid gap-2 text-center lg:justify-items-center">
          <h2 className="brand-title text-4xl font-semibold tracking-tight md:text-5xl">
            {getStageDisplayWord(activeWord.word, currentStep)}
          </h2>
          <div className="w-full max-w-2xl rounded-[1.5rem] border border-[var(--border)] bg-white px-4 py-3 text-left shadow-[0_10px_24px_rgba(183,71,128,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--mid)]">
              Your job now
            </p>
            <p className="mt-1.5 text-base font-semibold leading-6 text-[color:var(--ink)] md:text-lg">
              {getStepMessage(lessonType, currentStep, teachingNote)}
            </p>
            {teachingNote && currentStep !== "Choose grapheme" ? (
              <p className="mt-2 rounded-2xl bg-[rgba(236,244,255,0.9)] px-3 py-2 text-sm font-medium leading-5 text-[#2b5d93]">
                Helpful reminder: {teachingNote}
              </p>
            ) : null}
          </div>
          {startsBonusNext ? (
            <p className="text-sm font-medium text-[color:var(--mid)]">
              {nextWord?.phase === "same_family_bonus"
                ? familyLabel
                  ? `You're about to finish the core six and move into more ${familyLabel.toLowerCase()} words.`
                  : "You're about to finish the core six and move into more words from the same lesson."
                : nextWord?.phase === "due_review"
                  ? "You're about to finish the core six and move into review words due today."
                  : nextWord?.phase === "related_bonus"
                    ? "You're about to finish the core six and move into a few closely related words."
                    : "You're about to finish the core six."}
            </p>
          ) : null}
          {isBonusWord && activeWord.phase === "same_family_bonus" ? (
            <p className="text-sm font-medium text-[color:var(--mid)]">
              Bonus words help you stretch beyond the core session and make the learning more secure.
            </p>
          ) : null}
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-[rgba(232,145,200,0.18)]">
          <div
            className="h-full rounded-full bg-[linear-gradient(135deg,var(--scarlett),#d53d81)] transition-all"
            style={{ width: `${progressValue}%` }}
          />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_280px]">
        <div className="rounded-[2rem] bg-[rgba(252,228,244,0.42)] p-5">
          {currentStep === interactiveTaskStep && interactiveTask ? (
            <div className="grid gap-4">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <p className="text-sm font-semibold text-zinc-950">
                  {interactiveTask.prompt}
                </p>
                <p className="mt-2 text-sm leading-6 text-zinc-600">
                  {interactiveTask.support}
                </p>
                {interactiveTask.sentence ? (
                  <p className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-900">
                    {interactiveTask.sentence}
                  </p>
                ) : null}

                <div className="mt-4 grid gap-3">
                  {interactiveTask.options.map((option) => {
                    const isSelected = selectedMicroTaskOptionId === option.id;
                    const isCorrectSelection = isSelected && option.isCorrect;
                    const isWrongSelection = isSelected && !option.isCorrect;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setSelectedMicroTaskOptionId(option.id)}
                        className={`rounded-2xl border px-4 py-3 text-left text-sm font-medium transition ${
                          isCorrectSelection
                            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                            : isWrongSelection
                              ? "border-amber-300 bg-amber-50 text-amber-900"
                              : "border-zinc-200 bg-white text-zinc-800 hover:border-[var(--scarlett)]"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                {selectedMicroTaskOption ? (
                  <p
                    className={`mt-4 text-sm font-medium ${
                      selectedMicroTaskOption.isCorrect
                        ? "text-emerald-700"
                        : "text-amber-700"
                    }`}
                  >
                    {getMicroTaskFeedback(
                      lessonType,
                      interactiveTask,
                      selectedMicroTaskOption,
                      currentWord.word,
                    )}
                  </p>
                ) : null}

                <button
                  type="button"
                  onClick={() =>
                    setCurrentStepIndex((step) =>
                      getNextStepIndexForInteractiveTask(
                        lessonType,
                        steps,
                        step,
                        selectedMicroTaskOption,
                      ),
                    )
                  }
                  disabled={!hasCompletedInteractiveTask}
                  className="brand-primary-btn mt-4 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {selectedMicroTaskOption?.isCorrect && lessonType === "sound"
                    ? "Go straight to cover"
                    : selectedMicroTaskOption?.isCorrect
                      ? "Continue to cover"
                    : selectedMicroTaskOption
                      ? "I understand, continue"
                      : "Continue to cover"}
                </button>
              </div>
            </div>
          ) : currentStep === "Cover" ? (
            <div className="grid gap-4">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <p className="text-base font-semibold text-zinc-950">
                  Slide right until the word is fully covered.
                </p>
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="relative mx-auto flex max-w-md items-center justify-center overflow-hidden rounded-2xl bg-white px-6 py-8">
                    <span className="text-4xl font-semibold tracking-tight text-zinc-950 md:text-5xl">
                      {activeWord.word}
                    </span>
                    <div
                      className="pointer-events-none absolute inset-y-0 left-0 border-r border-zinc-200 bg-[rgb(250,244,247)] transition-[width]"
                      style={{ width: `${coverAmount}%` }}
                    />
                  </div>
                  <label className="mt-4 grid gap-2 text-sm font-medium text-zinc-700">
                    Cover the word
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={coverAmount}
                      onChange={(event) => setCoverAmount(Number(event.target.value))}
                      className="w-full"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setCurrentStepIndex((step) => Math.min(step + 1, steps.length - 1))
                  }
                  disabled={coverAmount < 90}
                  className="brand-primary-btn mt-4 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Continue to write
                </button>
              </div>
            </div>
          ) : currentStep !== "Write" && currentStep !== "Check" && currentStep !== "Use" ? (
            <button
              type="button"
              onClick={() => setCurrentStepIndex((step) => Math.min(step + 1, steps.length - 1))}
              className="brand-primary-btn"
            >
              Next step
            </button>
          ) : null}

          {currentStep === "Write" ? (
            <form action={formAction} className="grid gap-4">
              <input type="hidden" name="child_id" value={childId} />
              <input type="hidden" name="daily_assignment_id" value={assignmentId} />
              <input
                type="hidden"
                name="word_progress_id"
                value={activeWord.wordProgressId ?? ""}
              />
              <input
                type="hidden"
                name="allow_session_word"
                value={isBonusWord || activeWord.kind === "review" ? "on" : ""}
              />
              <input type="hidden" name="target_word" value={activeWord.word} />
              <label className="grid gap-2 text-sm font-medium text-[color:var(--mid)]">
                Type the word from memory
                <input
                  type="text"
                  name="submitted_word"
                  autoComplete="off"
                  value={submittedWord}
                  onChange={(event) => setSubmittedWord(event.target.value)}
                  className="brand-input h-12 rounded-2xl px-4 text-base transition"
                  placeholder="Type the word here"
                />
              </label>

              <label className="brand-copy flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  name="felt_tricky"
                  className="h-4 w-4 rounded border-zinc-300"
                />
                This one felt tricky even if it was right
              </label>

              {state.error ? (
                <p className="text-sm text-rose-600">{state.error}</p>
              ) : null}

              <button
                type="submit"
                disabled={isPending || submittedWord.trim().length === 0}
                className="brand-primary-btn disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "Checking..." : "Check word"}
              </button>
            </form>
          ) : null}

          {currentStep === "Check" && latestCheckSummary ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <p
                className={`text-sm font-medium ${
                  state.isCorrect ? "text-emerald-700" : "text-amber-700"
                }`}
              >
                {state.isCorrect ? "Correct" : "Check carefully"}
              </p>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                {latestCheckSummary}
              </p>
              <p className="mt-3 text-sm font-medium text-zinc-500">
                Moving on...
              </p>
            </div>
          ) : null}

          {currentStep === "Use" ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <p className="text-sm leading-6 text-zinc-600">
                Say a short sentence aloud using{" "}
                <span className="font-semibold text-zinc-950">{activeWord.word}</span>.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSubmittedWord("");
                  setCurrentStepIndex(0);
                  setCompletedWords((existing) =>
                    existing.includes(activeWord.word)
                      ? existing
                      : [...existing, activeWord.word],
                  );
                  setCurrentWordIndex((index) => index + 1);
                }}
                className="mt-4 inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition hover:bg-zinc-800"
              >
                {nextWordLabel}
              </button>
            </div>
          ) : null}
        </div>

        <aside className="grid gap-4">
          <div className="rounded-[2rem] border border-zinc-200 p-5">
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Session progress
            </h3>
            <div className="mt-4 grid gap-4">
              <div className="grid gap-1">
                <p className="text-sm text-zinc-500">Completed</p>
                <p className="text-2xl font-semibold text-zinc-950">{completedWordCount}</p>
              </div>
              <div className="grid gap-1">
                <p className="text-sm text-zinc-500">Queue left</p>
                <p className="text-2xl font-semibold text-zinc-950">{queueRemaining}</p>
              </div>
              <div className="grid gap-1">
                <p className="text-sm text-zinc-500">Gold Coins</p>
                <p className="text-2xl font-semibold text-zinc-950">
                  {displayedGoldCoinCount}
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-3">
              <div className="grid gap-2">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  <span>Core six</span>
                  <span>
                    {Math.min(completedWordCount, plannedWordCount)}/{plannedWordCount}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(135deg,var(--scarlett),#d53d81)] transition-all"
                    style={{
                      width: `${plannedWordCount === 0 ? 0 : (Math.min(completedWordCount, plannedWordCount) / plannedWordCount) * 100}%`,
                    }}
                  />
                </div>
              </div>

              {bonusWords.length > 0 ? (
                <div className="grid gap-2">
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    <span>Bonus</span>
                    <span>
                      {Math.max(completedWordCount - plannedWordCount, 0)}/{bonusWords.length}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-full rounded-full bg-amber-400 transition-all"
                      style={{
                        width: `${bonusWords.length === 0 ? 0 : (Math.min(Math.max(completedWordCount - plannedWordCount, 0), bonusWords.length) / bonusWords.length) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {isReviewOnly ? (
            <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5">
              <p className="text-sm font-medium text-amber-900">
                Today is a review-only session.
              </p>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
