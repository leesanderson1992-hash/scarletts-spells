import { getWordsDueToday } from "@/lib/spelling/reviewScheduler";
import {
  resolvePracticeFamily,
  type WordFamilyRecord,
} from "@/lib/spelling/familyCatalog";
import {
  findWordFamilyForWord,
  getWordFamilyById,
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

type WordProgressRow = {
  id: string;
  target_word: string;
  review_stage?: number | null;
  last_assigned_at?: string | null;
  last_practised_at?: string | null;
  mastered_at?: string | null;
};

type AssignmentFamilyHistoryRow = {
  target_words: string[] | null;
  selected_family_slug: string | null;
  assignment_date: string;
};

function getCleanWords(words: string[] | null) {
  return Array.from(
    new Set((words ?? []).map((word) => word.trim().toLowerCase()).filter(Boolean)),
  );
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

function buildChildModeFallbackAssignment(
  dueWords: string[],
  historyRows: AssignmentFamilyHistoryRow[],
  assignmentDate: string,
  availableFamilies: WordFamilyRecord[],
) {
  const uniqueDueWords = getCleanWords(dueWords);
  if (uniqueDueWords.length === 0) {
    return null;
  }

  const selectedFamilySlug = selectDominantFamily(uniqueDueWords, historyRows);
  const resolvedFamily = selectedFamilySlug
    ? resolvePracticeFamily(selectedFamilySlug, availableFamilies)
    : null;
  const builtinFamily =
    selectedFamilySlug && !resolvedFamily
      ? getWordFamilyById(selectedFamilySlug)
      : resolvedFamily?.builtinFamilyId
        ? getWordFamilyById(resolvedFamily.builtinFamilyId)
        : null;
  const focusWord =
    uniqueDueWords.find((word) => {
      if (!selectedFamilySlug) {
        return true;
      }

      return (
        findWordFamilyForWord(word)?.id === selectedFamilySlug ||
        resolvedFamily?.practiceWords.includes(word) ||
        builtinFamily?.practiceWords.includes(word)
      );
    }) ?? uniqueDueWords[0];

  const relatedDueWords = selectedFamilySlug
    ? uniqueDueWords.filter((word) => {
        return (
          word === focusWord ||
          findWordFamilyForWord(word)?.id === selectedFamilySlug ||
          resolvedFamily?.practiceWords.includes(word) ||
          builtinFamily?.practiceWords.includes(word)
        );
      })
    : [focusWord];

  const targetWords = getCleanWords([
    focusWord,
    ...relatedDueWords,
    ...(resolvedFamily?.practiceWords ?? []),
    ...(builtinFamily?.practiceWords ?? []),
  ]).slice(0, 6);
  const reviewWords = uniqueDueWords.filter((word) => !targetWords.includes(word));
  const familyLabel = resolvedFamily?.label ?? builtinFamily?.label ?? "review pattern";

  return {
    child_id: "",
    parent_user_id: "",
    assignment_date: assignmentDate,
    title: "Today's learning",
    instructions:
      selectedFamilySlug && (resolvedFamily || builtinFamily)
        ? `Spend ten calm minutes practising the ${familyLabel} pattern, then continue into your review words.`
        : "Spend ten calm minutes practising your review words and any related spelling patterns.",
    focus_word: focusWord,
    selected_family_slug: resolvedFamily?.id ?? selectedFamilySlug,
    target_words: targetWords,
    review_words: reviewWords,
    status: "pending",
  };
}

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
    availableFamilies,
  } = input;

  const { data: todaysAssignment } = await supabase
    .from("daily_assignments")
    .select(
      "id, title, instructions, focus_word, selected_family_slug, target_words, review_words, status, assignment_date, session_started_at, session_completed_at, session_completed_words, gold_coin_awarded, ingredient_awarded",
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

  const [{ data: progressRows }, { data: familyHistoryRows }] = await Promise.all([
    supabase
      .from("word_progress")
      .select(
        "id, target_word, review_stage, last_assigned_at, last_practised_at, mastered_at",
      )
      .eq("parent_user_id", parentUserId)
      .eq("child_id", childId),
    supabase
      .from("daily_assignments")
      .select("target_words, selected_family_slug, assignment_date")
      .eq("parent_user_id", parentUserId)
      .eq("child_id", childId)
      .not("selected_family_slug", "is", null)
      .order("assignment_date", { ascending: false })
      .limit(20),
  ]);

  const dueWords = getWordsDueToday(
    (progressRows ?? []) as Array<{
      target_word: string;
      review_stage: number | null;
      last_assigned_at: string | null;
      last_practised_at: string | null;
      mastered_at: string | null;
    }>,
    today,
  ).map((row) => row.target_word);

  const fallbackAssignment = buildChildModeFallbackAssignment(
    dueWords,
    (familyHistoryRows ?? []) as AssignmentFamilyHistoryRow[],
    today,
    availableFamilies,
  );

  if (!fallbackAssignment) {
    return null;
  }

  const { data: insertedAssignment } = await supabase
    .from("daily_assignments")
    .insert({
      ...fallbackAssignment,
      child_id: childId,
      parent_user_id: parentUserId,
    })
    .select(
      "id, title, instructions, focus_word, selected_family_slug, target_words, review_words, status, assignment_date, session_started_at, session_completed_at, session_completed_words, gold_coin_awarded, ingredient_awarded",
    )
    .single<EnsureDailyAssignmentRow>();

  return insertedAssignment ?? null;
}
