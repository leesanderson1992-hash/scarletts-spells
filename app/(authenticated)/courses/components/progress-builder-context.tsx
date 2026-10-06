import Link from "next/link";

type ProgressBuilderContextProps = {
  courseTitle: string;
  moduleTitle: string;
  builderPath: string;
  overviewPath: string;
  modulePath?: string;
  moduleEditPath?: string;
};

export function ProgressBuilderContext({
  courseTitle,
  moduleTitle,
  builderPath,
  overviewPath,
  modulePath,
  moduleEditPath,
}: ProgressBuilderContextProps) {
  return (
    <div className="brand-card rounded-3xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="brand-eyebrow">Progress builder</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[color:var(--ink)]">
            {courseTitle}
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[color:var(--mid)]">
            You are working inside <span className="font-medium text-[color:var(--ink)]">{moduleTitle}</span>.
            Jump back to the task step or course overview without losing your builder context.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={builderPath}
            className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--border)] bg-white px-4 text-sm font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]"
          >
            Course tasks
          </Link>
          <Link
            href={overviewPath}
            className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--border)] bg-white px-4 text-sm font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]"
          >
            Course overview
          </Link>
          {modulePath ? (
            <Link
              href={modulePath}
              className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--border)] bg-white px-4 text-sm font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]"
            >
              Open module
            </Link>
          ) : null}
          {moduleEditPath ? (
            <Link
              href={moduleEditPath}
              className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--border)] bg-white px-4 text-sm font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]"
            >
              Edit module
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
