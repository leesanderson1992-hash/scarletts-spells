import type { createClient } from "@/lib/supabase/server";

import {
  getActiveLearningItemsForChild,
  getLearningItemEvidenceRows,
  getLearningItemIssueLinks,
  getMicroSkillCatalogRows,
  getMicroSkillClusterRows,
  getMicroSkillFamilyRows,
  getParentProgressWritingIssueSummaries,
} from "./queries";
import {
  getLearningItemProgressStateLabel,
  getMasteryDomainLabel,
  PARENT_PROGRESS_STATUSES,
} from "./types";
import type {
  LearningItemEvidenceRow,
  LearningItemIssueLinkRow,
  LearningItemRow,
  MicroSkillCatalogRow,
  MicroSkillClusterRow,
  MicroSkillFamilyRow,
  ParentProgressDomainSummary,
  ParentProgressEvidenceSummary,
  ParentProgressFamilySummary,
  ParentProgressLinkedIssueSummary,
  ParentProgressReadModel,
  ParentProgressStatus,
  ParentProgressStream,
  ParentProgressWritingIssueSummaryRow,
} from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const PARENT_PROGRESS_STATUS_PRIORITY: Record<ParentProgressStatus, number> = {
  needs_support: 0,
  regressing: 1,
  watching: 2,
  performing_well: 3,
};

function compareNewestFirst(left: string | null, right: string | null) {
  if (left === right) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return right.localeCompare(left);
}

function buildEmptyStatusCounts() {
  return Object.fromEntries(
    PARENT_PROGRESS_STATUSES.map((status) => [status, 0]),
  ) as Record<ParentProgressStatus, number>;
}

function summariseEvidence(
  evidenceRows: LearningItemEvidenceRow[],
): ParentProgressEvidenceSummary {
  const orderedRows = [...evidenceRows].sort((left, right) =>
    compareNewestFirst(left.created_at, right.created_at),
  );
  const latestRow = orderedRows[0] ?? null;

  return {
    totalEvidenceCount: orderedRows.length,
    recentSuccessCount: orderedRows.filter((row) =>
      row.evidence_type === "corrected_independently" ||
      row.evidence_type === "controlled_practice_success" ||
      row.evidence_type === "authentic_correct_use" ||
      row.evidence_type === "delayed_authentic_correct_use" ||
      row.evidence_type === "repeated_correct_use",
    ).length,
    recentFailureCount: orderedRows.filter(
      (row) => row.evidence_type === "incorrect_use",
    ).length,
    latestEvidenceAt: latestRow?.created_at ?? null,
    latestEvidenceType: latestRow?.evidence_type ?? null,
    latestCompetencySignal: latestRow?.competency_signal ?? null,
    latestSourceContext: latestRow?.source_context ?? null,
  };
}

function getParentProgressStatus(input: {
  learningItem: LearningItemRow;
  evidenceSummary: ParentProgressEvidenceSummary;
  nowIso: string;
}) {
  const { learningItem, evidenceSummary, nowIso } = input;
  const currentCompetency = learningItem.current_competency_level;
  const hasMeaningfulFailure =
    learningItem.last_meaningful_failure_at !== null &&
    (learningItem.last_meaningful_success_at === null ||
      learningItem.last_meaningful_failure_at >
        learningItem.last_meaningful_success_at);
  const isOverdue =
    learningItem.review_due_at !== null && learningItem.review_due_at < nowIso;

  if (
    currentCompetency === null ||
    currentCompetency <= 2 ||
    learningItem.progress_state === "golden_nugget"
  ) {
    return hasMeaningfulFailure || isOverdue || evidenceSummary.recentFailureCount > 0
      ? "needs_support"
      : "watching";
  }

  if (hasMeaningfulFailure || (isOverdue && currentCompetency <= 3)) {
    return "regressing";
  }

  if (currentCompetency >= 4 && !isOverdue) {
    return "performing_well";
  }

  return "watching";
}

function buildLinkedIssueSummaries(input: {
  issueLinks: LearningItemIssueLinkRow[];
  issueById: Map<string, ParentProgressWritingIssueSummaryRow>;
}) {
  return input.issueLinks
    .map((link) => {
      const issue = input.issueById.get(link.writing_issue_id);
      if (!issue) {
        return null;
      }

      return {
        writingIssueId: issue.id,
        linkRole: link.link_role,
        observedText: issue.observed_text,
        approvedReplacement: issue.approved_replacement,
        finalClassification: issue.final_classification,
        finalClassifiedAt: issue.final_classified_at,
        createdAt: issue.created_at,
      } satisfies ParentProgressLinkedIssueSummary;
    })
    .filter(
      (summary): summary is ParentProgressLinkedIssueSummary => Boolean(summary),
    )
    .sort((left, right) => compareNewestFirst(left.createdAt, right.createdAt));
}

