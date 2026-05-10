"use server";

import { revalidatePath } from "next/cache";

import { awardGoldCoins } from "@/lib/rewards/course-coins";
import { getChildRewardLedgerReadModel } from "@/lib/rewards/read-model";
import { syncSpellingRewardState } from "@/lib/rewards/spelling-rewards";
import { createClient } from "@/lib/supabase/server";
import {
  getCleanPracticeWords,
  resolveControlledPracticeLearningItemId,
} from "@/lib/writing-practice/practice-runtime";

type PracticeAttemptMode = "spelling" | "review";

type CanonicalAssignmentRow = {
  id: string;
  child_id: string;
  parent_user_id: string;
  assignment_generation_source?: string | null;
  source_learning_item_ids?: string[] | null;
  target_words: string[] | null;
  review_words: string[] | null;
};

export type SavePracticeAttemptState = {
  error: string | null;
  savedWord: string | null;
  submittedWord: string;
  isCorrect: boolean | null;
  assignmentCompleted: boolean;
  awardedGoldenNugget: boolean;
  awardedGoldBar: boolean;
};

export type CompletePracticeSessionResult = {
  error: string | null;
  completedWords: number;
  goldCoinAwarded: boolean;
  goldCoinCount: number;
  assignmentCompleted: boolean;
};

function normaliseWord(word: string) {
  return word.trim().toLowerCase();
}

function getOrderedAssignmentWords(
  targetWords: string[] | null,
  reviewWords: string[] | null,
) {
  const cleanTargetWords = getCleanPracticeWords(targetWords);
  const cleanReviewWords = getCleanPracticeWords(reviewWords)
    .filter((word) => !cleanTargetWords.includes(word));

  return [...cleanTargetWords, ...cleanReviewWords];
}

function wasAttemptSubmittedVeryRecently(attemptedAt: string) {
  const recentThreshold = Date.now() - 15_000;
  return new Date(attemptedAt).getTime() >= recentThreshold;
}

async function writeControlledPracticeEvidence(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  parentUserId: string;
  childId: string;
  learningItemId: string | null;
  dailyAssignmentId: string;
  targetWord: string;
  submittedWord: string;
  isCorrect: boolean;
  feltWeak: boolean;
  attemptMode: PracticeAttemptMode;
  attemptedAt: string;
}) {
  if (!input.learningItemId) {
    return null;
  }

  const { data, error } = await input.supabase.rpc(
    "record_controlled_practice_learning_item_evidence",
    {
    p_learning_item_id: input.learningItemId,
    p_parent_user_id: input.parentUserId,
    p_child_id: input.childId,
    p_daily_assignment_id: input.dailyAssignmentId,
    p_target_word: input.targetWord,
    p_submitted_word: input.submittedWord,
    p_is_correct: input.isCorrect,
    p_felt_weak: input.feltWeak,
    p_attempt_mode: input.attemptMode,
    p_attempted_at: input.attemptedAt,
    },
  );

  if (error) {
    return "Word checked, but learning progress is still syncing.";
  }

  const evidenceWritten = Boolean(
    data &&
      typeof data === "object" &&
      "evidence_written" in data &&
      data.evidence_written,
  );

  return evidenceWritten
    ? null
    : "Word checked, but learning progress is still syncing.";
}

type CompletePracticeSessionInput = {
  childId: string;
  dailyAssignmentId: string;
  completedWords: number;
  plannedWordCount: number;
  startedAt: string | null;
};

