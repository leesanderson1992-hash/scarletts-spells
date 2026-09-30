"use client";

import type { PassageReviewRow } from "@/lib/writing-engine/whole-writing/context-passage-review";
import { recordPassageReviewEvent } from "./actions";

export function PassageContextReviewRow({ row, submissionId, readOnly, showRouteColumns, showActionsColumn }: {
  row: PassageReviewRow; submissionId: string; readOnly: boolean;
  showRouteColumns: boolean; showActionsColumn: boolean;
}) {
  const editable = !readOnly && row.sourceStatus === "ready" && row.issueStatus === null;
  const common = <>
    <input type="hidden" name="submission_id" value={submissionId} />
    <input type="hidden" name="finding_id" value={row.findingId} />
  </>;
  return <tr className="border-t border-sky-200 bg-sky-50/40 text-sm">
    <td className="px-3 py-2 font-medium">
      {row.dismissed || row.sourceStatus !== "ready" ? row.observed : <a href={`#context-${row.findingId}`}
        className="text-sky-800 underline underline-offset-2"
        title="Show this occurrence in the original writing">{row.observed}</a>}
    </td>
    <td className="px-3 py-2">
      {editable && !row.dismissed ? <form action={recordPassageReviewEvent} className="flex items-center gap-1">
        {common}<input type="hidden" name="review_action" value="EDIT" />
        <input name="correction" key={row.correction} defaultValue={row.correction} maxLength={60}
          aria-label={`Correction for ${row.observed}`} className="w-28 rounded border border-sky-200 px-2 py-1" />
        <button className="rounded border border-sky-200 bg-white px-2 py-1 text-xs">Save</button>
      </form> : row.correction}
    </td>
    <td className="px-3 py-2">—</td>
    <td className="px-2 py-2 text-center" title="Luna context suggestion">C</td>
    <td className="px-3 py-2">{row.sourceStatus !== "ready" ? "Source unavailable"
      : row.issueStatus === "sent_back_to_child" ? "Sent back"
      : row.dismissed ? "Not an issue" : "Suggested"}</td>
    {showRouteColumns ? <><td className="px-3 py-2">Context</td><td className="px-3 py-2">Reviewer confirms after return</td></> : null}
    {showActionsColumn ? <td className="px-3 py-2">
      {editable ? <form action={recordPassageReviewEvent}>
        {common}<input type="hidden" name="review_action" value={row.dismissed ? "RESTORE" : "DISMISS"} />
        <button aria-label={row.dismissed ? `Restore ${row.observed}` : `Not an issue: ${row.observed}`}
          title={row.dismissed ? "Restore suggestion" : "Not an issue"}
          className="rounded border border-sky-200 bg-white px-2 py-1 font-semibold">
          {row.dismissed ? "Undo" : "×"}
        </button>
      </form> : null}
    </td> : null}
  </tr>;
}