function buildParentProgressStream(input: {
  learningItem: LearningItemRow;
  catalogByKey: Map<string, MicroSkillCatalogRow>;
  familyByKey: Map<string, MicroSkillFamilyRow>;
  clusterByKey: Map<string, MicroSkillClusterRow>;
  issueLinks: LearningItemIssueLinkRow[];
  issueById: Map<string, ParentProgressWritingIssueSummaryRow>;
  evidenceRows: LearningItemEvidenceRow[];
  nowIso: string;
}) {
  const catalogRow = input.catalogByKey.get(input.learningItem.micro_skill_key);
  const familyKey =
    input.learningItem.skill_family_key ?? catalogRow?.skill_family_key ?? null;
  const clusterKey =
    input.learningItem.skill_cluster_key ?? catalogRow?.skill_cluster_key ?? null;
  const masteryDomainKey =
    input.learningItem.mastery_domain_key ?? catalogRow?.mastery_domain_key ?? null;
  const familyRow = familyKey ? input.familyByKey.get(familyKey) : null;
  const clusterRow = clusterKey ? input.clusterByKey.get(clusterKey) : null;
  const linkedIssues = buildLinkedIssueSummaries({
    issueLinks: input.issueLinks,
    issueById: input.issueById,
  });
  const evidenceSummary = summariseEvidence(input.evidenceRows);
  const parentStatus = getParentProgressStatus({
    learningItem: input.learningItem,
    evidenceSummary,
    nowIso: input.nowIso,
  });
  const developmentalFoundation =
    typeof catalogRow?.metadata?.developmental_foundation === "string"
      ? catalogRow.metadata.developmental_foundation
      : typeof familyRow?.metadata?.developmental_foundation === "string"
        ? familyRow.metadata.developmental_foundation
        : null;
  const teachingPoint =
    typeof catalogRow?.metadata?.teaching_point === "string"
      ? catalogRow.metadata.teaching_point
      : null;
  const exampleWords = Array.isArray(catalogRow?.metadata?.example_words)
    ? catalogRow.metadata.example_words.filter(
        (value): value is string => typeof value === "string",
      )
    : [];

  return {
    learningItemId: input.learningItem.id,
    microSkillKey: input.learningItem.micro_skill_key,
    microSkillLabel: catalogRow?.display_name ?? input.learningItem.micro_skill_key,
    masteryDomainKey,
    masteryDomainLabel: getMasteryDomainLabel(masteryDomainKey),
    skillFamilyKey: familyKey,
    skillFamilyLabel: familyRow?.display_name ?? "Micro-skill family",
    skillClusterKey: clusterKey,
    skillClusterLabel: clusterRow?.display_name ?? null,
    practiceRoute: input.learningItem.practice_route,
    progressState: input.learningItem.progress_state,
    progressStateLabel: getLearningItemProgressStateLabel(
      input.learningItem.progress_state,
    ),
    currentCompetencyLevel: input.learningItem.current_competency_level,
    targetCompetencyLevel: input.learningItem.target_competency_level,
    reviewDueAt: input.learningItem.review_due_at,
    lastMeaningfulSuccessAt: input.learningItem.last_meaningful_success_at,
    lastMeaningfulFailureAt: input.learningItem.last_meaningful_failure_at,
    parentStatus,
    linkedIssueCount: linkedIssues.length,
    linkedIssues,
    evidenceSummary,
    developmentalFoundation,
    teachingPoint,
    exampleWords,
  } satisfies ParentProgressStream;
}

function buildDomainSummaries(
  streams: ParentProgressStream[],
): ParentProgressDomainSummary[] {
  const domainMap = new Map<string, ParentProgressDomainSummary>();

  for (const stream of streams) {
    const domainKey = stream.masteryDomainKey ?? "D4";
    const existingDomain =
      domainMap.get(domainKey) ??
      ({
        masteryDomainKey: domainKey,
        masteryDomainLabel: stream.masteryDomainLabel,
        streamCount: 0,
        statusCounts: buildEmptyStatusCounts(),
        families: [],
      } satisfies ParentProgressDomainSummary);
    existingDomain.streamCount += 1;
    existingDomain.statusCounts[stream.parentStatus] += 1;

    const familyKey = stream.skillFamilyKey ?? "unknown_family";
    let family = existingDomain.families.find(
      (candidate) => candidate.skillFamilyKey === familyKey,
    );

    if (!family) {
      family = {
        skillFamilyKey: familyKey,
        skillFamilyLabel: stream.skillFamilyLabel,
        streamCount: 0,
        statusCounts: buildEmptyStatusCounts(),
        streams: [],
      } satisfies ParentProgressFamilySummary;
      existingDomain.families.push(family);
    }

    family.streamCount += 1;
    family.statusCounts[stream.parentStatus] += 1;
    family.streams.push(stream);
    domainMap.set(domainKey, existingDomain);
  }

  return Array.from(domainMap.values())
    .map((domain) => ({
      ...domain,
      families: domain.families
        .map((family) => ({
          ...family,
          streams: [...family.streams].sort(
            (left, right) =>
              PARENT_PROGRESS_STATUS_PRIORITY[left.parentStatus] -
                PARENT_PROGRESS_STATUS_PRIORITY[right.parentStatus] ||
              compareNewestFirst(
                left.lastMeaningfulFailureAt ?? left.reviewDueAt,
                right.lastMeaningfulFailureAt ?? right.reviewDueAt,
              ) ||
              left.microSkillLabel.localeCompare(right.microSkillLabel),
          ),
        }))
        .sort((left, right) => left.skillFamilyLabel.localeCompare(right.skillFamilyLabel)),
    }))
    .sort((left, right) => left.masteryDomainLabel.localeCompare(right.masteryDomainLabel));
}