export async function completePracticeSession(
  input: CompletePracticeSessionInput,
): Promise<CompletePracticeSessionResult> {
  const safeCompletedWords = Math.max(0, Math.floor(input.completedWords));
  const safePlannedWordCount = Math.max(0, Math.floor(input.plannedWordCount));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: "You need to sign in again before finishing this session.",
      completedWords: safeCompletedWords,
      goldCoinAwarded: false,
      goldCoinCount: 0,
      assignmentCompleted: false,
    };
  }

  const today = new Date().toISOString().slice(0, 10);

  const [{ data: assignment }, { count: courseLogCount }] = await Promise.all([
    supabase
      .from("daily_assignments")
      .select(
        "id, child_id, parent_user_id, session_completed_words, ingredient_awarded, gold_coin_awarded, status",
      )
      .eq("id", input.dailyAssignmentId)
      .eq("child_id", input.childId)
      .eq("parent_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("task_completions")
      .select("*", { count: "exact", head: true })
      .eq("child_id", input.childId)
      .eq("parent_user_id", user.id)
      .eq("completion_date", today),
  ]);

  if (!assignment) {
    return {
      error: "We couldn't finish that spelling session.",
      completedWords: safeCompletedWords,
      goldCoinAwarded: false,
      goldCoinCount: 0,
      assignmentCompleted: false,
    };
  }

  const assignmentCompleted = safeCompletedWords >= safePlannedWordCount;
  const shouldAwardGoldCoin =
    assignmentCompleted &&
    (courseLogCount ?? 0) === 0 &&
    !((assignment as { gold_coin_awarded?: boolean | null }).gold_coin_awarded ?? false);

  let nextGoldCoinCount = (
    await getChildRewardLedgerReadModel({
      supabase,
      parentUserId: user.id,
      childId: input.childId,
    })
  ).spendableSnapshot.spendableGoldCoins;

  if (shouldAwardGoldCoin) {
    const awarded = await awardGoldCoins({
      supabase,
      parentUserId: user.id,
      childId: input.childId,
      amount: 1,
      eventType: "earned_daily",
      source: "spelling_session",
      relatedEntityType: "daily_assignment",
      relatedEntityId: assignment.id,
      notes: "Daily Gold Coin earned from a meaningful completed spelling session.",
    });

    if (awarded) {
      nextGoldCoinCount = (
        await getChildRewardLedgerReadModel({
          supabase,
          parentUserId: user.id,
          childId: input.childId,
        })
      ).spendableSnapshot.spendableGoldCoins;
    }
  }

  await supabase
    .from("daily_assignments")
    .update({
      session_started_at: input.startedAt ?? null,
      session_completed_at: new Date().toISOString(),
      session_completed_words: Math.max(
        assignment.session_completed_words ?? 0,
        safeCompletedWords,
      ),
      gold_coin_awarded:
        ((assignment as { gold_coin_awarded?: boolean | null }).gold_coin_awarded ?? false) || shouldAwardGoldCoin,
      ingredient_awarded:
        (assignment.ingredient_awarded ?? false) || shouldAwardGoldCoin,
      status:
        assignmentCompleted || assignment.status === "completed"
          ? "completed"
          : assignment.status,
    })
    .eq("id", assignment.id)
    .eq("parent_user_id", user.id);

  revalidatePath("/practice");
  revalidatePath("/dashboard");

  return {
    error: null,
    completedWords: safeCompletedWords,
    goldCoinAwarded: shouldAwardGoldCoin,
    goldCoinCount: nextGoldCoinCount,
    assignmentCompleted,
  };
}

