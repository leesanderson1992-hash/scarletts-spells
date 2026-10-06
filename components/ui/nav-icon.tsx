export type NavIconName = "course" | "analytics" | "settings" | "review" | "logout";

export function NavIcon({ name }: { name: NavIconName }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "course") return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...common}>
    <path d="m2.5 8.5 9.5-5 9.5 5-9.5 5-9.5-5Z" /><path d="M6.5 10.6v5.2c3.4 2.8 7.6 2.8 11 0v-5.2" /><path d="M21.5 8.5v7" />
  </svg>;
  if (name === "analytics") return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...common}>
    <path d="M3.5 19.5h17" /><rect x="5" y="11.5" width="3" height="6" rx=".7" /><rect x="10.5" y="7.5" width="3" height="10" rx=".7" /><rect x="16" y="4.5" width="3" height="13" rx=".7" />
  </svg>;
  if (name === "settings") return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...common}>
    <circle cx="12" cy="12" r="3" /><path d="M19.1 14.7a1.7 1.7 0 0 0 .34 1.88l.05.05-1.82 1.82-.05-.05a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.04 1.56V19.8h-2.58v-.11a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.88.34l-.05.05-1.82-1.82.05-.05a1.7 1.7 0 0 0 .34-1.88 1.7 1.7 0 0 0-1.56-1.04H6.1v-2.58h.11a1.7 1.7 0 0 0 1.56-1.04 1.7 1.7 0 0 0-.34-1.88l-.05-.05 1.82-1.82.05.05a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.04-1.56V4.2h2.58v.11a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.88-.34l.05-.05 1.82 1.82-.05.05a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.04h.11v2.58h-.11a1.7 1.7 0 0 0-1.56 1.04Z" />
  </svg>;
  if (name === "review") return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...common}>
    <path d="M4.5 20h4l10-10a2.8 2.8 0 0 0-4-4l-10 10v4Z" /><path d="m12.5 8 3.5 3.5M4.5 4.5h5" />
  </svg>;
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...common}>
    <path d="M10 4.5H5.5A2.5 2.5 0 0 0 3 7v10a2.5 2.5 0 0 0 2.5 2.5H10" /><path d="M13 7.5 18 12l-5 4.5M8.5 12H18" />
  </svg>;
}