export async function getCanonicalParentProgressForChild(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  now?: Date;
}) {
  const learningItems = await getActiveLearningItemsForChild(
    input.supabase,
    input.parentUserId,
    input.childId,
  );

  if (learningItems.length === 0) {
    return {
      childId: input.childId,
      streams: [],
      domains: [],
    } satisfies ParentProgressReadModel;
  }

  const learningItemIds = learningItems.map((item) => item.id);
  const microSkillKeys = Array.from(
    new Set(learningItems.map((item) => item.micro_skill_key)),
  );
  const familyKeys = Array.from(
    new Set(
      learningItems
        .map((item) => item.skill_family_key)
        .filter((key): key is string => Boolean(key)),
    ),
  );
  const clusterKeys = Array.from(
    new Set(
      learningItems
        .map((item) => item.skill_cluster_key)
        .filter((key): key is string => Boolean(key)),
    ),
  );

  const [issueLinks, evidenceRows, catalogRows, familyRows, clusterRows] =
    await Promise.all([
      getLearningItemIssueLinks(input.supabase, input.parentUserId, learningItemIds),
      getLearningItemEvidenceRows(input.supabase, input.parentUserId, learningItemIds),
      getMicroSkillCatalogRows(input.supabase, microSkillKeys),
      getMicroSkillFamilyRows(input.supabase, familyKeys),
      getMicroSkillClusterRows(input.supabase, clusterKeys),
    ]);

  const writingIssueIds = Array.from(
    new Set(issueLinks.map((link) => link.writing_issue_id)),
  );
  const writingIssues = await getParentProgressWritingIssueSummaries(
    input.supabase,
    input.parentUserId,
    writingIssueIds,
  );

  const catalogByKey = new Map(
    catalogRows.map((row) => [row.micro_skill_key, row]),
  );
  const familyByKey = new Map(
    familyRows.map((row) => [row.skill_family_key, row]),
  );
  const clusterByKey = new Map(
    clusterRows.map((row) => [row.skill_cluster_key, row]),
  );
  const issueById = new Map(writingIssues.map((issue) => [issue.id, issue]));
  const issueLinksByLearningItemId = new Map<string, LearningItemIssueLinkRow[]>();
  const evidenceRowsByLearningItemId = new Map<string, LearningItemEvidenceRow[]>();

  for (const link of issueLinks) {
    const existing = issueLinksByLearningItemId.get(link.learning_item_id) ?? [];
    existing.push(link);
    issueLinksByLearningItemId.set(link.learning_item_id, existing);
  }

  for (const evidenceRow of evidenceRows) {
    const existing =
      evidenceRowsByLearningItemId.get(evidenceRow.learning_item_id) ?? [];
    existing.push(evidenceRow);
    evidenceRowsByLearningItemId.set(evidenceRow.learning_item_id, existing);
  }

  const nowIso = (input.now ?? new Date()).toISOString();
  const streams = learningItems
    .map((learningItem) =>
      buildParentProgressStream({
        learningItem,
        catalogByKey,
        familyByKey,
        clusterByKey,
        issueLinks: issueLinksByLearningItemId.get(learningItem.id) ?? [],
        issueById,
        evidenceRows: evidenceRowsByLearningItemId.get(learningItem.id) ?? [],
        nowIso,
      }),
    )
    .sort(
      (left, right) =>
        PARENT_PROGRESS_STATUS_PRIORITY[left.parentStatus] -
          PARENT_PROGRESS_STATUS_PRIORITY[right.parentStatus] ||
        compareNewestFirst(
          left.lastMeaningfulFailureAt ??
            left.reviewDueAt ??
            left.lastMeaningfulSuccessAt,
          right.lastMeaningfulFailureAt ??
            right.reviewDueAt ??
            right.lastMeaningfulSuccessAt,
        ) ||
        left.microSkillLabel.localeCompare(right.microSkillLabel),
    );

  return {
    childId: input.childId,
    streams,
    domains: buildDomainSummaries(streams),
  } satisfies ParentProgressReadModel;
}
