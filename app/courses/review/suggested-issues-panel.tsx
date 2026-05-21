import type {
  ReviewWorkCandidateCaptureMicroSkillProviderResult,
} from "@/lib/writing-engine/persistence/learning-items";

import { recordReviewWorkVerificationAction } from "./actions";
import {
  buildSuggestedIssuePanelModel,
  type SuggestedIssueDerivedTemplateMetadata,
} from "./review-utils";
import {
  SpellingReviewTable,
  type SpellingReviewTableRow,
} from "./spelling-review-table";

type SuggestedIssuesPanelProps = {
  model: ReturnType<typeof buildSuggestedIssuePanelModel>;
  redirectPath: string;
  submissionId?: string;
  candidateCaptureMicroSkillProvider?: ReviewWorkCandidateCaptureMicroSkillProviderResult;
  pendingCandidateMappingsByMisspellingId?: Map<string, CandidateMappingRow>;
};

type CandidateMappingRow = {
  id: string;
  source_misspelling_instance_id: string | null;
  micro_skill_key: string;
  candidate_status: "pending_parent_promotion" | "parent_local_promoted";
  promotion_scope: "parent_local";
};

const PENDING_CANDIDATE_MAPPING_LABEL = "Pending candidate mapping";
const PROMOTED_CANDIDATE_MAPPING_LABEL = "Promoted for this child";
const PROMOTE_CANDIDATE_MAPPING_ACTION_LABEL = "Promote for this child";
const REVERT_CANDIDATE_MAPPING_ACTION_LABEL = "Revert to pending";
const PENDING_CANDIDATE_MAPPING_STATUS_COPY =
  "Saved as verified evidence. Candidate mapping captured. Not used for future suggestions until promoted.";
const PENDING_CANDIDATE_MAPPING_ACCESSIBILITY_COPY =
  "It will not be used for future suggestions until promoted.";
const PROMOTED_CANDIDATE_MAPPING_STATUS_COPY =
  "This mapping is currently used only for this child/parent scope.";

function formatPracticeRouteLabel(
  practiceRoute: SuggestedIssueDerivedTemplateMetadata["practiceRoute"],
) {
  switch (practiceRoute) {
    case "word_practice":
      return "Word practice";
    case "grouped_set_practice":
      return "Grouped set practice";
    case "contrast_practice":
      return "Contrast practice";
    case "dictation":
      return "Dictation";
    default:
      return "Unknown practice route";
  }
}

function getDerivedTemplateMetadataMessage(
  metadata: SuggestedIssueDerivedTemplateMetadata,
) {
  if (metadata.status === "available") {
    return `Read-only derived template route: ${metadata.templateKey} via ${formatPracticeRouteLabel(metadata.practiceRoute)}, rooted in canonical micro-skill ${metadata.microSkillKey}.`;
  }

  switch (metadata.reason) {
    case "manual_sample":
      return "Read-only template metadata is unavailable for manual writing samples in this bounded lesson-submission slice.";
    case "missing_micro_skill":
      return "Read-only template metadata is unavailable because this suggestion does not yet carry deterministic canonical micro-skill truth.";
    case "missing_catalog_entry":
      return `Read-only template metadata is unavailable because canonical template registry truth could not be resolved for micro-skill ${metadata.microSkillKey}.`;
    case "missing_template_registry_candidates":
      return `Read-only template metadata is unavailable because canonical Stage 2A/2D template metadata is not configured for micro-skill ${metadata.microSkillKey}.`;
    case "preferred_template_key_unavailable":
    case "dictation_template_key_unavailable":
      return `Read-only template metadata is unavailable because micro-skill ${metadata.microSkillKey} does not currently resolve a default template route for ${formatPracticeRouteLabel(metadata.practiceRoute)}.`;
  }
}

