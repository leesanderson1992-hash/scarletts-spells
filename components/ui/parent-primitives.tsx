import Link from "next/link";

export function DashboardCard({ title, href, children, className = "" }: {
  title: string; href?: string; children: React.ReactNode; className?: string;
}) {
  return <section className={"parent-card " + className}>
    <div className="parent-card-heading"><h2>{title}</h2>{href ? <Link href={href} prefetch>View all <span aria-hidden="true">→</span></Link> : null}</div>
    {children}
  </section>;
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  return <div className="parent-progress" aria-label={label}>
    <div className="parent-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={label}>
      <span style={{ width: percent + "%" }} />
    </div><strong>{percent}%</strong>
  </div>;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="parent-empty">{children}</p>;
}

export function SkeletonCard({ title }: { title: string }) {
  return <section className="parent-card parent-skeleton" aria-label={title} aria-busy="true">
    <span className="parent-skeleton-line short" /><span className="parent-skeleton-line" />
    <span className="parent-skeleton-line" /><span className="parent-skeleton-line medium" />
  </section>;
}

export function ErrorCard({ title }: { title: string }) {
  return <DashboardCard title={title}><p role="alert" className="parent-empty">This section could not load. Refresh to try again.</p></DashboardCard>;
}
