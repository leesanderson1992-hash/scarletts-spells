import type { createClient } from "@/lib/supabase/server";

import {
  getLearningItemEvidenceRows,
  getMicroSkillCatalogRows,
} from "./queries";
import type {
  LearningItemCompetencyLevel,
  LearningItemEvidenceRow,
  LearningItemEvidenceType,
  LearningItemProgressState,
  LearningItemRow,
  MicroSkillCatalogRow,
  PositiveEvidenceComplexityBand,
  PositiveEvidenceComplexitySource,
  ReviewWritingIssueSuggestionDetailProjection,
} from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type PositiveEvidenceSuggestion = ReviewWritingIssueSuggestionDetailProjection & {
  child_id?: string;
  parent_user_id?: string;
};

type PositiveEvidenceSurface = "review_detail" | "insights";
type PositiveEvidenceProjectedType =
  | "authentic_correct_use"
  | "delayed_authentic_correct_use"
  | "repeated_correct_use";
type PositiveEvidencePromotionLevel = 4 | 5;

type PositiveEvidenceCandidate = {
  suggestionId: string;
  suggestionStatus: PositiveEvidenceSuggestion["suggestion_status"];
  learningItemId: string;
  taskSubmissionId: string;
  microSkillKey: string;
  microSkillLabel: string;
  matchedWord: string;
  matchedVia: "target_word" | "related_watch_word";
  confidence: "high";
  complexityBand: PositiveEvidenceComplexityBand;
  complexitySource: PositiveEvidenceComplexitySource;
  currentCompetencyLevel: LearningItemCompetencyLevel | null;
  canConfirm: boolean;
  countsForLevel4: boolean;
  countsForLevel5: boolean;
  blockedReason: string | null;
  blockedReasonLabel: string | null;
  promotionPausedReason: string | null;
  promotionPausedReasonLabel: string | null;
  projectedEvidenceType: PositiveEvidenceProjectedType;
  promotedLevel: PositiveEvidencePromotionLevel | null;
  visibleLevelTarget: 4 | 5;
  isConfirmed: boolean;
};

type PositiveEvidenceConfirmationSummary = {
  confirmedCount: number;
  promotedLevel4Count: number;
  promotedLevel5Count: number;
};

type PositiveEvidenceLearningItemSummary = {
  authenticRows: LearningItemEvidenceRow[];
  distinctWords: Set<string>;
  distinctSubmissionIds: Set<string>;
  distinctComplexityBands: Set<PositiveEvidenceComplexityBand>;
  hasAuthenticLevel4Baseline: boolean;
};

const AUTHENTIC_POSITIVE_EVIDENCE_TYPES = new Set<LearningItemEvidenceType>([
  "authentic_correct_use",
  "delayed_authentic_correct_use",
  "repeated_correct_use",
]);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function normaliseWord(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function readStringMetadata(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getStarterWordDifficulty(
  catalogRow: MicroSkillCatalogRow | null,
  matchedWord: string,
) {
  const starterWordBank = catalogRow?.metadata?.starter_word_bank;

  if (!Array.isArray(starterWordBank)) {
    return null;
  }

  const matchedStarterRow = starterWordBank.find((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return false;
    }

    const word =
      "word" in row && typeof row.word === "string" ? normaliseWord(row.word) : null;

    return word === matchedWord;
  });

  if (
    matchedStarterRow &&
    typeof matchedStarterRow === "object" &&
    !Array.isArray(matchedStarterRow) &&
    "difficulty" in matchedStarterRow &&
    typeof matchedStarterRow.difficulty === "string"
  ) {
    switch (matchedStarterRow.difficulty) {
      case "easy":
      case "medium":
      case "hard":
        return matchedStarterRow.difficulty satisfies PositiveEvidenceComplexityBand;
      default:
        return null;
    }
  }

  return null;
}

function countSyllables(word: string) {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, "");

  if (!cleaned) {
    return 1;
  }

  const collapsed = cleaned.replace(/e\b/g, "");
  const groups = collapsed.match(/[aeiouy]+/g);
  return Math.max(groups?.length ?? 0, 1);
}

