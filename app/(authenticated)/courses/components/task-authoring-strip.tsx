import { BuilderInfoHint } from "@/app/courses/components/builder-info-hint";

type TaskAuthoringStripProps = {
  chips: string[];
  hintLabel?: string;
  hintText?: string;
  className?: string;
};

export function TaskAuthoringStrip({
  chips,
  hintLabel,
  hintText,
  className,
}: TaskAuthoringStripProps) {
  return (
    <div
      className={
        className ??
        "flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-[rgba(252,228,244,0.18)] px-4 py-3"
      }
    >
      {chips.map((chip) => (
        <span
          key={chip}
          className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]"
        >
          {chip}
        </span>
      ))}
      {hintLabel && hintText ? (
        <BuilderInfoHint label={hintLabel}>{hintText}</BuilderInfoHint>
      ) : null}
    </div>
  );
}
