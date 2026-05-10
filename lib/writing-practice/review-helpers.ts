import type { createClient } from "@/lib/supabase/server";

import {
  getAssignableLearningItemsForChild,
  getLearningItemIssueLinks,
  getMicroSkillCatalogRows,
  getParentProgressWritingIssueSummaries,
} from "./queries";
import {
  REVIEW_HELPER_SUGGESTION_SOURCES,
  type LearningItemRow,
  type MicroSkillCatalogRow,
  type ReviewHelperSuggestionSource,
} from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type SubmissionReviewMisspelling = {
  misspelledWord: string;
  correctedWord: string | null;
};

type HelperCandidate = {
  sourceType: ReviewHelperSuggestionSource;
  matchedWord: string;
  suggestedReplacement: string | null;
  notes: string;
  metadata: Record<string, unknown>;
  microSkillKey: string;
};

const SINGLE_WORD_PATTERN = /^[a-zA-Z'-]+$/;
const COMPLEXITY_RANK: Record<"easy" | "medium" | "hard", number> = {
  easy: 1,
  medium: 2,
  hard: 3,
};

function normaliseWord(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  return SINGLE_WORD_PATTERN.test(trimmed) ? trimmed : null;
}

function parseExampleWords(metadata: Record<string, unknown> | null | undefined) {
  const rawValue = metadata?.example_words;

  if (Array.isArray(rawValue)) {
    return rawValue
      .map((value) => normaliseWord(typeof value === "string" ? value : null))
      .filter((value): value is string => Boolean(value));
  }

  if (typeof rawValue === "string") {
    return rawValue
      .split(",")
      .map((value) => normaliseWord(value))
      .filter((value): value is string => Boolean(value));
  }

  return [] as string[];
}

function parseStarterWordBank(
  metadata: Record<string, unknown> | null | undefined,
) {
  const rawValue = metadata?.starter_word_bank;

  if (!Array.isArray(rawValue)) {
    return [] as Array<{
      word: string;
      difficulty: "easy" | "medium" | "hard" | null;
      order: number;
    }>;
  }

  return rawValue
    .map((row, index) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        return null;
      }

      const word =
        "word" in row && typeof row.word === "string" ? normaliseWord(row.word) : null;
      const difficulty =
        "difficulty" in row && typeof row.difficulty === "string"
          ? row.difficulty
          : null;

      if (!word) {
        return null;
      }

      return {
        word,
        difficulty:
          difficulty === "easy" || difficulty === "medium" || difficulty === "hard"
            ? difficulty
            : null,
        order: index,
      };
    })
    .filter(
      (
        value,
      ): value is {
        word: string;
        difficulty: "easy" | "medium" | "hard" | null;
        order: number;
      } => Boolean(value),
    );
}

