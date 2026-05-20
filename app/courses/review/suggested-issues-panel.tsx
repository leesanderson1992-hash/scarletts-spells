import { recordReviewWorkVerificationAction } from "./actions";
import { buildSuggestedIssuePanelModel } from "./review-utils";

const STAGE7D_CATEGORY_OPTIONS = [
  "Phonic",
  "Pattern/rule",
  "Morphology",
  "Homophone",
  "Irregular/tricky memory word",
  "Careless performance error",
] as const;

type SuggestedIssuesPanelProps = {
  model: ReturnType<typeof buildSuggestedIssuePanelModel>;
  redirectPath: string;
  submissionId?: string;
  candidateCaptureMicroSkillProvider?: unknown;
  pendingCandidateMappingsByMisspellingId?: unknown;
};

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

                {section.entries.length > 0 ? (
                  <div className="mt-4 grid gap-3">
                    {section.entries.map((entry) => (
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

                            <details className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3">
                              <summary className="cursor-pointer text-sm font-medium text-[color:var(--ink)]">
                                Override shared verification
                              </summary>
                              <p className="mt-3 text-sm leading-6 text-[color:var(--mid)]">
                                Record an existing override using the canonical shared verification
                                fields only. Leave fields blank unless you are changing them.
                              </p>
                              <form
                                action={recordReviewWorkVerificationAction}
                                className="mt-4 grid gap-3"
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
                                <div className="grid gap-1">
                                  <label
                                    htmlFor={`${entry.id}-verified-category-code`}
                                    className="text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--mid)]"
                                  >
                                    Verified category code
                                  </label>
                                  <select
                                    id={`${entry.id}-verified-category-code`}
                                    name="verified_category_code"
                                    defaultValue=""
                                    className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
                                  >
                                    <option value="">Keep existing category</option>
                                    {STAGE7D_CATEGORY_OPTIONS.map((option) => (
                                      <option key={option} value={option}>
                                        {option}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="grid gap-1">
                                  <label
                                    htmlFor={`${entry.id}-verified-micro-skill-key`}
                                    className="text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--mid)]"
                                  >
                                    Verified micro-skill key
                                  </label>
                                  <input
                                    id={`${entry.id}-verified-micro-skill-key`}
                                    name="verified_micro_skill_key"
                                    type="text"
                                    placeholder={
                                      entry.actionTarget.suggestedMicroSkillKey &&
                                      entry.actionTarget.suggestedMicroSkillKey.trim().length > 0
                                        ? `Current: ${entry.actionTarget.suggestedMicroSkillKey}`
                                        : "Enter a canonical micro-skill key"
                                    }
                                    className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)] placeholder:text-[color:var(--mid)]"
                                  />
                                </div>
                                <div className="grid gap-1">
                                  <label
                                    htmlFor={`${entry.id}-verified-template-key`}
                                    className="text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--mid)]"
                                  >
                                    Verified template key
                                  </label>
                                  <input
                                    id={`${entry.id}-verified-template-key`}
                                    name="verified_template_key"
                                    type="text"
                                    placeholder="Optional existing template key"
                                    className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)] placeholder:text-[color:var(--mid)]"
                                  />
                                </div>
                                <div className="grid gap-1">
                                  <label
                                    htmlFor={`${entry.id}-verification-note`}
                                    className="text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--mid)]"
                                  >
                                    Parent note
                                  </label>
                                  <textarea
                                    id={`${entry.id}-verification-note`}
                                    name="verification_note"
                                    rows={3}
                                    placeholder="Optional note for the canonical verification record"
                                    className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)] placeholder:text-[color:var(--mid)]"
                                  />
                                </div>
                                <div>
                                  <button
                                    type="submit"
                                    name="decision"
                                    value="overridden"
                                    className="brand-secondary-btn"
                                  >
                                    Save override
                                  </button>
                                </div>
                              </form>
                            </details>
                          </div>
                        ) : null}
                      </div>
                    ))}
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
