"use client";

export function FormatHint({ label, format, example }: { label: string; format: string; example: string }) {
  return <span className="group relative ml-1 inline-flex align-middle" tabIndex={0}
    aria-label={`How to fill ${label}. Format: ${format} Example: ${example}`}>
    <span aria-hidden="true" className="inline-flex size-4 items-center justify-center rounded-full border border-[var(--border)] text-xs font-normal">i</span>
    <span role="tooltip" className="pointer-events-none absolute bottom-full left-0 z-30 hidden w-64 rounded bg-white p-2 text-xs font-normal text-[color:var(--ink)] shadow group-hover:block group-focus:block">
      <strong>Format:</strong> {format}<br /><strong>Example:</strong> {example}
    </span>
  </span>;
}