function buildSpellingReviewTableRows({
  entries,
  pendingCandidateMappingsByMisspellingId,
  props,
}: {
  entries: ReturnType<typeof buildSuggestedIssuePanelModel>["sections"][number]["entries"];
  pendingCandidateMappingsByMisspellingId?: Map<string, CandidateMappingRow>;
  props: Pick<SuggestedIssuesPanelProps, "model" | "submissionId">;
}): SpellingReviewTableRow[] {
  return entries.flatMap((entry) => {
    if (!entry.actionTarget) {
      return [];
    }

    const pendingCandidateMapping =
      pendingCandidateMappingsByMisspellingId?.get(
        entry.actionTarget.misspellingInstanceId,
      ) ?? null;

    return [
      {
        id: entry.id,
        wrongWord: entry.actionTarget.observedText,
        correctWord: entry.actionTarget.suggestedReplacement,
        misspellingInstanceId: entry.actionTarget.misspellingInstanceId,
        taskSubmissionId: entry.actionTarget.taskSubmissionId,
        writingSampleId: entry.actionTarget.writingSampleId,
        suggestedMicroSkillKey: entry.actionTarget.suggestedMicroSkillKey,
        allowsAccepted: entry.actionTarget.allowsAccepted,
        recordedDecision: entry.recordedDecision,
        canCaptureCandidateMapping: Boolean(
          props.submissionId &&
            !entry.actionTarget.allowsAccepted &&
            props.model.sourceType === "lesson_submission" &&
            !entry.recordedDecision &&
            !pendingCandidateMapping,
        ),
        pendingCandidateMapping: pendingCandidateMapping
          ? {
              id: pendingCandidateMapping.id,
              microSkillKey: pendingCandidateMapping.micro_skill_key,
              candidateStatus: pendingCandidateMapping.candidate_status,
            }
          : null,
      },
    ];
  });
}

