import type { WritingEnginePracticeRoute } from "../types";

export type ApprovedSpellingRouteAuthority =
  | {
      kind: "known_canonical_match";
      canonicalMappingId: string;
    }
  | {
      kind: "parent_verified_candidate";
      candidateMappingId: string;
    };

/**
 * Finalised, governed review facts. Callers remain responsible for deciding
 * whether a final classification has learning intent and which route authority
 * applies; this planner never guesses either decision.
 */
export type ApprovedSpellingReviewFact = {
  childId: string;
  taskSubmissionId: string;
  writingIssueId: string;
  sourceMisspellingInstanceId: string | null;
  misspellingNormalized: string;
  correctSpellingNormalized: string;
  microSkillKey: string;
  practiceRoute: WritingEnginePracticeRoute;
  createsLearningTarget: boolean;
  routeAuthority: ApprovedSpellingRouteAuthority;
};

export type ApprovedSpellingIntakeSource = {
  /** Learner plus source occurrence: never microskill, route, or target word. */
  sourceIdentityKey: string;
  childId: string;
  taskSubmissionId: string;
  writingIssueId: string;
  sourceMisspellingInstanceId: string;
  misspellingNormalized: string;
  correctSpellingNormalized: string;
  microSkillKey: string;
  practiceRoute: WritingEnginePracticeRoute;
  teachingGroupKey: string;
  routeAuthority: ApprovedSpellingRouteAuthority;
};

export type ApprovedSpellingIntakePlanBlocker = {
  code:
    | "missing_governed_identity"
    | "missing_spelling_value"
    | "conflicting_source_occurrence";
  factIndex: number;
  sourceIdentityKey: string | null;
  detail: string;
};

export type ApprovedSpellingIntakeSourcePlan =
  | {
      ok: true;
      sources: ApprovedSpellingIntakeSource[];
      ignoredWithoutLearningIntent: number;
    }
  | {
      ok: false;
      blockers: ApprovedSpellingIntakePlanBlocker[];
    };

function normalizeGovernedWord(value: string) {
  return value.normalize("NFC").trim().toLowerCase();
}

function nonEmpty(value: string) {
  return value.trim().length > 0;
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function authorityIdentity(authority: ApprovedSpellingRouteAuthority) {
  return authority.kind === "known_canonical_match"
    ? [authority.kind, authority.canonicalMappingId]
    : [authority.kind, authority.candidateMappingId];
}

function sourceFingerprint(source: ApprovedSpellingIntakeSource) {
  return JSON.stringify([
    source.childId,
    source.taskSubmissionId,
    source.writingIssueId,
    source.sourceMisspellingInstanceId,
    source.misspellingNormalized,
    source.correctSpellingNormalized,
    source.microSkillKey,
    source.practiceRoute,
    authorityIdentity(source.routeAuthority),
  ]);
}

/**
 * Produces one intake source per distinct learner x misspelling occurrence.
 * Exact replays deduplicate; conflicting re-use of an occurrence fails closed.
 * The function is deliberately pure and has no persistence or rollout effects.
 */
export function planApprovedSpellingIntakeSources(
  facts: readonly ApprovedSpellingReviewFact[],
): ApprovedSpellingIntakeSourcePlan {
  const sourcesByIdentity = new Map<string, ApprovedSpellingIntakeSource>();
  const blockers: ApprovedSpellingIntakePlanBlocker[] = [];
  let ignoredWithoutLearningIntent = 0;

  facts.forEach((fact, factIndex) => {
    if (!fact.createsLearningTarget) {
      ignoredWithoutLearningIntent += 1;
      return;
    }

    const sourceOccurrenceId = fact.sourceMisspellingInstanceId?.trim() ?? "";
    const governedIds = [
      fact.childId,
      fact.taskSubmissionId,
      fact.writingIssueId,
      sourceOccurrenceId,
      fact.microSkillKey,
    ];
    const authorityId =
      fact.routeAuthority.kind === "known_canonical_match"
        ? fact.routeAuthority.canonicalMappingId
        : fact.routeAuthority.candidateMappingId;

    if (governedIds.some((value) => !nonEmpty(value)) || !nonEmpty(authorityId)) {
      blockers.push({
        code: "missing_governed_identity",
        factIndex,
        sourceIdentityKey:
          nonEmpty(fact.childId) && nonEmpty(sourceOccurrenceId)
            ? JSON.stringify([fact.childId, sourceOccurrenceId])
            : null,
        detail:
          "Learning-intent spelling facts require learner, submission, issue, source occurrence, microskill, and route-authority identities.",
      });
      return;
    }

    const misspellingNormalized = normalizeGovernedWord(
      fact.misspellingNormalized,
    );
    const correctSpellingNormalized = normalizeGovernedWord(
      fact.correctSpellingNormalized,
    );
    const sourceIdentityKey = JSON.stringify([
      fact.childId.trim(),
      sourceOccurrenceId,
    ]);

    if (!misspellingNormalized || !correctSpellingNormalized) {
      blockers.push({
        code: "missing_spelling_value",
        factIndex,
        sourceIdentityKey,
        detail:
          "Learning-intent spelling facts require both a misspelling and a corrected target.",
      });
      return;
    }

    const routeAuthority: ApprovedSpellingRouteAuthority =
      fact.routeAuthority.kind === "known_canonical_match"
        ? {
            kind: fact.routeAuthority.kind,
            canonicalMappingId: fact.routeAuthority.canonicalMappingId.trim(),
          }
        : {
            kind: fact.routeAuthority.kind,
            candidateMappingId: fact.routeAuthority.candidateMappingId.trim(),
          };
    const source: ApprovedSpellingIntakeSource = {
      sourceIdentityKey,
      childId: fact.childId.trim(),
      taskSubmissionId: fact.taskSubmissionId.trim(),
      writingIssueId: fact.writingIssueId.trim(),
      sourceMisspellingInstanceId: sourceOccurrenceId,
      misspellingNormalized,
      correctSpellingNormalized,
      microSkillKey: fact.microSkillKey.trim(),
      practiceRoute: fact.practiceRoute,
      teachingGroupKey: JSON.stringify([
        fact.microSkillKey.trim(),
        fact.practiceRoute,
      ]),
      routeAuthority,
    };
    const existing = sourcesByIdentity.get(sourceIdentityKey);

    if (!existing) {
      sourcesByIdentity.set(sourceIdentityKey, source);
      return;
    }

    if (sourceFingerprint(existing) !== sourceFingerprint(source)) {
      blockers.push({
        code: "conflicting_source_occurrence",
        factIndex,
        sourceIdentityKey,
        detail:
          "One learner misspelling occurrence resolved to conflicting governed intake facts.",
      });
    }
  });

  if (blockers.length > 0) {
    return {
      ok: false,
      blockers: blockers.sort(
        (left, right) =>
          left.factIndex - right.factIndex || compareText(left.code, right.code),
      ),
    };
  }

  return {
    ok: true,
    sources: [...sourcesByIdentity.values()].sort((left, right) =>
      compareText(left.sourceIdentityKey, right.sourceIdentityKey),
    ),
    ignoredWithoutLearningIntent,
  };
}