export async function savePracticeAttempt(
  _prevState: SavePracticeAttemptState,
  formData: FormData,
): Promise<SavePracticeAttemptState> {
  const emptyState: SavePracticeAttemptState = {
    error: null,
    savedWord: null,
    submittedWord: "",
    isCorrect: null,
    assignmentCompleted: false,
    awardedGoldenNugget: false,
    awardedGoldBar: false,
  };

  const childId = formData.get("child_id");
  const dailyAssignmentId = formData.get("daily_assignment_id");
  const targetWord = formData.get("target_word");
  const submittedWord = formData.get("submitted_word");
  const feltTricky = formData.get("felt_tricky");

  if (
    typeof childId !== "string" ||
    typeof dailyAssignmentId !== "string" ||
    typeof targetWord !== "string" ||
    typeof submittedWord !== "string"
  ) {
    return {
      ...emptyState,
      error: "We couldn't save that practice attempt.",
    };
  }

  const trimmedTargetWord = targetWord.trim();
  const trimmedSubmittedWord = submittedWord.trim();

  if (!trimmedTargetWord || !trimmedSubmittedWord) {
    return {
      ...emptyState,
      error: "Please type the word before checking it.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ...emptyState,
      error: "You need to sign in again before saving practice.",
    };
  }

  const { data: assignment } = await supabase
    .from("daily_assignments")
    .select(
      "id, child_id, parent_user_id, assignment_generation_source, source_learning_item_ids, target_words, review_words",
    )
    .eq("id", dailyAssignmentId)
    .eq("child_id", childId)
    .eq("parent_user_id", user.id)
    .maybeSingle<CanonicalAssignmentRow>();

  if (!assignment) {
    return {
      ...emptyState,
      error: "We couldn't find that assignment anymore.",
    };
  }

  const orderedAssignmentWords = getOrderedAssignmentWords(
    assignment.target_words as string[] | null,
    assignment.review_words as string[] | null,
  );
  const normalisedTargetWord = normaliseWord(trimmedTargetWord);
  const isPlannedAssignmentWord = orderedAssignmentWords.includes(normalisedTargetWord);

  if (!isPlannedAssignmentWord) {
    return {
      ...emptyState,
      error: "That word is not ready for this practice session.",
    };
  }

  const attemptMode: PracticeAttemptMode = isPlannedAssignmentWord &&
    (assignment.target_words ?? [])
    .map((word: string) => normaliseWord(word))
    .includes(normalisedTargetWord)
    ? "spelling"
    : "review";
  const isCorrect = normaliseWord(trimmedSubmittedWord) === normalisedTargetWord;
  const attemptedAt = new Date().toISOString();
  const feltWeak = feltTricky === "on";
  const assignmentCompleted =
    orderedAssignmentWords[orderedAssignmentWords.length - 1] === normalisedTargetWord;

  const { data: recentAttempt } = await supabase
    .from("practice_attempts")
    .select("is_correct, target_word, submitted_word, attempted_at")
    .eq("parent_user_id", user.id)
    .eq("child_id", childId)
    .eq("daily_assignment_id", dailyAssignmentId)
    .order("attempted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (
    recentAttempt &&
    wasAttemptSubmittedVeryRecently(recentAttempt.attempted_at) &&
    normaliseWord(recentAttempt.target_word) === normalisedTargetWord &&
    normaliseWord(recentAttempt.submitted_word) === normaliseWord(trimmedSubmittedWord)
  ) {
    return {
      error: null,
      savedWord: trimmedTargetWord,
      submittedWord: trimmedSubmittedWord,
      isCorrect: recentAttempt.is_correct,
      assignmentCompleted,
      awardedGoldenNugget: false,
      awardedGoldBar: false,
    };
  }

  const linkedLearningItemId = await resolveControlledPracticeLearningItemId({
    supabase,
    parentUserId: user.id,
    childId,
    assignment,
    targetWord: trimmedTargetWord,
  });

  const { error: insertError } = await supabase.from("practice_attempts").insert({
    child_id: childId,
    parent_user_id: user.id,
    daily_assignment_id: dailyAssignmentId,
    target_word: trimmedTargetWord,
    submitted_word: trimmedSubmittedWord,
    is_correct: isCorrect,
    attempt_mode: attemptMode,
    attempted_at: attemptedAt,
  });

  if (insertError) {
    return {
      ...emptyState,
      error: "We couldn't save that practice attempt.",
    };
  }

  const canonicalEvidenceWriteError = await writeControlledPracticeEvidence({
    supabase,
    parentUserId: user.id,
    childId,
    learningItemId: linkedLearningItemId,
    dailyAssignmentId,
    targetWord: trimmedTargetWord,
    submittedWord: trimmedSubmittedWord,
    isCorrect,
    feltWeak,
    attemptMode,
    attemptedAt,
  });

  let rewardTransition = {
    createdNugget: false,
    earnedGoldBar: false,
  };

  if (linkedLearningItemId) {
    const { data: learningItem } = await supabase
      .from("learning_items")
      .select("id, progress_state")
      .eq("id", linkedLearningItemId)
      .eq("parent_user_id", user.id)
      .eq("child_id", childId)
      .maybeSingle();

    if (learningItem) {
      rewardTransition = await syncSpellingRewardState({
        supabase,
        childId,
        parentUserId: user.id,
        targetWord: normalisedTargetWord,
        isCorrect,
        shouldMarkMastered: learningItem.progress_state === "gold_bar",
        hasEverMastered: learningItem.progress_state === "gold_bar",
      });
    }
  }

  if (assignmentCompleted && isPlannedAssignmentWord) {
    await supabase
      .from("daily_assignments")
      .update({ status: "completed" })
      .eq("id", dailyAssignmentId)
      .eq("parent_user_id", user.id);
  }

  revalidatePath("/practice");
  revalidatePath("/dashboard");
  revalidatePath("/insights");
  revalidatePath("/learn/week");

  return {
    error: canonicalEvidenceWriteError,
    savedWord: trimmedTargetWord,
    submittedWord: trimmedSubmittedWord,
    isCorrect,
    assignmentCompleted,
    awardedGoldenNugget: rewardTransition.createdNugget,
    awardedGoldBar: rewardTransition.earnedGoldBar,
  };

  return {
    error: canonicalEvidenceWriteError,
    savedWord: trimmedTargetWord,
    submittedWord: trimmedSubmittedWord,
    isCorrect,
    assignmentCompleted,
    awardedGoldenNugget: false,
    awardedGoldBar: false,
  };
}
