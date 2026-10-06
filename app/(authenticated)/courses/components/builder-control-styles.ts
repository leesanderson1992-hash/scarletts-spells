export function builderIconButtonClass(
  variant: "neutral" | "destructive" | "success" | "warning" | "accent" = "neutral",
  size: "sm" | "md" = "md",
) {
  const sizeClass = size === "sm" ? "h-9 w-9" : "h-10 w-10";
  const base = `inline-flex ${sizeClass} items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-35`;

  switch (variant) {
    case "destructive":
      return `${base} border-[var(--border)] bg-white text-rose-700 hover:bg-rose-50`;
    case "success":
      return `${base} border-[var(--border)] bg-white text-emerald-700 hover:bg-emerald-50`;
    case "warning":
      return `${base} border-[var(--border)] bg-white text-amber-700 hover:bg-amber-50`;
    case "accent":
      return `inline-flex ${sizeClass} items-center justify-center rounded-full bg-[var(--scarlett)] text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-35`;
    default:
      return `${base} border-[var(--border)] bg-white text-[color:var(--mid)] hover:text-[var(--scarlett)]`;
  }
}

export const BUILDER_TEXT_BUTTON_CLASS =
  "inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-white px-4 text-sm font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]";
