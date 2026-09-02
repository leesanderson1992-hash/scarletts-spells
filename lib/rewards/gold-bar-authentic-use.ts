export const GOLD_BAR_AUTHENTIC_USE_POLICY_VERSION =
  "WORD_TREASURE_AUTHENTIC_USE_V2" as const;

export const REVIEW_WRITING_GOLD_BAR_SOURCE_TYPE =
  "review_writing_authentic_use" as const;

export const SPONTANEOUS_AUTHENTIC_USE_SOURCE_CLASS =
  "SPONTANEOUS_AUTHENTIC_USE" as const;

export const REVIEW_WRITING_AUTHENTIC_USE_SOURCE_CLASS =
  "REVIEW_WRITING_AUTHENTIC_USE" as const;

export const REVIEW_WRITING_GOLD_BAR_FEATURE_FLAG =
  "GOLD_BAR_REVIEW_WRITING_ENABLED" as const;

export const REVIEW_WRITING_GOLD_BAR_EFFECTIVE_AT =
  "GOLD_BAR_REVIEW_WRITING_EFFECTIVE_AT" as const;

export const REVIEW_WRITING_GOLD_BAR_RELEASE_POLICY =
  "GOLD_BAR_REVIEW_WRITING_RELEASE_POLICY" as const;

// The Production effective time selected in GB.5E must be later than the
// completed GB.5C schema-dark verification. This is a safety floor, not the
// Production effective time; GB.5D deliberately does not select that instant.
export const REVIEW_WRITING_GOLD_BAR_PRODUCTION_EFFECTIVE_AT_FLOOR =
  "2026-09-02T08:22:45.000Z" as const;

export type GoldBarAuthenticUseSourceClass =
  | typeof SPONTANEOUS_AUTHENTIC_USE_SOURCE_CLASS
  | typeof REVIEW_WRITING_AUTHENTIC_USE_SOURCE_CLASS;

export type GoldBarAnswerVisibilityStatus =
  | "HIDDEN"
  | "VISIBLE"
  | "UNKNOWN";

export type GoldBarContextValidationStatus =
  | "NOT_REQUIRED"
  | "VALID"
  | "INVALID"
  | "UNCERTAIN";

export type GoldBarUseQualificationStatus =
  | "ELIGIBLE"
  | "INELIGIBLE"
  | "UNCERTAIN";

export interface ReviewWritingGoldBarGateConfig {
  policyVersion: typeof GOLD_BAR_AUTHENTIC_USE_POLICY_VERSION;
  effectiveAt: string;
}

const OFFSET_AWARE_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/;

/** Parse an explicit UTC/offset-aware ISO instant without Date.parse rollover. */
export function normalizeReviewWritingGoldBarEffectiveAt(value: string): string | null {
  const match = OFFSET_AWARE_INSTANT.exec(value);
  if (!match) return null;
  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw, secondRaw,
    fractionRaw = "", , offsetSign, offsetHourRaw = "0", offsetMinuteRaw = "0"] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const second = Number(secondRaw);
  const millisecond = Number(fractionRaw.padEnd(3, "0"));
  const offsetHour = Number(offsetHourRaw);
  const offsetMinute = Number(offsetMinuteRaw);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 ||
      minute > 59 || second > 59 || offsetHour > 14 || offsetMinute > 59 ||
      (offsetHour === 14 && offsetMinute !== 0)) return null;

  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, second, millisecond);
  if (local.getUTCFullYear() !== year || local.getUTCMonth() !== month - 1 ||
      local.getUTCDate() !== day || local.getUTCHours() !== hour ||
      local.getUTCMinutes() !== minute || local.getUTCSeconds() !== second ||
      local.getUTCMilliseconds() !== millisecond) return null;

  const offsetMinutes = (offsetHour * 60 + offsetMinute) * (offsetSign === "-" ? -1 : 1);
  return new Date(local.getTime() - offsetMinutes * 60_000).toISOString();
}

export function reviewWritingGoldBarEffectiveAtMatchesAuthority(
  configuredEffectiveAt: string,
  persistedEffectiveAt: string,
): boolean {
  const configured = normalizeReviewWritingGoldBarEffectiveAt(configuredEffectiveAt);
  const persisted = normalizeReviewWritingGoldBarEffectiveAt(persistedEffectiveAt);
  return configured !== null && persisted !== null && configured === persisted;
}

export function reviewWritingGoldBarGateConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ReviewWritingGoldBarGateConfig | null {
  if (environment[REVIEW_WRITING_GOLD_BAR_FEATURE_FLAG] !== "enabled") return null;
  const effectiveAtRaw = environment[REVIEW_WRITING_GOLD_BAR_EFFECTIVE_AT];
  if (!effectiveAtRaw) return null;
  const effectiveAt = normalizeReviewWritingGoldBarEffectiveAt(effectiveAtRaw);
  if (!effectiveAt) return null;
  if (environment.VERCEL_ENV === "production") {
    if (environment[REVIEW_WRITING_GOLD_BAR_RELEASE_POLICY] !==
        GOLD_BAR_AUTHENTIC_USE_POLICY_VERSION) return null;
    if (Date.parse(effectiveAt) <=
        Date.parse(REVIEW_WRITING_GOLD_BAR_PRODUCTION_EFFECTIVE_AT_FLOOR)) return null;
  }
  return {
    policyVersion: GOLD_BAR_AUTHENTIC_USE_POLICY_VERSION,
    effectiveAt,
  };
}

export interface ReviewWritingGoldBarQualificationInput {
  reviewCompleted: boolean;
  sourceEventActive: boolean;
  provenanceKind: string;
  useKind: string;
  writingDisposition: string | null;
  originalOutcome: string;
  originalOutcomeSource: string | null;
  repairState: string;
  exactAuthoredOccurrence: boolean;
  answerVisibilityStatus: GoldBarAnswerVisibilityStatus;
  contextValidationStatus: GoldBarContextValidationStatus;
  writingSubmittedAt: string | null;
  enteredForgeAt: string | null;
  policyEffectiveAt: string;
}

export interface ReviewWritingGoldBarQualificationDecision {
  status: GoldBarUseQualificationStatus;
  sourceClass: "REVIEW_WRITING_AUTHENTIC_USE";
  reasonCodes: string[];
}

function timestamp(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function qualifyReviewWritingGoldBarUse(
  input: ReviewWritingGoldBarQualificationInput,
): ReviewWritingGoldBarQualificationDecision {
  const reasons: string[] = [];
  const submittedAt = timestamp(input.writingSubmittedAt);
  const enteredForgeAt = timestamp(input.enteredForgeAt);
  const effectiveAt = timestamp(input.policyEffectiveAt);

  if (!input.reviewCompleted) reasons.push("REVIEW_NOT_COMPLETED");
  if (!input.sourceEventActive) reasons.push("SOURCE_EVENT_NOT_ACTIVE");
  if (input.provenanceKind !== "prompted_review_writing_application") {
    reasons.push("SOURCE_CLASS_MISMATCH");
  }
  if (input.useKind !== "authentic_correct_use") reasons.push("USE_KIND_MISMATCH");
  if (input.writingDisposition !== "correct_in_writing") {
    reasons.push("NOT_CORRECT_IN_FROZEN_WRITING");
  }
  if (input.originalOutcome !== "success" || input.originalOutcomeSource !== "writing") {
    reasons.push("ORIGINAL_WRITING_OUTCOME_NOT_SUCCESS");
  }
  if (input.repairState !== "not_required") reasons.push("REPAIR_DOES_NOT_QUALIFY");
  if (!input.exactAuthoredOccurrence) reasons.push("NO_EXACT_AUTHORED_OCCURRENCE");
  if (submittedAt === null) reasons.push("WRITING_TIMESTAMP_MISSING");
  if (effectiveAt === null || (submittedAt !== null && submittedAt < effectiveAt)) {
    reasons.push("BEFORE_POLICY_EFFECTIVE_AT");
  }
  if (enteredForgeAt === null) reasons.push("WORD_NOT_IN_FORGE_AT_OCCURRENCE");
  if (submittedAt !== null && enteredForgeAt !== null && submittedAt < enteredForgeAt) {
    reasons.push("USE_BEFORE_FORGE_ENTRY");
  }

  if (input.answerVisibilityStatus === "VISIBLE") reasons.push("ANSWER_WAS_VISIBLE");
  if (input.contextValidationStatus === "INVALID") reasons.push("CONTEXT_INVALID");

  if (reasons.length > 0) {
    return {
      status: "INELIGIBLE",
      sourceClass: REVIEW_WRITING_AUTHENTIC_USE_SOURCE_CLASS,
      reasonCodes: reasons,
    };
  }

  if (
    input.answerVisibilityStatus === "UNKNOWN" ||
    input.contextValidationStatus === "UNCERTAIN"
  ) {
    return {
      status: "UNCERTAIN",
      sourceClass: REVIEW_WRITING_AUTHENTIC_USE_SOURCE_CLASS,
      reasonCodes: [
        ...(input.answerVisibilityStatus === "UNKNOWN" ? ["ANSWER_VISIBILITY_UNKNOWN"] : []),
        ...(input.contextValidationStatus === "UNCERTAIN" ? ["CONTEXT_UNCERTAIN"] : []),
      ],
    };
  }

  return {
    status: "ELIGIBLE",
    sourceClass: REVIEW_WRITING_AUTHENTIC_USE_SOURCE_CLASS,
    reasonCodes: ["QUALIFYING_REVIEW_WRITING_USE"],
  };
}