function getFallbackComplexityBand(word: string): PositiveEvidenceComplexityBand {
  const syllables = countSyllables(word);

  if (syllables >= 3 || word.length >= 10) {
    return "hard";
  }

  if (syllables >= 2 || word.length >= 6) {
    return "medium";
  }

  return "easy";
}

function getComplexity(
  catalogRow: MicroSkillCatalogRow | null,
  matchedWord: string,
): {
  complexityBand: PositiveEvidenceComplexityBand;
  complexitySource: PositiveEvidenceComplexitySource;
} {
  const starterDifficulty = getStarterWordDifficulty(catalogRow, matchedWord);

  if (starterDifficulty) {
    return {
      complexityBand: starterDifficulty,
      complexitySource: "seed_word_bank",
    };
  }

  return {
    complexityBand: getFallbackComplexityBand(matchedWord),
    complexitySource: "fallback_heuristic",
  };
}

function getEvidenceWindowRows(
  learningItem: LearningItemRow,
  evidenceRows: LearningItemEvidenceRow[],
) {
  if (!learningItem.last_meaningful_failure_at) {
    return evidenceRows;
  }

  return evidenceRows.filter(
    (row) => row.created_at > learningItem.last_meaningful_failure_at!,
  );
}

function getAuthenticConfirmationRows(evidenceRows: LearningItemEvidenceRow[]) {
  return evidenceRows.filter(
    (row) =>
      row.source_context === "authentic_submission_confirmation" &&
      AUTHENTIC_POSITIVE_EVIDENCE_TYPES.has(row.evidence_type),
  );
}

function getDistinctWords(evidenceRows: LearningItemEvidenceRow[]) {
  return new Set(
    evidenceRows
      .map((row) => normaliseWord(readStringMetadata(row.metadata, "matched_word")))
      .filter((value): value is string => Boolean(value)),
  );
}

function getDistinctSubmissionIds(evidenceRows: LearningItemEvidenceRow[]) {
  return new Set(
    evidenceRows
      .map((row) => row.task_submission_id)
      .filter((value): value is string => Boolean(value)),
  );
}

function getDistinctComplexityBands(evidenceRows: LearningItemEvidenceRow[]) {
  return new Set(
    evidenceRows
      .map((row) => readStringMetadata(row.metadata, "complexity_band"))
      .filter(
        (value): value is PositiveEvidenceComplexityBand =>
          value === "easy" || value === "medium" || value === "hard",
      ),
  );
}

function hasAuthenticLevel4Baseline(evidenceRows: LearningItemEvidenceRow[]) {
  return (
    getDistinctWords(evidenceRows).size >= 5 ||
    evidenceRows.some((row) => (row.competency_signal ?? 0) >= 4)
  );
}

function getAvailableComplexityBandCount(catalogRow: MicroSkillCatalogRow | null) {
  const starterWordBank = catalogRow?.metadata?.starter_word_bank;

  if (!Array.isArray(starterWordBank)) {
    return 1;
  }

  return Math.max(
    new Set(
      starterWordBank
        .map((row) =>
          row && typeof row === "object" && !Array.isArray(row) && "difficulty" in row
            ? row.difficulty
            : null,
        )
        .filter(
          (value): value is PositiveEvidenceComplexityBand =>
            value === "easy" || value === "medium" || value === "hard",
        ),
    ).size,
    1,
  );
}

function buildLearningItemSummary(input: {
  learningItem: LearningItemRow;
  evidenceRows: LearningItemEvidenceRow[];
}) {
  const authenticRows = getAuthenticConfirmationRows(
    getEvidenceWindowRows(input.learningItem, input.evidenceRows),
  );

  return {
    authenticRows,
    distinctWords: getDistinctWords(authenticRows),
    distinctSubmissionIds: getDistinctSubmissionIds(authenticRows),
    distinctComplexityBands: getDistinctComplexityBands(authenticRows),
    hasAuthenticLevel4Baseline: hasAuthenticLevel4Baseline(authenticRows),
  } satisfies PositiveEvidenceLearningItemSummary;
}

