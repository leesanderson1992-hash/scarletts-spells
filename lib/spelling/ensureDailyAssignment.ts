import {
  resolvePracticeFamily,
  type WordFamilyRecord,
} from "@/lib/spelling/familyCatalog";
import {
  getAssignableLearningItemsForChild,
  getLearningItemIssueLinks,
  getMicroSkillCatalogRows,
} from "@/lib/writing-practice/queries";
import {
  buildCanonicalLearningItemWords,
  getCleanPracticeWords,
  type WritingIssueAssignmentWordProjection,
} from "@/lib/writing-practice/practice-runtime";
import type {
  LearningItemPracticeRoute,
  LearningItemRow,
  MicroSkillCatalogRow,
} from "@/lib/writing-practice/types";
import {
  findWordFamilyForWord,
  type WordFamilyId,
} from "@/lib/spelling/wordFamilies";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type EnsureDailyAssignmentRow = {
  id: string;
  title: string | null;
  instructions: string | null;
  focus_word?: string | null;
  selected_family_slug?: string | null;
  assignment_generation_source?: string | null;
  source_learning_item_ids?: string[] | null;
  target_words: string[] | null;
  review_words: string[] | null;
  status: string | null;
  assignment_date: string;
  session_started_at?: string | null;
  session_completed_at?: string | null;
  session_completed_words?: number | null;
  gold_coin_awarded?: boolean | null;
  ingredient_awarded?: boolean | null;
};

type AssignmentFamilyHistoryRow = {
  target_words: string[] | null;
  selected_family_slug: string | null;
  assignment_date: string;
};

type CanonicalAssignmentCandidate = {
  learningItem: LearningItemRow;
  catalogRow: MicroSkillCatalogRow;
  words: string[];
};

const CANONICAL_ASSIGNMENT_SOURCE = "learning_items" as const;
const SUPPORTED_ASSIGNMENT_ROUTES = new Set<LearningItemPracticeRoute>([
  "word_practice",
  "grouped_set_practice",
]);

function getCleanWords(words: string[] | null) {
  return getCleanPracticeWords(words);
}

function isDueReviewItem(item: LearningItemRow, today: string) {
  if (!item.review_due_at) {
    return false;
  }

  return item.review_due_at.slice(0, 10) <= today;
}

function compareDueReviewItems(left: LearningItemRow, right: LearningItemRow) {
  const leftDue = left.review_due_at ?? "";
  const rightDue = right.review_due_at ?? "";

  if (leftDue !== rightDue) {
    return leftDue.localeCompare(rightDue);
  }

  if (left.updated_at !== right.updated_at) {
    return right.updated_at.localeCompare(left.updated_at);
  }

  if (left.created_at !== right.created_at) {
    return right.created_at.localeCompare(left.created_at);
  }

  return right.id.localeCompare(left.id);
}

