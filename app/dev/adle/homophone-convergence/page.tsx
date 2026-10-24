import Link from "next/link";
import { notFound } from "next/navigation";
import { canOpenAdleDesignPreview } from "@/lib/adle/design-preview-access";
import { APPROVED_CONVERGENCE_LESSONS, buildConvergencePreview } from "@/lib/adle/homophone/convergence-preview";
import { HomophoneConvergenceReview } from "./review";

export const dynamic = "force-dynamic";

type Props = { searchParams?: Promise<{ skill?: string; rotation?: string }> };

function label(key: string): string {
  if (key.endsWith("SE_SY_CE_CY")) return "-se/-sy and -ce/-cy pairs";
  if (key.endsWith("ED_FOR_T")) return "Past tense pairs";
  if (key.endsWith("HOMOPHONES_PAIRS")) return "Contraction and possessive pairs";
  return key.replace(/^D4_HOM_(CONFUSABLE_WORDS_|CONTENT_WORD_HOMOPHONES_|FUNCTION_WORD_HOMOPHONES_|CONTRACTION_POSSESSIVE_)?/, "")
    .replaceAll("_", " / ").toLowerCase();
}

export default async function HomophoneConvergencePage({ searchParams }: Props) {
  if (!canOpenAdleDesignPreview()) notFound();
  const params = await searchParams;
  const selectedKey = params?.skill ?? APPROVED_CONVERGENCE_LESSONS[0].microSkillKey;
  if (!APPROVED_CONVERGENCE_LESSONS.some(lesson => lesson.microSkillKey === selectedKey)) notFound();
  const rotation = Number.parseInt(params?.rotation ?? "0", 10);
  const preview = buildConvergencePreview(selectedKey, Number.isFinite(rotation) ? rotation : 0);
  const source = APPROVED_CONVERGENCE_LESSONS.find(lesson => lesson.microSkillKey === selectedKey)!;
  return <main className="brand-shell min-h-screen px-4 pb-32 pt-8 sm:px-6">
    <div className="mx-auto grid min-w-0 max-w-6xl gap-5">
      <header className="brand-card rounded-3xl p-5 sm:p-7">
        <p className="text-sm font-black uppercase tracking-wider text-[color:var(--mid)]">ADLE lesson review · 58 approved content packages</p>
        <h1 className="mt-2 text-3xl font-black">Homophones and confusables</h1>
        <p className="mt-2 max-w-3xl">Open each microskill to review its teaching, sentence choices, cover check, dictation and final context check. This local preview does not create learner evidence or activate a Production route.</p>
      </header>
      <section className="brand-card rounded-3xl p-5" aria-label="Select a lesson">
        <h2 className="text-xl font-black">All 58 lessons</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {APPROVED_CONVERGENCE_LESSONS.map(lesson => <Link key={lesson.microSkillKey}
            href={`/dev/adle/homophone-convergence?skill=${encodeURIComponent(lesson.microSkillKey)}#lesson`}
            aria-current={lesson.microSkillKey === selectedKey ? "page" : undefined}
            className={`rounded-xl border px-3 py-3 text-sm font-bold capitalize ${lesson.microSkillKey === selectedKey ? "border-cyan-500 bg-cyan-50 text-slate-950" : "border-slate-200 bg-white text-slate-800 hover:border-cyan-400"}`}>
            {label(lesson.microSkillKey)}</Link>)}
        </div>
      </section>
      <section id="lesson" className="brand-card scroll-mt-5 rounded-3xl p-5" aria-label="Selected lesson">
        <p className="break-all text-xs font-bold text-[color:var(--mid)]">{selectedKey}</p>
        <h2 className="mt-1 text-2xl font-black capitalize">{label(selectedKey)}</h2>
        <p className="mt-2 text-sm">Selected contrasts: {source.sets.filter(set => preview.selectedSetKeys.includes(set.setKey))
          .map(set => set.members.map(member => member.word).join(" / ")).join(" · ")}</p>
        {preview.rotationCount > 1 ? <nav className="mt-4 flex flex-wrap gap-2" aria-label="Pair groups">
          {Array.from({ length: preview.rotationCount }, (_, index) => <Link key={index}
            href={`/dev/adle/homophone-convergence?skill=${encodeURIComponent(selectedKey)}&rotation=${index}#lesson`}
            aria-current={index === preview.rotation ? "page" : undefined}
            className={`rounded-full border px-4 py-2 text-sm font-bold ${index === preview.rotation ? "border-cyan-500 bg-cyan-50" : "border-slate-300 bg-white"}`}>
            Pair group {index + 1}</Link>)}
        </nav> : null}
        <p className="mt-3 text-sm">{source.sets.length} approved {source.sets.length === 1 ? "set" : "sets"} in this microskill. This lesson shows {preview.selectedSetKeys.length} intact {preview.selectedSetKeys.length === 1 ? "set" : "sets"}.</p>
      </section>
      <HomophoneConvergenceReview key={`${selectedKey}:${preview.rotation}`} preview={preview} />
    </div>
  </main>;
}