export function SuggestedIssuesPanel(props: SuggestedIssuesPanelProps) {
  return (
    <section className="brand-card rounded-3xl p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="brand-eyebrow">Suggested issues</p>
          <h2 className="mt-1 text-lg font-semibold text-[color:var(--ink)]">
            {props.model.heading}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
            {props.model.intro}
          </p>
        </div>
      </div>

      {props.model.statusTitle && props.model.statusDescription ? (
        <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-800">
          <p className="font-medium">{props.model.statusTitle}</p>
          <p className="mt-1">{props.model.statusDescription}</p>
        </div>
      ) : null}

      {props.model.state === "outputs_available" || props.model.state === "already_reviewed" ? (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
              {props.model.summary.candidateCount} suggested / candidate
            </span>
            <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">
              {props.model.summary.verifiedCount} parent verification
            </span>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
              {props.model.summary.durableIssueCount} durable issue
            </span>
            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700">
              {props.model.summary.unresolvedCount} unresolved
            </span>
          </div>

          <div className="mt-4 grid gap-4">
            {props.model.sections.map((section) => (
              <div
                key={section.key}
                className="rounded-3xl border border-[var(--border)] bg-white px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-[color:var(--ink)]">
                      {section.title}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-[color:var(--mid)]">
                      {section.description}
                    </p>
                  </div>
                  <span className="rounded-full border border-[var(--border)] bg-[rgba(255,247,220,0.45)] px-3 py-1 text-xs font-medium text-[color:var(--ink)]">
                    {section.entries.length} visible
                  </span>
                </div>

                {section.key === "candidate" ? (
                  <SpellingReviewTable
                    rows={buildSpellingReviewTableRows({
                      entries: section.entries,
                      pendingCandidateMappingsByMisspellingId:
                        props.pendingCandidateMappingsByMisspellingId,
                      props,
                    })}
                    options={
                      props.candidateCaptureMicroSkillProvider?.status ===
                      "available"
                        ? props.candidateCaptureMicroSkillProvider.options
                        : []
                    }
                    submissionId={props.submissionId}
                    redirectPath={props.redirectPath}
                    pendingCandidateMappingLabel={
                      PENDING_CANDIDATE_MAPPING_LABEL
                    }
                    promotedCandidateMappingLabel={
                      PROMOTED_CANDIDATE_MAPPING_LABEL
                    }
                    pendingMappingStatusCopy={
                      PENDING_CANDIDATE_MAPPING_STATUS_COPY
                    }
                    pendingMappingAccessibilityCopy={
                      PENDING_CANDIDATE_MAPPING_ACCESSIBILITY_COPY
                    }
                    promotedMappingStatusCopy={
                      PROMOTED_CANDIDATE_MAPPING_STATUS_COPY
                    }
                    promoteCandidateMappingActionLabel={
                      PROMOTE_CANDIDATE_MAPPING_ACTION_LABEL
                    }
                    revertCandidateMappingActionLabel={
                      REVERT_CANDIDATE_MAPPING_ACTION_LABEL
                    }
                  />
                ) : section.entries.length > 0 ? (
                  <div className="mt-4 grid gap-3">
                    {section.entries.map((entry) => {
                      return (
                      <div
                        key={entry.id}
                        className="rounded-2xl border border-[var(--border)] bg-[rgba(255,247,220,0.22)] px-4 py-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--ink)]">
                            {entry.statusLabel}
                          </span>
                          {entry.moduleLabel ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                              {entry.moduleLabel}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-3 text-sm font-medium text-[color:var(--ink)]">
                          {entry.title}
                        </p>
                        {entry.detail ? (
                          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[color:var(--mid)]">
                            {entry.detail}
                          </p>
                        ) : null}
                        {entry.supportText ? (
                          <p className="mt-3 text-sm leading-6 text-[color:var(--mid)]">
                            {entry.supportText}
                          </p>
                        ) : null}
                        {entry.recordedDecision ? (
                          <p className="mt-3 text-xs uppercase tracking-[0.16em] text-[color:var(--mid)]">
                            Parent verification recorded: {entry.recordedDecision.replaceAll("_", " ")}
                          </p>
                        ) : null}
                        {entry.derivedTemplateMetadata ? (
                          <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
                            <p className="text-xs font-medium uppercase tracking-[0.16em] text-sky-700">
                              Derived template metadata
                            </p>
                            <p className="mt-2 text-sm leading-6 text-sky-900">
                              {getDerivedTemplateMetadataMessage(
                                entry.derivedTemplateMetadata,
                              )}
                            </p>
                          </div>
                        ) : null}
                        {entry.actionTarget && !entry.recordedDecision ? (
                          <div className="mt-4 grid gap-3">
                            <form
                              action={recordReviewWorkVerificationAction}
                              className="flex flex-wrap gap-2"
                            >
                              <input
                                type="hidden"
                                name="redirect_path"
                                value={props.redirectPath}
                              />
                              <input
                                type="hidden"
                                name="misspelling_instance_id"
                                value={entry.actionTarget.misspellingInstanceId}
                              />
                              <input
                                type="hidden"
                                name="task_submission_id"
                                value={entry.actionTarget.taskSubmissionId ?? ""}
                              />
                              <input
                                type="hidden"
                                name="writing_sample_id"
                                value={entry.actionTarget.writingSampleId ?? ""}
                              />
                              {entry.actionTarget.allowsAccepted ? (
                                <button
                                  type="submit"
                                  name="decision"
                                  value="accepted"
                                  className="brand-primary-btn"
                                >
                                  Accept
                                </button>
                              ) : null}
                              <button
                                type="submit"
                                name="decision"
                                value="false_positive"
                                className="brand-secondary-btn"
                              >
                                False positive
                              </button>
                              <button
                                type="submit"
                                name="decision"
                                value="not_a_learning_issue"
                                className="brand-secondary-btn"
                              >
                                Not a learning issue
                              </button>
                            </form>
                          </div>
                        ) : null}
                      </div>
                    );
                    })}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-[var(--border)] bg-[rgba(255,247,220,0.18)] px-4 py-4 text-sm leading-6 text-[color:var(--mid)]">
                    {`No ${section.title.toLowerCase()} records are visible here yet.`}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-4 rounded-3xl border border-[var(--border)] bg-white px-4 py-4">
          {props.model.statusTitle ? (
            <h3 className="text-base font-semibold text-[color:var(--ink)]">
              {props.model.statusTitle}
            </h3>
          ) : null}
          {props.model.statusDescription ? (
            <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
              {props.model.statusDescription}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
