import type { createClient } from "@/lib/supabase/server";

import {
  getAssignableLearningItemsForChild,
  getLearningItemIssueLinks,
  getMicroSkillCatalogRows,
} from "./queries";
import type {
  LearningItemIssueLinkRow,
  LearningItemPracticeRoute,
  LearningItemRow,
  MicroSkillCatalogRow,
} from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type LearningItemWordOwnershipRow = Pick<
  LearningItemRow,
  "id" | "micro_skill_key" | "practice_route"
>;
type CanonicalAssignmentOwnershipRow = {
  assignment_generation_source?: string | null;
  source_learning_item_ids?: string[] | null;
  target_words: string[] | null;
  review_words: string[] | null;
};

export type WritingIssueAssignmentWordProjection = {
  id: string;
  approved_replacement: string | null;
  suggested_replacement: string | null;
  observed_text: string | null;
};

export function getCleanPracticeWords(words: string[] | null | undefined) {
  return Array.from(
    new Set((words ?? []).map((word) => word.trim().toLowerCase()).filter(Boolean)),
  );
}

export function getStarterWordBankWords(metadata: Record<string, unknown>) {
  const starterWordBank = metadata.starter_word_bank;
  if (!Array.isArray(starterWordBank)) {
    return [] as string[];
  }

  return getCleanPracticeWords(
    starterWordBank.flatMap((entry) => {
      if (!entry || typeof entry !== "object") {
        return [];
      }

      const word = "word" in entry ? entry.word : null;
      return typeof word === "string" ? [word] : [];
    }),
  );
}

export function buildCanonicalLearningItemWords(
  learningItem: Pick<LearningItemRow, "practice_route">,
  catalogRow: MicroSkillCatalogRow,
  issueRows: WritingIssueAssignmentWordProjection[],
) {
  const issueWords = getCleanPracticeWords(
    issueRows.flatMap((issue) =>
      [issue.approved_replacement, issue.suggested_replacement].filter(
        (word): word is string => typeof word === "string",
      ),
    ),
  );
  const starterWords = getStarterWordBankWords(catalogRow.metadata);
  const maxWords = learningItem.practice_route === "word_practice" ? 4 : 6;

  return getCleanPracticeWords([...issueWords, ...starterWords]).slice(0, maxWords);
}

export function buildControlledPracticeWordLearningItemMap(input: {
  sourceLearningItemIds: string[];
  assignmentTargetWords: string[];
  assignmentReviewWords: string[];
  learningItems: LearningItemWordOwnershipRow[];
  catalogRows: MicroSkillCatalogRow[];
  issueLinks: LearningItemIssueLinkRow[];
  issueRows: WritingIssueAssignmentWordProjection[];
}) {
  const catalogByKey = new Map(
    input.catalogRows.map((row) => [row.micro_skill_key, row]),
  );
  const issueLinksByLearningItemId = new Map<string, string[]>();

  for (const link of input.issueLinks) {
    const existing = issueLinksByLearningItemId.get(link.learning_item_id) ?? [];
    existing.push(link.writing_issue_id);
    issueLinksByLearningItemId.set(link.learning_item_id, existing);
  }

  const issueById = new Map(input.issueRows.map((issue) => [issue.id, issue]));
  const orderedCandidates = input.sourceLearningItemIds
    .map((learningItemId) =>
      input.learningItems.find((learningItem) => learningItem.id === learningItemId),
    )
    .filter(
      (learningItem): learningItem is LearningItemWordOwnershipRow =>
        Boolean(learningItem),
    )
    .map((learningItem) => {
      const catalogRow = catalogByKey.get(learningItem.micro_skill_key);

      if (!catalogRow || catalogRow.practice_route !== learningItem.practice_route) {
        return null;
      }

      const linkedIssues = (issueLinksByLearningItemId.get(learningItem.id) ?? [])
        .map((issueId) => issueById.get(issueId))
        .filter((issue): issue is WritingIssueAssignmentWordProjection => Boolean(issue));
      const words = buildCanonicalLearningItemWords(
        learningItem,
        catalogRow,
        linkedIssues,
      );

      if (words.length === 0) {
        return null;
      }

      return {
        learningItemId: learningItem.id,
        words,
      };
    })
    .filter(
      (
        candidate,
      ): candidate is {
        learningItemId: string;
        words: string[];
      } => Boolean(candidate),
    );

  const wordToLearningItemId = new Map<string, string>();
  const primaryCandidate = orderedCandidates[0] ?? null;

  if (primaryCandidate) {
    for (const word of getCleanPracticeWords(input.assignmentTargetWords)) {
      if (primaryCandidate.words.includes(word)) {
        wordToLearningItemId.set(word, primaryCandidate.learningItemId);
      }
    }
  }

  const secondaryCandidates = orderedCandidates.slice(1);

  for (const word of getCleanPracticeWords(input.assignmentReviewWords)) {
    const matchingCandidates = secondaryCandidates.filter((candidate) =>
      candidate.words.includes(word),
    );

    if (matchingCandidates.length === 1) {
      wordToLearningItemId.set(word, matchingCandidates[0].learningItemId);
    }
  }

  return wordToLearningItemId;
}

