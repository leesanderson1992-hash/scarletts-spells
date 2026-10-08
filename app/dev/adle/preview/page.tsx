import Link from "next/link";
import { notFound } from "next/navigation";

import { canOpenAdleDesignPreview } from "@/lib/adle/design-preview-access";
import { PreviewThemeControl } from "./preview-theme-control";

export const dynamic = "force-dynamic";

const lessons = [
  { name: "Generic Word Lab", href: "/dev/adle/common-word-lab", detail: "Generic composer experience" },
  { name: "Prefix Word Lab", href: "/dev/adle/prefix-word-lab", detail: "Four-word lesson: discover, split, sort, build, cover, dictate and reflect" },
  { name: "Suffix Word Lab", href: "/dev/adle/dynamic-affix-v3", detail: "The reviewed -ment lesson" },
  { name: "Base word families", href: "/dev/adle/base-word-family", detail: "Build words from a base" },
  { name: "Compound words", href: "/dev/adle/compound-word", detail: "Combine two words" },
  { name: "-ing endings", href: "/dev/adle/ing-endings", detail: "Add -ing and practise the spelling change" },
  { name: "Comparatives and superlatives", href: "/dev/adle/comparative-superlative", detail: "Compare with -er and -est" },
  { name: "Review", href: "/dev/adle/review-conundrum", detail: "Spin the wheel and try a review challenge" },
] as const;

export default function AdlePreviewIndexPage() {
  if (!canOpenAdleDesignPreview()) notFound();

  return (
    <main className="brand-shell min-h-screen px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <p className="brand-eyebrow">ADLE · Adie design review</p>
        <h1 className="mt-2 text-4xl font-black text-[color:var(--ink)]">Interactive lesson previews</h1>
        <p className="mt-3 max-w-3xl text-[color:var(--mid)]">
          Open each lesson to try the real interface with sample content. These previews do not submit, score, schedule, or save learner evidence.
        </p>
        <div className="mt-6"><PreviewThemeControl /></div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lessons.map((lesson) => (
            <Link key={lesson.href} href={lesson.href} className="brand-card group flex min-h-40 flex-col justify-between rounded-3xl p-6 transition-transform hover:-translate-y-1 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-pink-500">
              <div>
                <h2 className="text-xl font-black text-[color:var(--ink)]">{lesson.name}</h2>
                <p className="mt-2 text-sm text-[color:var(--mid)]">{lesson.detail}</p>
              </div>
              <span className="mt-5 font-bold text-[color:var(--adie-pink-strong)] group-hover:underline">Open lesson →</span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