function buildCanonicalLearningItemAssignment(input: {
  learningItems: LearningItemRow[];
  catalogRows: MicroSkillCatalogRow[];
  issueLinks: Awaited<ReturnType<typeof getLearningItemIssueLinks>>;
  issueRows: WritingIssueAssignmentWordProjection[];
  assignmentDate: string;
}) {
  const {
    learningItems,
    catalogRows,
    issueLinks,
    issueRows,
    assignmentDate,
  } = input;

  const catalogByKey = new Map(
    catalogRows.map((row) => [row.micro_skill_key, row]),
  );
  const issueLinksByLearningItemId = new Map<string, string[]>();

  for (const link of issueLinks) {
    const existing = issueLinksByLearningItemId.get(link.learning_item_id) ?? [];
    existing.push(link.writing_issue_id);
    issueLinksByLearningItemId.set(link.learning_item_id, existing);
  }

  const issueById = new Map(issueRows.map((issue) => [issue.id, issue]));
  const candidates: CanonicalAssignmentCandidate[] = learningItems
    .filter(
      (item) =>
        item.practice_route !== null &&
        SUPPORTED_ASSIGNMENT_ROUTES.has(item.practice_route) &&
        catalogByKey.has(item.micro_skill_key),
    )
    .map((item) => {
      const catalogRow = catalogByKey.get(item.micro_skill_key);

      if (!catalogRow || catalogRow.practice_route !== item.practice_route) {
        return null;
      }

      const linkedIssues = (issueLinksByLearningItemId.get(item.id) ?? [])
        .map((issueId) => issueById.get(issueId))
        .filter((issue): issue is WritingIssueAssignmentWordProjection => Boolean(issue));
      const words = buildCanonicalLearningItemWords(item, catalogRow, linkedIssues);

      if (words.length === 0) {
        return null;
      }

      return {
        learningItem: item,
        catalogRow,
        words,
      };
    })
    .filter((candidate): candidate is CanonicalAssignmentCandidate => Boolean(candidate));

  if (candidates.length === 0) {
    return null;
  }

  const dueReviewCandidates = candidates
    .filter((candidate) => isDueReviewItem(candidate.learningItem, assignmentDate))
    .sort((left, right) =>
      compareDueReviewItems(left.learningItem, right.learningItem),
    )
    .slice(0, 2);
  const selectedLearningItemIds = new Set(
    dueReviewCandidates.map((candidate) => candidate.learningItem.id),
  );
  const newLearningCandidate =
    candidates.find(
      (candidate) =>
        !selectedLearningItemIds.has(candidate.learningItem.id) &&
        !isDueReviewItem(candidate.learningItem, assignmentDate),
    ) ?? null;
  const selectedCandidates = [
    ...dueReviewCandidates,
    ...(newLearningCandidate ? [newLearningCandidate] : []),
  ];

  if (selectedCandidates.length === 0) {
    return null;
  }

  const primaryCandidate = dueReviewCandidates[0] ?? newLearningCandidate;

  if (!primaryCandidate) {
    return null;
  }

  const secondaryWords = getCleanWords(
    selectedCandidates
      .filter((candidate) => candidate.learningItem.id !== primaryCandidate.learningItem.id)
      .flatMap((candidate) => candidate.words),
  ).filter((word) => !primaryCandidate.words.includes(word));
  const assignmentTitle =
    dueReviewCandidates.length > 0 && newLearningCandidate
      ? "Today's review and new learning"
      : dueReviewCandidates.length > 0
        ? "Today's review"
        : "Today's learning";
  const assignmentInstructions =
    dueReviewCandidates.length > 0 && newLearningCandidate
      ? `Begin with due review for ${primaryCandidate.catalogRow.display_name}, then introduce one new learning stream.`
      : dueReviewCandidates.length > 0
        ? `Begin with due review for ${primaryCandidate.catalogRow.display_name}, then continue into linked review words if they are ready.`
        : `Spend ten calm minutes on ${primaryCandidate.catalogRow.display_name}, then continue into any linked review words.`;

  return {
    child_id: "",
    parent_user_id: "",
    assignment_date: assignmentDate,
    title: assignmentTitle,
    instructions: assignmentInstructions,
    focus_word: primaryCandidate.words[0] ?? null,
    selected_family_slug: null,
    assignment_generation_source: CANONICAL_ASSIGNMENT_SOURCE,
    source_learning_item_ids: selectedCandidates.map(
      (candidate) => candidate.learningItem.id,
    ),
    target_words: primaryCandidate.words,
    review_words: secondaryWords,
    status: "pending",
  };
}

async function persistGeneratedAssignment(input: {
  supabase: SupabaseServerClient;
  assignment: Omit<EnsureDailyAssignmentRow, "id"> & {
    child_id: string;
    parent_user_id: string;
  };
  existingAssignmentId?: string | null;
  existingStatus?: string | null;
}) {
  const nextStatus =
    input.existingStatus && input.existingStatus !== "completed"
      ? input.existingStatus
      : input.assignment.status ?? "pending";
  const payload = {
    ...input.assignment,
    status: nextStatus,
  };
  const mutation = input.existingAssignmentId
    ? input.supabase
        .from("daily_assignments")
        .update(payload)
        .eq("id", input.existingAssignmentId)
        .eq("parent_user_id", input.assignment.parent_user_id)
        .select(
          "id, title, instructions, focus_word, selected_family_slug, assignment_generation_source, source_learning_item_ids, target_words, review_words, status, assignment_date, session_started_at, session_completed_at, session_completed_words, gold_coin_awarded, ingredient_awarded",
        )
        .single<EnsureDailyAssignmentRow>()
    : input.supabase
        .from("daily_assignments")
        .insert(payload)
        .select(
          "id, title, instructions, focus_word, selected_family_slug, assignment_generation_source, source_learning_item_ids, target_words, review_words, status, assignment_date, session_started_at, session_completed_at, session_completed_words, gold_coin_awarded, ingredient_awarded",
        )
        .single<EnsureDailyAssignmentRow>();
  const { data } = await mutation;

  return data ?? null;
}