export async function resolveControlledPracticeLearningItemId(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  assignment: CanonicalAssignmentOwnershipRow;
  targetWord: string;
}) {
  if (input.assignment.assignment_generation_source !== "learning_items") {
    return null;
  }

  const sourceLearningItemIds = input.assignment.source_learning_item_ids ?? [];
  if (sourceLearningItemIds.length === 0) {
    return null;
  }

  const normalisedTargetWord = input.targetWord.trim().toLowerCase();
  const assignmentTargetWords = getCleanPracticeWords(input.assignment.target_words);
  const assignmentReviewWords = getCleanPracticeWords(input.assignment.review_words)
    .filter((word) => !assignmentTargetWords.includes(word));

  if (assignmentTargetWords.includes(normalisedTargetWord)) {
    return sourceLearningItemIds[0] ?? null;
  }

  if (!assignmentReviewWords.includes(normalisedTargetWord)) {
    return null;
  }

  const { data: learningItemRows } = await input.supabase
    .from("learning_items")
    .select("id, micro_skill_key, practice_route")
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .in("id", sourceLearningItemIds);
  const learningItems = (learningItemRows ?? []) as unknown as Array<
    LearningItemWordOwnershipRow & {
      practice_route: LearningItemPracticeRoute | null;
    }
  >;

  if (learningItems.length <= 1) {
    return null;
  }

  const [issueLinks, catalogRows] = await Promise.all([
    getLearningItemIssueLinks(
      input.supabase,
      input.parentUserId,
      learningItems.map((item) => item.id),
    ),
    getMicroSkillCatalogRows(
      input.supabase,
      Array.from(new Set(learningItems.map((item) => item.micro_skill_key))),
    ),
  ]);
  const linkedWritingIssueIds = Array.from(
    new Set(issueLinks.map((link) => link.writing_issue_id)),
  );

  if (linkedWritingIssueIds.length === 0) {
    return null;
  }

  const { data: issueRowsData } = await input.supabase
    .from("writing_issues")
    .select("id, approved_replacement, suggested_replacement, observed_text")
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .in("id", linkedWritingIssueIds);
  const issueRows = (issueRowsData ?? []) as WritingIssueAssignmentWordProjection[];
  const wordToLearningItemId = buildControlledPracticeWordLearningItemMap({
    sourceLearningItemIds,
    assignmentTargetWords,
    assignmentReviewWords,
    learningItems,
    catalogRows,
    issueLinks,
    issueRows,
  });

  return wordToLearningItemId.get(normalisedTargetWord) ?? null;
}

export async function getCanonicalActivePracticeWordsForChild(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
}) {
  const learningItems = await getAssignableLearningItemsForChild(
    input.supabase,
    input.parentUserId,
    input.childId,
  );

  if (learningItems.length === 0) {
    return [] as string[];
  }

  const [issueLinks, catalogRows] = await Promise.all([
    getLearningItemIssueLinks(
      input.supabase,
      input.parentUserId,
      learningItems.map((item) => item.id),
    ),
    getMicroSkillCatalogRows(
      input.supabase,
      Array.from(new Set(learningItems.map((item) => item.micro_skill_key))),
    ),
  ]);
  const linkedWritingIssueIds = Array.from(
    new Set(issueLinks.map((link) => link.writing_issue_id)),
  );
  const { data: issueRowsData } = linkedWritingIssueIds.length
    ? await input.supabase
        .from("writing_issues")
        .select("id, approved_replacement, suggested_replacement, observed_text")
        .eq("parent_user_id", input.parentUserId)
        .eq("child_id", input.childId)
        .in("id", linkedWritingIssueIds)
    : { data: [] as WritingIssueAssignmentWordProjection[] };

  const catalogByKey = new Map(
    catalogRows.map((row) => [row.micro_skill_key, row]),
  );
  const issueLinksByLearningItemId = new Map<string, string[]>();

  for (const link of issueLinks) {
    const existing = issueLinksByLearningItemId.get(link.learning_item_id) ?? [];
    existing.push(link.writing_issue_id);
    issueLinksByLearningItemId.set(link.learning_item_id, existing);
  }

  const issueById = new Map(
    ((issueRowsData ?? []) as WritingIssueAssignmentWordProjection[]).map((issue) => [
      issue.id,
      issue,
    ]),
  );

  return getCleanPracticeWords(
    learningItems.flatMap((learningItem) => {
      const catalogRow = catalogByKey.get(learningItem.micro_skill_key);
      if (!catalogRow || catalogRow.practice_route !== learningItem.practice_route) {
        return [];
      }

      const linkedIssues = (issueLinksByLearningItemId.get(learningItem.id) ?? [])
        .map((issueId) => issueById.get(issueId))
        .filter((issue): issue is WritingIssueAssignmentWordProjection => Boolean(issue));

      return buildCanonicalLearningItemWords(
        learningItem,
        catalogRow,
        linkedIssues,
      );
    }),
  );
}
