"use server";

import { revalidatePath } from "next/cache";

import {
  advanceReviewStage,
  regressReviewStage,
  repeatReviewStage,
} from "@/lib/spelling/reviewScheduler";
import { createClient } from "@/lib/supabase/server";

type PracticeAttemptMode = "spelling" | "review";

export type SavePracticeAttemptState = {
  error: string | null;
  savedWord: string | null;
  submittedWord: string;
  isCorrect: boolean | null;
  assignmentCompleted: boolean;
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
  const cleanTargetWords = (targetWords ?? [])
    .map((word) => normaliseWord(word))
    .filter(Boolean);
  const cleanReviewWords = (reviewWords ?? [])
    .map((word) => normaliseWord(word))
    .filter(Boolean)
    .filter((word) => !cleanTargetWords.includes(word));

  return [...cleanTargetWords, ...cleanReviewWords];
}

function wasAttemptSubmittedVeryRecently(attemptedAt: string) {
  const recentThreshold = Date.now() - 15_000;
  return new Date(attemptedAt).getTime() >= recentThreshold;
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

  const [{ data: assignment }, { data: child }, { count: courseLogCount }] = await Promise.all([
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
      .from("children")
      .select("id, gold_coin_balance")
      .eq("id", input.childId)
      .eq("parent_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("task_completions")
      .select("*", { count: "exact", head: true })
      .eq("child_id", input.childId)
      .eq("parent_user_id", user.id)
      .eq("completion_date", today),
  ]);

  if (!assignment || !child) {
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

  let nextGoldCoinCount = child.gold_coin_balance ?? 0;

  if (shouldAwardGoldCoin) {
    nextGoldCoinCount += 1;

    await supabase
      .from("children")
      .update({
        gold_coin_balance: nextGoldCoinCount,
      })
      .eq("id", child.id)
      .eq("parent_user_id", user.id);

    await supabase.from("child_gold_coin_ledger_events").insert({
      child_id: input.childId,
      parent_user_id: user.id,
      event_type: "earned_daily",
      amount: 1,
      source: "spelling_session",
      related_entity_type: "daily_assignment",
      related_entity_id: assignment.id,
      notes: "Daily Gold Coin earned from a meaningful completed spelling session.",
    });
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
  };

  const childId = formData.get("child_id");
  const dailyAssignmentId = formData.get("daily_assignment_id");
  const wordProgressId = formData.get("word_progress_id");
  const targetWord = formData.get("target_word");
  const submittedWord = formData.get("submitted_word");
  const feltTricky = formData.get("felt_tricky");
  const allowSessionWord = formData.get("allow_session_word");

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
    .select("id, child_id, parent_user_id, target_words, review_words")
    .eq("id", dailyAssignmentId)
    .eq("child_id", childId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

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

  let safeWordProgressId: string | null = null;

  if (typeof wordProgressId === "string" && wordProgressId) {
    const { data: progressRow } = await supabase
      .from("word_progress")
      .select("id, target_word")
      .eq("id", wordProgressId)
      .eq("parent_user_id", user.id)
      .eq("child_id", childId)
      .maybeSingle();

    if (progressRow && normaliseWord(progressRow.target_word) === normalisedTargetWord) {
      safeWordProgressId = progressRow.id;
    }
  }

  if (!isPlannedAssignmentWord && !safeWordProgressId) {
    if (allowSessionWord === "on") {
      const { data: insertedProgress, error: insertError } = await supabase
        .from("word_progress")
        .insert({
          child_id: childId,
          parent_user_id: user.id,
          target_word: normalisedTargetWord,
          word_family_id: null,
          times_assigned: 1,
          review_stage: 0,
          last_assigned_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (!insertError && insertedProgress) {
        safeWordProgressId = insertedProgress.id;
      }
    } else {
      return {
        ...emptyState,
        error: "That word is not ready for this practice session.",
      };
    }
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
    };
  }

  const { error: insertError } = await supabase.from("practice_attempts").insert({
    child_id: childId,
    parent_user_id: user.id,
    daily_assignment_id: dailyAssignmentId,
    word_progress_id: safeWordProgressId,
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

  if (safeWordProgressId) {
    const { data: progressRow } = await supabase
      .from("word_progress")
      .select(
        "id, times_practised, correct_attempts, incorrect_attempts, mastery_level, mastered_at, review_stage, last_practised_at, has_ever_mastered",
      )
      .eq("id", safeWordProgressId)
      .eq("parent_user_id", user.id)
      .maybeSingle();

    if (progressRow) {
      const hasEverMastered = Boolean(
        progressRow.has_ever_mastered || progressRow.mastered_at,
      );
      const isFirstTargetPractice =
        attemptMode === "spelling" &&
        (progressRow.last_practised_at === null ||
          progressRow.last_practised_at === undefined) &&
        (progressRow.review_stage ?? 0) === 0;
      const isRegressingFromGoldBar = !isCorrect && Boolean(progressRow.mastered_at);
      const shouldRestoreRegressedGoldBar =
        isCorrect &&
        !feltWeak &&
        !progressRow.mastered_at &&
        hasEverMastered;
      const nextReviewStage = isFirstTargetPractice
        ? 0
        : shouldRestoreRegressedGoldBar
          ? 3
          : isRegressingFromGoldBar
            ? 0
            : isCorrect
          ? feltWeak
            ? repeatReviewStage(progressRow.review_stage)
            : advanceReviewStage(progressRow.review_stage)
          : regressReviewStage(progressRow.review_stage);
      const nextCorrectAttempts =
        (progressRow.correct_attempts ?? 0) + (isCorrect ? 1 : 0);
      const nextIncorrectAttempts =
        (progressRow.incorrect_attempts ?? 0) + (isCorrect ? 0 : 1);
      const nextMasteryLevel = isCorrect
        ? feltWeak
          ? progressRow.mastery_level ?? 0
          : Math.min((progressRow.mastery_level ?? 0) + 1, 5)
        : Math.max((progressRow.mastery_level ?? 0) - 1, 0);
      const shouldMarkMastered =
        isCorrect &&
        !feltWeak &&
        ((progressRow.review_stage ?? 0) === 3 || shouldRestoreRegressedGoldBar);

      await supabase
        .from("word_progress")
        .update({
          times_practised: (progressRow.times_practised ?? 0) + 1,
          correct_attempts: nextCorrectAttempts,
          incorrect_attempts: nextIncorrectAttempts,
          mastery_level: nextMasteryLevel,
          review_stage: nextReviewStage,
          last_practised_at: attemptedAt,
          has_ever_mastered: hasEverMastered || shouldMarkMastered,
          mastered_at:
            shouldMarkMastered
              ? progressRow.mastered_at ?? attemptedAt
              : null,
        })
        .eq("id", progressRow.id)
        .eq("parent_user_id", user.id);
    }
  } else {
    await supabase.from("word_progress").upsert({
      child_id: childId,
      parent_user_id: user.id,
      target_word: normalisedTargetWord,
      word_family_id: null,
      times_assigned: attemptMode === "spelling" ? 1 : 0,
      times_practised: 1,
      correct_attempts: isCorrect ? 1 : 0,
      incorrect_attempts: isCorrect ? 0 : 1,
      mastery_level: isCorrect && !feltWeak ? 1 : 0,
      review_stage: 0,
      last_assigned_at: attemptedAt,
      last_practised_at: attemptedAt,
      mastered_at: null,
    }, {
      onConflict: "child_id,target_word",
    });
  }

  if (assignmentCompleted && isPlannedAssignmentWord) {
    await supabase
      .from("daily_assignments")
      .update({ status: "completed" })
      .eq("id", dailyAssignmentId)
      .eq("parent_user_id", user.id);
  }

  revalidatePath("/practice");

  return {
    error: null,
    savedWord: trimmedTargetWord,
    submittedWord: trimmedSubmittedWord,
    isCorrect,
    assignmentCompleted,
  };
}