function selectDominantFamily(
  dueWords: string[],
  historyRows: AssignmentFamilyHistoryRow[],
) {
  const familyByWord = new Map<string, WordFamilyId>();

  for (const row of historyRows) {
    const familyId = row.selected_family_slug as WordFamilyId | null;
    if (!familyId) {
      continue;
    }

    for (const word of getCleanWords(row.target_words)) {
      if (!familyByWord.has(word)) {
        familyByWord.set(word, familyId);
      }
    }
  }

  const counts = new Map<WordFamilyId, number>();

  for (const word of dueWords) {
    const familyId =
      familyByWord.get(word) ?? findWordFamilyForWord(word)?.id ?? null;

    if (!familyId) {
      continue;
    }

    counts.set(familyId, (counts.get(familyId) ?? 0) + 1);
  }

  return Array.from(counts.entries()).sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }

    return left[0].localeCompare(right[0]);
  })[0]?.[0] ?? null;
}

export async function buildCanonicalDailyAssignmentForChild(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  today: string;
  availableFamilies: WordFamilyRecord[];
}) {
  const {
    supabase,
    parentUserId,
    childId,
    today,
    availableFamilies,
  } = input;

  const canonicalLearningItems = await getAssignableLearningItemsForChild(
    supabase,
    parentUserId,
    childId,
  );
  const canonicalMicroSkillKeys = Array.from(
    new Set(canonicalLearningItems.map((item) => item.micro_skill_key)),
  );
  const canonicalCatalogRows = await getMicroSkillCatalogRows(
    supabase,
    canonicalMicroSkillKeys,
  );
  const canonicalIssueLinks = await getLearningItemIssueLinks(
    supabase,
    parentUserId,
    canonicalLearningItems.map((item) => item.id),
  );
  const canonicalIssueIds = Array.from(
    new Set(canonicalIssueLinks.map((link) => link.writing_issue_id)),
  );
  const { data: canonicalIssueRows } = canonicalIssueIds.length
    ? await supabase
        .from("writing_issues")
        .select(
          "id, approved_replacement, suggested_replacement, observed_text",
        )
        .in("id", canonicalIssueIds)
    : { data: [] as WritingIssueAssignmentWordProjection[] };
  const canonicalAssignment = buildCanonicalLearningItemAssignment({
    learningItems: canonicalLearningItems,
    catalogRows: canonicalCatalogRows,
    issueLinks: canonicalIssueLinks,
    issueRows: (canonicalIssueRows ?? []) as WritingIssueAssignmentWordProjection[],
    assignmentDate: today,
  });

  if (canonicalAssignment) {
    return {
      ...canonicalAssignment,
      child_id: childId,
      parent_user_id: parentUserId,
    };
  }

  return null;
}

export async function upsertCanonicalDailyAssignmentForChild(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  today: string;
  availableFamilies: WordFamilyRecord[];
}) {
  const { data: todaysAssignment } = await input.supabase
    .from("daily_assignments")
    .select(
      "id, title, instructions, focus_word, selected_family_slug, assignment_generation_source, source_learning_item_ids, target_words, review_words, status, assignment_date, session_started_at, session_completed_at, session_completed_words, gold_coin_awarded, ingredient_awarded",
    )
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .eq("assignment_date", input.today)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<EnsureDailyAssignmentRow>();

  const canonicalAssignment = await buildCanonicalDailyAssignmentForChild(input);
  if (!canonicalAssignment) {
    return null;
  }

  return persistGeneratedAssignment({
    supabase: input.supabase,
    assignment: canonicalAssignment,
    existingAssignmentId: todaysAssignment?.id ?? null,
    existingStatus: todaysAssignment?.status ?? null,
  });
}

// Runtime boundary:
// child-mode assignment generation now belongs to the canonical
// learning_items-first engine. If no truthful canonical assignment can be
// built yet, this helper returns null instead of restoring a retired legacy
// fallback path.
export async function ensureChildDailyAssignment(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  today: string;
  availableFamilies: WordFamilyRecord[];
}) {
  const {
    supabase,
    parentUserId,
    childId,
    today,
  } = input;

  const { data: todaysAssignment } = await supabase
    .from("daily_assignments")
    .select(
      "id, title, instructions, focus_word, selected_family_slug, assignment_generation_source, source_learning_item_ids, target_words, review_words, status, assignment_date, session_started_at, session_completed_at, session_completed_words, gold_coin_awarded, ingredient_awarded",
    )
    .eq("parent_user_id", parentUserId)
    .eq("child_id", childId)
    .eq("assignment_date", today)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<EnsureDailyAssignmentRow>();

  if (todaysAssignment) {
    return todaysAssignment;
  }

  return upsertCanonicalDailyAssignmentForChild(input);
}