function buildBlockedReasonLabel(blockedReason: string | null) {
  switch (blockedReason) {
    case "already_confirmed":
      return "Already confirmed from this evidence signal.";
    default:
      return null;
  }
}

function buildPromotionPausedReasonLabel(reason: string | null) {
  switch (reason) {
    case "recent_contradiction":
      return "Counts as authentic evidence, but level movement is still paused by a more recent contradiction in this micro-skill.";
    default:
      return null;
  }
}

function getReviewDueAt(level: LearningItemCompetencyLevel | null, now: Date) {
  if (level === 5) {
    return new Date(now.getTime() + 21 * MS_PER_DAY).toISOString();
  }

  if (level === 4) {
    return new Date(now.getTime() + 14 * MS_PER_DAY).toISOString();
  }

  return null;
}

function getNextProgressState(level: LearningItemCompetencyLevel | null) {
  if (level === 5) {
    return "gold_bar" satisfies LearningItemProgressState;
  }

  if (level === 4) {
    return "in_machine" satisfies LearningItemProgressState;
  }

  return null;
}

function getProjectedEvidenceType(input: {
  currentCompetencyLevel: LearningItemCompetencyLevel | null;
  existingSubmissionIds: Set<string>;
  hasAuthenticLevel4Baseline: boolean;
  taskSubmissionId: string;
}): PositiveEvidenceProjectedType {
  if (
    (input.currentCompetencyLevel ?? 0) < 4 ||
    !input.hasAuthenticLevel4Baseline
  ) {
    return "authentic_correct_use" satisfies LearningItemEvidenceType;
  }

  return input.existingSubmissionIds.has(input.taskSubmissionId)
    ? ("repeated_correct_use" satisfies LearningItemEvidenceType)
    : ("delayed_authentic_correct_use" satisfies LearningItemEvidenceType);
}

function isPositiveEvidenceSuggestion(
  suggestion: PositiveEvidenceSuggestion,
) {
  return suggestion.source_type === "micro_skill_watchlist";
}

function parseCandidatePayload(suggestion: PositiveEvidenceSuggestion) {
  if (!isPositiveEvidenceSuggestion(suggestion)) {
    return null;
  }

  const learningItemId = readStringMetadata(suggestion.metadata, "learning_item_id");
  const matchedWord = normaliseWord(
    readStringMetadata(suggestion.metadata, "matched_word") ??
      suggestion.observed_text,
  );
  const matchedVia = readStringMetadata(suggestion.metadata, "matched_via");

  if (
    !learningItemId ||
    !matchedWord ||
    !suggestion.task_submission_id ||
    (matchedVia !== "target_word" && matchedVia !== "related_watch_word")
  ) {
    return null;
  }

  return {
    learningItemId,
    matchedWord,
    matchedVia,
    taskSubmissionId: suggestion.task_submission_id,
  } as const;
}