function getSubmissionWords(text: string) {
  const matches = text.match(/[a-zA-Z'-]+/g) ?? [];
  return new Set(
    matches
      .map((value) => normaliseWord(value))
      .filter((value): value is string => Boolean(value)),
  );
}

function buildWatchProfile(input: {
  learningItem: LearningItemRow;
  catalogRow: MicroSkillCatalogRow | null;
  linkedIssues: Array<{
    observed_text: string | null;
    approved_replacement: string | null;
  }>;
}) {
  const targetWords = new Set<string>();
  const wrongForms = new Set<string>();
  const relatedWatchWords = new Set<string>();
  const targetWordOrder: string[] = [];
  const relatedWatchWordOrder: string[] = [];
  const difficultyByWord = new Map<string, "easy" | "medium" | "hard">();
  const seedOrderByWord = new Map<string, number>();

  const pushTargetWord = (word: string) => {
    if (targetWords.has(word)) {
      return;
    }

    targetWords.add(word);
    targetWordOrder.push(word);
  };

  const pushRelatedWord = (word: string) => {
    if (targetWords.has(word) || relatedWatchWords.has(word)) {
      return;
    }

    relatedWatchWords.add(word);
    relatedWatchWordOrder.push(word);
  };

  parseStarterWordBank(input.catalogRow?.metadata).forEach((row) => {
    seedOrderByWord.set(row.word, row.order);

    if (row.difficulty) {
      difficultyByWord.set(row.word, row.difficulty);
    }
  });

  input.linkedIssues.forEach((issue) => {
    const observedWord = normaliseWord(issue.observed_text);
    const replacementWord = normaliseWord(issue.approved_replacement);

    if (replacementWord) {
      pushTargetWord(replacementWord);
    }

    if (observedWord && observedWord !== replacementWord) {
      wrongForms.add(observedWord);
    }
  });

  parseExampleWords(input.catalogRow?.metadata).forEach((word) => {
    pushRelatedWord(word);
  });

  return {
    targetWords,
    wrongForms,
    relatedWatchWords,
    targetWordOrder,
    relatedWatchWordOrder,
    difficultyByWord,
    seedOrderByWord,
  };
}

function buildHelperNotes(sourceType: ReviewHelperSuggestionSource, matchedWord: string) {
  switch (sourceType) {
    case "historic_mistake":
      return `"${matchedWord}" may show the same weak pattern again in fresh writing.`;
    case "micro_skill_watchlist":
      return `"${matchedWord}" may be a genuine transfer opportunity for an active micro-skill.`;
    case "transfer_failure_watchlist":
      return `"${matchedWord}" may show a previously stronger skill wobbling in fresh writing.`;
  }
}

function chooseHelperCandidate(input: {
  learningItem: LearningItemRow;
  watchProfile: ReturnType<typeof buildWatchProfile>;
  submissionWords: Set<string>;
  misspellings: Array<{ misspelledWord: string | null; correctedWord: string | null }>;
}) {
  const { learningItem, watchProfile, submissionWords, misspellings } = input;
  const watchWords = new Set([
    ...watchProfile.targetWords,
    ...watchProfile.relatedWatchWords,
  ]);

  const recurrence = misspellings.find((misspelling) => {
    if (
      misspelling.correctedWord &&
      watchWords.has(misspelling.correctedWord)
    ) {
      return true;
    }

    return (
      misspelling.misspelledWord !== null &&
      watchProfile.wrongForms.has(misspelling.misspelledWord)
    );
  });

  if (recurrence) {
    const sourceType =
      learningItem.current_competency_level !== null &&
      learningItem.current_competency_level >= 3
        ? "transfer_failure_watchlist"
        : "historic_mistake";
    const matchedWord = recurrence.correctedWord ?? recurrence.misspelledWord ?? "watch match";
    const signature = [
      learningItem.id,
      sourceType,
      matchedWord,
      recurrence.correctedWord ? "watch_word" : "wrong_form",
    ].join(":");

    return {
      sourceType,
      matchedWord,
      suggestedReplacement: recurrence.correctedWord,
      notes: buildHelperNotes(sourceType, matchedWord),
      metadata: {
        helper_signature: signature,
        helper_kind: "slice6a_review_helper",
        learning_item_id: learningItem.id,
        matched_word: matchedWord,
        matched_via: recurrence.correctedWord ? "watch_word" : "wrong_form",
      },
      microSkillKey: learningItem.micro_skill_key,
    } satisfies HelperCandidate;
  }

  const positiveMatches = [
    ...watchProfile.targetWordOrder
      .filter((word) => submissionWords.has(word))
      .map((word) => ({
        word,
        matchedVia: "target_word" as const,
      })),
    ...watchProfile.relatedWatchWordOrder
      .filter((word) => submissionWords.has(word))
      .map((word) => ({
        word,
        matchedVia: "related_watch_word" as const,
      })),
  ];

  if (positiveMatches.length === 0) {
    return null;
  }

  const positiveMatch = [...positiveMatches].sort((left, right) => {
    const leftComplexity =
      COMPLEXITY_RANK[watchProfile.difficultyByWord.get(left.word) ?? "easy"];
    const rightComplexity =
      COMPLEXITY_RANK[watchProfile.difficultyByWord.get(right.word) ?? "easy"];

    if (leftComplexity !== rightComplexity) {
      return rightComplexity - leftComplexity;
    }

    if (left.matchedVia !== right.matchedVia) {
      return left.matchedVia === "target_word" ? -1 : 1;
    }

    const leftSeedOrder = watchProfile.seedOrderByWord.get(left.word) ?? Number.MAX_SAFE_INTEGER;
    const rightSeedOrder =
      watchProfile.seedOrderByWord.get(right.word) ?? Number.MAX_SAFE_INTEGER;

    if (leftSeedOrder !== rightSeedOrder) {
      return leftSeedOrder - rightSeedOrder;
    }

    return left.word.localeCompare(right.word);
  })[0];

  const signature = [
    learningItem.id,
    "micro_skill_watchlist",
    positiveMatch.word,
    positiveMatch.matchedVia,
  ].join(":");

  return {
    sourceType: "micro_skill_watchlist",
    matchedWord: positiveMatch.word,
    suggestedReplacement: null,
    notes: buildHelperNotes("micro_skill_watchlist", positiveMatch.word),
    metadata: {
      helper_signature: signature,
      helper_kind: "slice6a_review_helper",
      learning_item_id: learningItem.id,
      matched_word: positiveMatch.word,
      matched_via: positiveMatch.matchedVia,
    },
    microSkillKey: learningItem.micro_skill_key,
  } satisfies HelperCandidate;
}

export async function syncSubmissionReviewHelperSuggestions(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  taskSubmissionId: string;
  writingSampleId: string | null;
  submissionText: string;
  misspellings: SubmissionReviewMisspelling[];
}) {
  if (!input.submissionText.trim()) {
    return;
  }

  const learningItems = await getAssignableLearningItemsForChild(
    input.supabase,
    input.parentUserId,
    input.childId,
  );

  if (learningItems.length === 0) {
    return;
  }

  const learningItemIds = learningItems.map((item) => item.id);
  const [issueLinks, existingSuggestions, catalogRows] = await Promise.all([
    getLearningItemIssueLinks(input.supabase, input.parentUserId, learningItemIds),
    input.supabase
      .from("writing_issue_suggestions")
      .select("id, source_type, metadata")
      .eq("parent_user_id", input.parentUserId)
      .eq("task_submission_id", input.taskSubmissionId)
      .in("source_type", [...REVIEW_HELPER_SUGGESTION_SOURCES]),
    getMicroSkillCatalogRows(
      input.supabase,
      learningItems.map((item) => item.micro_skill_key),
    ),
  ]);

  const writingIssueIds = Array.from(new Set(issueLinks.map((row) => row.writing_issue_id)));
  const writingIssues = await getParentProgressWritingIssueSummaries(
    input.supabase,
    input.parentUserId,
    writingIssueIds,
  );

  const issueById = new Map(writingIssues.map((issue) => [issue.id, issue]));
  const catalogByKey = new Map(catalogRows.map((row) => [row.micro_skill_key, row]));
  const linksByLearningItemId = new Map<string, typeof issueLinks>();

  issueLinks.forEach((link) => {
    const existing = linksByLearningItemId.get(link.learning_item_id) ?? [];
    existing.push(link);
    linksByLearningItemId.set(link.learning_item_id, existing);
  });

  const submissionWords = getSubmissionWords(input.submissionText);
  const misspellings = input.misspellings.map((row) => ({
    misspelledWord: normaliseWord(row.misspelledWord),
    correctedWord: normaliseWord(row.correctedWord),
  }));
  const existingSignatures = new Set(
    ((existingSuggestions.data ?? []) as Array<{ metadata: Record<string, unknown> | null }>)
      .map((row) =>
        row.metadata && typeof row.metadata.helper_signature === "string"
          ? row.metadata.helper_signature
          : null,
      )
      .filter((value): value is string => Boolean(value)),
  );

  const inserts = learningItems
    .map((learningItem) => {
      const linkedIssues = (linksByLearningItemId.get(learningItem.id) ?? [])
        .map((link) => issueById.get(link.writing_issue_id) ?? null)
        .filter((issue): issue is NonNullable<typeof issue> => Boolean(issue))
        .map((issue) => ({
          observed_text: issue.observed_text,
          approved_replacement: issue.approved_replacement,
        }));
      const watchProfile = buildWatchProfile({
        learningItem,
        catalogRow: catalogByKey.get(learningItem.micro_skill_key) ?? null,
        linkedIssues,
      });
      const candidate = chooseHelperCandidate({
        learningItem,
        watchProfile,
        submissionWords,
        misspellings,
      });

      if (!candidate) {
        return null;
      }

      const signature =
        typeof candidate.metadata.helper_signature === "string"
          ? candidate.metadata.helper_signature
          : null;

      if (!signature || existingSignatures.has(signature)) {
        return null;
      }

      existingSignatures.add(signature);

      return {
        child_id: input.childId,
        parent_user_id: input.parentUserId,
        task_submission_id: input.taskSubmissionId,
        writing_sample_id: input.writingSampleId,
        source_type: candidate.sourceType,
        suggestion_status: "pending",
        observed_text: candidate.matchedWord,
        suggested_replacement: candidate.suggestedReplacement,
        suggested_micro_skill_key: candidate.microSkillKey,
        notes: candidate.notes,
        metadata: candidate.metadata,
      };
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  if (inserts.length === 0) {
    return;
  }

  await input.supabase.from("writing_issue_suggestions").insert(inserts);
}
