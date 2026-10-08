import { notFound } from "next/navigation";

import { VisualConvergenceLab } from "@/app/admin/adle/activity-catalogue/visual-convergence-lab";

export default function ActivityConvergenceDevPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return <main className="brand-page min-h-screen px-4 py-8 sm:px-6 lg:px-8">
    <div className="mx-auto grid max-w-7xl gap-8">
      <header>
        <p className="brand-eyebrow">Development-only visual review alias</p>
        <h1 className="brand-title mt-3 text-4xl font-semibold">ADLE Visual Convergence Lab</h1>
        <p className="brand-copy mt-4 max-w-4xl">This local route exists only so the same read-only lab can be inspected without an authenticated admin session. It returns 404 in Production.</p>
      </header>
      <VisualConvergenceLab />
    </div>
  </main>;
}