export async function getPositiveEvidenceCandidatesForSuggestions(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  suggestions: PositiveEvidenceSuggestion[];
}) {
  const parsedSuggestions = input.suggestions
    .map((suggestion) => {
      const payload = parseCandidatePayload(suggestion);
      return payload ? { suggestion, payload } : null;
    })
    .filter(
      (
        value,
      ): value is {
        suggestion: PositiveEvidenceSuggestion;
        payload: NonNullable<ReturnType<typeof parseCandidatePayload>>;
      } => Boolean(value),
    );

  if (parsedSuggestions.length === 0) {
    return [] as PositiveEvidenceCandidate[];
  }

  const learningItemIds = Array.from(
    new Set(parsedSuggestions.map(({ payload }) => payload.learningItemId)),
  );
  const { data: learningItemRows } = await input.supabase
    .from("learning_items")
    .select(
      [
        "id",
        "child_id",
        "parent_user_id",
        "source_writing_issue_id",
        "micro_skill_key",
        "mastery_domain_key",
        "skill_family_key",
        "skill_cluster_key",
        "practice_route",
        "current_competency_level",
        "target_competency_level",
        "theme_key",
        "progress_state",
        "is_active",
        "review_due_at",
        "last_meaningful_success_at",
        "last_meaningful_failure_at",
        "metadata",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .in("id", learningItemIds);

  const learningItems = (learningItemRows ?? []) as unknown as LearningItemRow[];

  if (learningItems.length === 0) {
    return [] as PositiveEvidenceCandidate[];
  }

  const learningItemById = new Map(learningItems.map((item) => [item.id, item]));
  const [catalogRows, evidenceRows] = await Promise.all([
    getMicroSkillCatalogRows(
      input.supabase,
      learningItems.map((item) => item.micro_skill_key),
    ),
    getLearningItemEvidenceRows(
      input.supabase,
      input.parentUserId,
      learningItems.map((item) => item.id),
    ),
  ]);
  const catalogByKey = new Map(catalogRows.map((row) => [row.micro_skill_key, row]));
  const evidenceByLearningItemId = new Map<string, LearningItemEvidenceRow[]>();
  const summaryByLearningItemId = new Map<string, PositiveEvidenceLearningItemSummary>();

  evidenceRows.forEach((row) => {
    const existing = evidenceByLearningItemId.get(row.learning_item_id) ?? [];
    existing.push(row);
    evidenceByLearningItemId.set(row.learning_item_id, existing);
  });

  learningItems.forEach((learningItem) => {
    summaryByLearningItemId.set(
      learningItem.id,
      buildLearningItemSummary({
        learningItem,
        evidenceRows: evidenceByLearningItemId.get(learningItem.id) ?? [],
      }),
    );
  });

  const candidates: PositiveEvidenceCandidate[] = [];

  parsedSuggestions.forEach(({ suggestion, payload }) => {
      const learningItem = learningItemById.get(payload.learningItemId);

      if (!learningItem || !learningItem.is_active) {
        return;
      }

      const catalogRow = catalogByKey.get(learningItem.micro_skill_key) ?? null;
      const { complexityBand, complexitySource } = getComplexity(
        catalogRow,
        payload.matchedWord,
      );
      const learningItemSummary =
        summaryByLearningItemId.get(learningItem.id) ??
        buildLearningItemSummary({
          learningItem,
          evidenceRows: evidenceByLearningItemId.get(learningItem.id) ?? [],
        });
      const authenticRows = learningItemSummary.authenticRows;
      const distinctWords = new Set(learningItemSummary.distinctWords);
      const distinctSubmissionIds = new Set(
        learningItemSummary.distinctSubmissionIds,
      );
      const distinctComplexityBands = new Set(
        learningItemSummary.distinctComplexityBands,
      );
      const hasRecentContradiction =
        learningItem.last_meaningful_failure_at !== null &&
        (learningItem.last_meaningful_success_at === null ||
          learningItem.last_meaningful_failure_at >=
            learningItem.last_meaningful_success_at);
      const blockedReason =
        suggestion.suggestion_status === "accepted" ? "already_confirmed" : null;
      const promotionPausedReason =
        suggestion.suggestion_status === "pending" && hasRecentContradiction
          ? "recent_contradiction"
          : null;

      if (suggestion.suggestion_status !== "accepted") {
        distinctWords.add(payload.matchedWord);
        distinctSubmissionIds.add(payload.taskSubmissionId);
        distinctComplexityBands.add(complexityBand);
      }

      const canEvaluateLevel5 =
        (learningItem.current_competency_level ?? 0) >= 4 &&
        learningItemSummary.hasAuthenticLevel4Baseline;
      const requiredComplexityBandCount =
        getAvailableComplexityBandCount(catalogRow) >= 2 ? 2 : 1;
      const level4Eligible =
        promotionPausedReason === null && distinctWords.size >= 5;
      const level5Eligible =
        promotionPausedReason === null &&
        canEvaluateLevel5 &&
        distinctSubmissionIds.size >= 5 &&
        distinctComplexityBands.size >= requiredComplexityBandCount;
      const promotedLevel = level5Eligible
        ? (5 satisfies PositiveEvidencePromotionLevel)
        : level4Eligible && (learningItem.current_competency_level ?? 0) < 4
          ? (4 satisfies PositiveEvidencePromotionLevel)
          : null;

      candidates.push({
        suggestionId: suggestion.id,
        suggestionStatus: suggestion.suggestion_status,
        learningItemId: learningItem.id,
        taskSubmissionId: payload.taskSubmissionId,
        microSkillKey: learningItem.micro_skill_key,
        microSkillLabel: catalogRow?.display_name ?? learningItem.micro_skill_key,
        matchedWord: payload.matchedWord,
        matchedVia: payload.matchedVia,
        confidence: "high",
        complexityBand,
        complexitySource,
        currentCompetencyLevel: learningItem.current_competency_level,
        canConfirm: suggestion.suggestion_status === "pending",
        countsForLevel4:
          suggestion.suggestion_status !== "accepted" &&
          !getDistinctWords(authenticRows).has(payload.matchedWord),
        countsForLevel5:
          suggestion.suggestion_status !== "accepted" &&
          canEvaluateLevel5 &&
          !learningItemSummary.distinctSubmissionIds.has(payload.taskSubmissionId),
        blockedReason,
        blockedReasonLabel: buildBlockedReasonLabel(blockedReason),
        promotionPausedReason,
        promotionPausedReasonLabel: buildPromotionPausedReasonLabel(
          promotionPausedReason,
        ),
        projectedEvidenceType: getProjectedEvidenceType({
          currentCompetencyLevel: learningItem.current_competency_level,
          existingSubmissionIds: learningItemSummary.distinctSubmissionIds,
          hasAuthenticLevel4Baseline: learningItemSummary.hasAuthenticLevel4Baseline,
          taskSubmissionId: payload.taskSubmissionId,
        }),
        promotedLevel,
        visibleLevelTarget: canEvaluateLevel5 ? 5 : 4,
        isConfirmed: suggestion.suggestion_status === "accepted",
      } satisfies PositiveEvidenceCandidate);
    });

  return candidates;
}

export async function confirmPositiveEvidenceSuggestions(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  suggestionIds: string[];
  surface: PositiveEvidenceSurface;
  maxConfirmCount: number;
}) {
  if (input.suggestionIds.length === 0) {
    return {
      confirmedCount: 0,
      promotedLevel4Count: 0,
      promotedLevel5Count: 0,
    } satisfies PositiveEvidenceConfirmationSummary;
  }

  const { data: suggestionRows } = await input.supabase
    .from("writing_issue_suggestions")
    .select(
      "id, task_submission_id, misspelling_instance_id, suggestion_status, source_type, observed_text, suggested_replacement, suggested_micro_skill_key, notes, metadata",
    )
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .in("id", input.suggestionIds)
    .in("source_type", ["micro_skill_watchlist"]);

  const suggestions =
    (suggestionRows ?? []) as ReviewWritingIssueSuggestionDetailProjection[];
  const candidates = await getPositiveEvidenceCandidatesForSuggestions({
    supabase: input.supabase,
    parentUserId: input.parentUserId,
    childId: input.childId,
    suggestions,
  });
  const eligibleCandidates = candidates
    .filter(
      (candidate) =>
        candidate.canConfirm && !candidate.isConfirmed && candidate.blockedReason === null,
    )
    .slice(0, Math.max(1, input.maxConfirmCount));

  if (eligibleCandidates.length === 0) {
    return {
      confirmedCount: 0,
      promotedLevel4Count: 0,
      promotedLevel5Count: 0,
    } satisfies PositiveEvidenceConfirmationSummary;
  }

  const { data: learningItemRows } = await input.supabase
    .from("learning_items")
    .select(
      [
        "id",
        "child_id",
        "parent_user_id",
        "source_writing_issue_id",
        "micro_skill_key",
        "mastery_domain_key",
        "skill_family_key",
        "skill_cluster_key",
        "practice_route",
        "current_competency_level",
        "target_competency_level",
        "theme_key",
        "progress_state",
        "is_active",
        "review_due_at",
        "last_meaningful_success_at",
        "last_meaningful_failure_at",
        "metadata",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .in(
      "id",
      eligibleCandidates.map((candidate) => candidate.learningItemId),
    );

  const learningItemById = new Map(
    ((learningItemRows ?? []) as unknown as LearningItemRow[]).map((item) => [item.id, item]),
  );
  const now = new Date();
  const nowIso = now.toISOString();
  const summary: PositiveEvidenceConfirmationSummary = {
    confirmedCount: 0,
    promotedLevel4Count: 0,
    promotedLevel5Count: 0,
  };

  for (const candidate of eligibleCandidates) {
    const learningItem = learningItemById.get(candidate.learningItemId);

    if (!learningItem) {
      continue;
    }

    const evidenceMetadata = {
      confirmed_suggestion_id: candidate.suggestionId,
      matched_word: candidate.matchedWord,
      matched_via: candidate.matchedVia,
      complexity_band: candidate.complexityBand,
      complexity_source: candidate.complexitySource,
      confirmed_surface: input.surface,
    };

    const { error: evidenceError } = await input.supabase
      .from("learning_item_evidence")
      .insert({
        learning_item_id: learningItem.id,
        child_id: input.childId,
        parent_user_id: input.parentUserId,
        writing_issue_id: null,
        task_submission_id: candidate.taskSubmissionId,
        evidence_type: candidate.projectedEvidenceType,
        competency_signal:
          candidate.promotedLevel ?? learningItem.current_competency_level ?? 3,
        source_context: "authentic_submission_confirmation",
        metadata: evidenceMetadata,
      });

    if (evidenceError) {
      continue;
    }

    const updatePayload: Partial<LearningItemRow> = {
      last_meaningful_success_at: nowIso,
    };

    if (
      candidate.promotedLevel !== null &&
      (learningItem.current_competency_level ?? 0) < candidate.promotedLevel
    ) {
      updatePayload.current_competency_level = candidate.promotedLevel;
      updatePayload.progress_state = getNextProgressState(candidate.promotedLevel) ?? learningItem.progress_state;
      updatePayload.review_due_at = getReviewDueAt(candidate.promotedLevel, now);
    }

    await input.supabase
      .from("learning_items")
      .update(updatePayload)
      .eq("id", learningItem.id)
      .eq("parent_user_id", input.parentUserId);

    const { data: currentSuggestionRow } = await input.supabase
      .from("writing_issue_suggestions")
      .select("metadata")
      .eq("id", candidate.suggestionId)
      .eq("parent_user_id", input.parentUserId)
      .maybeSingle();

    await input.supabase
      .from("writing_issue_suggestions")
      .update({
        suggestion_status: "accepted",
        resolved_at: nowIso,
        metadata: {
          ...((currentSuggestionRow?.metadata as Record<string, unknown> | null) ?? {}),
          ...evidenceMetadata,
          confirmed_at: nowIso,
        },
      })
      .eq("id", candidate.suggestionId)
      .eq("parent_user_id", input.parentUserId);

    summary.confirmedCount += 1;
    if (candidate.promotedLevel === 4) {
      summary.promotedLevel4Count += 1;
    }
    if (candidate.promotedLevel === 5) {
      summary.promotedLevel5Count += 1;
    }
  }

  return summary;
}
