import { notFound } from "next/navigation";

import { PhaseCCompatibilityPreview } from "./phase-c-compatibility-preview";

export default function PhaseCCompatibilityPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <main className="brand-page min-h-screen px-4 py-8"><div className="mx-auto grid max-w-3xl gap-8"><header><p className="brand-eyebrow">Development-only Phase C proof</p><h1 className="brand-title mt-3 text-4xl font-semibold">Historical activity normalization</h1></header><PhaseCCompatibilityPreview /></div></main>;
}
