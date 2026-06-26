"use client";

import { useState } from "react";

import type { ReturnedWritingIssueDraftPayload } from "@/lib/lessons/responses";

type ReturnedIssueRetryControlsProps = {
  issue: ReturnedWritingIssueDraftPayload;
};

type RetryMode = "stick" | "try_again";

function getInitialRetryMode(issue: ReturnedWritingIssueDraftPayload): RetryMode {
  return issue.retry_mode === "stick" ? "stick" : "try_again";
}

export function ReturnedIssueRetryControls({
  issue,
}: ReturnedIssueRetryControlsProps) {
  const [retryMode, setRetryMode] = useState<RetryMode>(() => getInitialRetryMode(issue));
  const originalAttempt = issue.observed_text?.trim() || "Your original answer";

  return (
    <div className="grid min-w-0 content-start gap-3">
      <div className="rounded-2xl border border-amber-200 bg-white px-3 py-2 text-sm text-[color:var(--ink)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">
          Your first try
        </p>
        <p className="mt-1 min-w-0 break-words text-base font-semibold">
          {originalAttempt}
        </p>
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">
          What would you like to do?
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ["stick", "Stick with this"],
            ["try_again", "Try again"],
          ].map(([value, label]) => (
            <label
              key={`${issue.issue_id}-${value}`}
              className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium text-[color:var(--ink)] ${
                retryMode === value
                  ? "border-[var(--scarlett)] bg-[rgba(252,228,244,0.36)]"
                  : "border-amber-200 bg-white"
              }`}
            >
              <input
                type="radio"
                name={`returned_issue_retry_mode:${issue.issue_id}`}
                value={value}
                checked={retryMode === value}
                onChange={() => setRetryMode(value as RetryMode)}
                className="h-4 w-4 border-[var(--border)] text-[var(--scarlett)]"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {retryMode === "stick" ? (
        <input
          type="hidden"
          name={`returned_issue_attempt:${issue.issue_id}`}
          value={issue.observed_text ?? ""}
        />
      ) : (
        <label className="grid gap-1.5 text-sm text-[color:var(--ink)]">
          <span className="font-medium">New try</span>
          <input
            type="text"
            name={`returned_issue_attempt:${issue.issue_id}`}
            defaultValue={issue.attempted_correction ?? ""}
            className="brand-input h-11 rounded-2xl bg-white px-4 text-sm"
            placeholder="Type your new try"
          />
        </label>
      )}

      {issue.allow_confidence ? (
        <fieldset className="grid gap-2">
          <legend className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">
            How did this feel?
          </legend>
          <div className="flex flex-wrap gap-2">
            {(["easy", "medium", "hard"] as const).map((value) => (
              <label
                key={`${issue.issue_id}-${value}`}
                className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-[color:var(--ink)]"
              >
                <input
                  type="radio"
                  name={`returned_issue_reflection:${issue.issue_id}`}
                  value={value}
                  defaultChecked={issue.reflection === value}
                  className="h-4 w-4 border-[var(--border)] text-[var(--scarlett)]"
                />
                <span className="capitalize">{value}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
