import type { ContextReviewDelivery } from "@/lib/writing-engine/whole-writing/context-review-repository";

import { resolveContextReviewSuggestion } from "./actions";

export function ContextualUseSuggestionsPanel(props: {
  rows: ContextReviewDelivery[];
  redirectPath: string;
}) {
  if (!props.rows.length) return null;
  return (
    <section className="brand-card rounded-3xl p-4 md:p-5" aria-labelledby="contextual-use-heading">
      <p className="brand-eyebrow">Context checks</p>
      <h2 id="contextual-use-heading" className="mt-1 text-lg font-semibold text-[color:var(--ink)]">
        Correctly spelled; possibly the wrong word here
      </h2>
      <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
        These suggestions passed a bounded family check. Please confirm each one before it joins the child’s correction work.
      </p>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--border)] bg-white">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead><tr>{["Child wrote", "Suggested word", "Original context", "Decision"].map((label) => <th key={label} className="border-b p-3">{label}</th>)}</tr></thead>
          <tbody>{props.rows.map((row) => <tr key={row.id}>
            <td className="border-b p-3 align-top font-semibold">{row.observedText}<small className="mt-1 block break-all font-normal text-[color:var(--mid)]">{row.sourceFieldPath}</small></td>
            <td className="border-b p-3 align-top font-semibold">{row.suggestedReplacement}<small className="mt-1 block font-normal text-[color:var(--mid)]">{row.familyKey}</small></td>
            <td className="border-b p-3 align-top whitespace-pre-wrap">{row.contextExcerpt}</td>
            <td className="border-b p-3 align-top"><div className="flex flex-wrap gap-2">
              <form action={resolveContextReviewSuggestion}>
                <input type="hidden" name="delivery_id" value={row.id} />
                <input type="hidden" name="decision" value="accepted" />
                <input type="hidden" name="redirect_path" value={props.redirectPath} />
                <button type="submit" className="brand-primary-btn">Confirm</button>
              </form>
              <form action={resolveContextReviewSuggestion}>
                <input type="hidden" name="delivery_id" value={row.id} />
                <input type="hidden" name="decision" value="not_a_learning_issue" />
                <input type="hidden" name="redirect_path" value={props.redirectPath} />
                <button type="submit" className="brand-secondary-btn">Not an issue</button>
              </form>
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}
