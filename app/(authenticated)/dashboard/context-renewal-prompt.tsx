"use client";

import { useEffect, useRef, useState } from "react";

import { renewParentWritingContextAuthorisation } from "./context-renewal-actions";

export function ContextRenewalPrompt({ renewals, error }: {
  renewals: Array<{ childId: string; childName: string; status: "not_authorised" | "expired" | "due_soon" }>;
  error: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(renewals.length / 2);
  const visibleRenewals = renewals.slice(page * 2, page * 2 + 2);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, [open]);
  if (!open) return null;
  const close = () => dialogRef.current?.close();
  return <dialog ref={dialogRef} onClose={() => setOpen(false)} aria-labelledby="context-renewal-title"
      className="brand-card m-auto w-[min(36rem,calc(100vw-2rem))] rounded-3xl border border-[#d8c8f4] bg-[#fffaf5] p-4 shadow-2xl backdrop:bg-[#1d1640]/55">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="brand-eyebrow">Parent choice</p>
          <h2 id="context-renewal-title" className="brand-title mt-2 text-2xl font-semibold">
            Writing context checking
          </h2>
        </div>
        <button type="button" onClick={close} aria-label="Close renewal prompt"
          className="rounded-full border border-[#d8c8f4] bg-white px-3 py-1.5 text-lg text-[#3a285e]">×</button>
      </div>
      <p className="brand-copy mt-3 text-sm leading-6">
        Choose each child profile for which you want context checking of writing you submit in the parent area.
        Authorisation is recorded separately for each child.
      </p>
      <p className="brand-copy mt-3 text-sm leading-6">
        Short relevant excerpts may be sent to OpenAI to check word choice. Account details and drafts are not sent.
        OpenAI may retain API safety logs for up to 30 days. Each authorisation lasts 30 days.
      </p>
      {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
        We could not record your choice. Please try again or contact support.
      </p>}
      <div className="mt-4 w-full min-w-0 overflow-hidden rounded-2xl border border-[#d8c8f4] bg-white">
        <table className="w-full table-fixed border-collapse text-left text-xs sm:text-sm" style={{ tableLayout: "fixed", width: "100%" }}>
          <thead className="bg-[#f3eaff] text-[#3a285e]">
            <tr>
              <th scope="col" className="w-[32%] px-2 py-2 font-semibold sm:px-3">Profile</th>
              <th scope="col" className="w-[36%] px-2 py-2 font-semibold sm:px-3">Status</th>
              <th scope="col" className="w-[32%] px-2 py-2 font-semibold sm:px-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {visibleRenewals.map(({ childId, childName, status }) => <tr key={childId} className="border-t border-[#e7dcf7]">
              <th scope="row" className="px-2 py-2 font-semibold text-[#3a285e] sm:px-3" style={{ overflowWrap: "anywhere" }}>{childName}</th>
              <td className="px-2 py-2 text-[#5a4a76] sm:px-3" style={{ overflowWrap: "anywhere" }}>
                {status === "not_authorised" ? "Not authorised" : status === "expired" ? "Expired" : "Expiring soon"}
              </td>
              <td className="px-2 py-2 sm:px-3">
                <form action={renewParentWritingContextAuthorisation}>
                  <input type="hidden" name="child_id" value={childId} />
                  <button type="submit" className="brand-primary-btn min-h-9 px-2 text-xs sm:px-3 sm:text-sm" aria-label={`${status === "not_authorised" ? "Authorise" : "Renew"} writing context checking for ${childName}`}>
                    {status === "not_authorised" ? "Authorise" : "Renew"}
                  </button>
                </form>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && <div className="mt-3 flex items-center justify-between gap-3 text-sm text-[#5a4a76]">
        <button type="button" className="font-semibold text-[#3a285e] disabled:opacity-40" disabled={page === 0}
          onClick={() => setPage((current) => current - 1)}>Previous</button>
        <span>Page {page + 1} of {pageCount}</span>
        <button type="button" className="font-semibold text-[#3a285e] disabled:opacity-40" disabled={page === pageCount - 1}
          onClick={() => setPage((current) => current + 1)}>Next</button>
      </div>}
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" onClick={close} className="brand-secondary-btn">Not now</button>
      </div>
  </dialog>;
}
