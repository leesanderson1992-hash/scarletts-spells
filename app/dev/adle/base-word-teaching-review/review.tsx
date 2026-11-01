import { BASE_WORD_MATHS_REVIEW, BASE_WORD_TEACHING_REVIEW_PAGES } from "@/lib/adle/morphology/base-word-teaching-pages";
import { candidateBaseWordTeachingPages } from "@/lib/adle/morphology/base-word-teaching-pages";
import { BASE_WORD_FAMILY_PREVIEW_PAYLOAD } from "@/lib/adle/morphology/base-word-family-preview-fixture";
import { MeetWords } from "@/components/adle/first-impression/teaching-pages";

const LABELS = ["1 · What is a base word?", "2 · The maths of spelling", "3 · The long word", "4 · Meet today’s words"];
const TILE_COLOURS = ["bg-pink-200 text-pink-950", "bg-violet-200 text-violet-950", "bg-amber-200 text-amber-950", "bg-cyan-200 text-cyan-950", "bg-lime-200 text-lime-950", "bg-orange-200 text-orange-950"];

export function BaseWordTeachingReview(props: { page: number }) {
  return <main className="mx-auto grid w-full max-w-5xl gap-4 p-4 sm:p-8">
    <header className="rounded-3xl border border-cyan-200 bg-white p-5 text-slate-950">
      <p className="text-xs font-black uppercase tracking-[.2em] text-cyan-700">Local content review · Identify the base word</p>
      <h1 className="mt-2 text-2xl font-black">Teaching pages from your PDF</h1>
      <p className="mt-2 text-sm">The four approved teaching pages. This local review does not create learner evidence.</p>
      <nav className="mt-4 flex flex-wrap gap-2" aria-label="Review teaching page">
        {LABELS.map((label, index) => <a key={label} href={`?page=${index + 1}`} aria-current={props.page === index + 1 ? "page" : undefined}
          className={`rounded-full border px-4 py-2 text-sm font-bold ${props.page === index + 1 ? "border-cyan-600 bg-cyan-50" : "border-slate-300 bg-white"}`}>{label}</a>)}
        <a href="/dev/adle/base-word-family" className="rounded-full border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-bold">Open the full Word Lab</a>
      </nav>
    </header>
    <div className="rounded-3xl bg-slate-950 p-5 text-cyan-50 shadow-xl sm:p-8">
      {props.page === 4 ? <MeetWords config={candidateBaseWordTeachingPages(BASE_WORD_FAMILY_PREVIEW_PAYLOAD).meetWords} pageNumber={4} pageCount={4} /> : props.page === 3 ? <LongWordPage /> : props.page === 2 ? <MathsPage /> : <WhatIsBaseWordPage />}
      <nav className="mt-8 flex items-center justify-between gap-3" aria-label="Teaching page navigation">
        {props.page > 1 ? <a className="rounded-full border border-cyan-200 px-6 py-3 font-black text-white" href={`?page=${props.page - 1}`}>Back</a> : <span />}
        {props.page < 4 ? <a className="rounded-full bg-cyan-300 px-7 py-3 font-black text-slate-950" href={`?page=${props.page + 1}`}>Next page</a>
          : <a className="rounded-full bg-cyan-300 px-7 py-3 font-black text-slate-950" href="/dev/adle/base-word-family">Open the full Word Lab</a>}
      </nav>
    </div>
    <aside className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      The family tree activity and Cleaver follow page 4 in the full Word Lab.
    </aside>
  </main>;
}

function WhatIsBaseWordPage() {
  const page = BASE_WORD_TEACHING_REVIEW_PAGES.pages[0];
  return <article className="grid gap-5 text-center" aria-labelledby="base-word-review-heading">
    <header><p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">Teaching page 1 · Page 1 of 4</p>
      <h2 id="base-word-review-heading" className="mt-2 text-3xl font-black text-white md:text-4xl">{page.title}</h2></header>
    <div className="mx-auto grid max-w-3xl gap-3 text-lg leading-8">{page.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
    {page.model ? <div className="mx-auto flex flex-wrap items-center justify-center gap-3 rounded-3xl border border-cyan-300/20 bg-slate-900 p-5" aria-label={`${page.model.first} plus ${page.model.second} makes ${page.model.result}`}>
      <span className="rounded-2xl bg-cyan-100 px-4 py-3 text-xl font-black text-cyan-950">{page.model.first}</span><span className="text-2xl">+</span>
      <span className="rounded-2xl bg-amber-100 px-4 py-3 text-xl font-black text-amber-950">{page.model.second}</span><span className="text-2xl">→</span>
      <span className="rounded-2xl bg-emerald-100 px-4 py-3 text-xl font-black text-emerald-950">{page.model.result}</span>
    </div> : null}
  </article>;
}

function MathsPage() {
  const copy = BASE_WORD_MATHS_REVIEW;
  return <article className="grid gap-6" aria-labelledby="base-word-maths-heading">
    <header className="text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">Teaching page 2 · Page 2 of 4</p>
      <h2 id="base-word-maths-heading" className="mt-2 text-3xl font-black text-white md:text-4xl">{copy.title}</h2>
      <p className="mx-auto mt-4 max-w-3xl text-lg leading-8">{copy.introduction}</p></header>
    <div className="overflow-x-auto rounded-3xl border border-cyan-200/30 bg-white p-2 shadow-lg sm:p-4">
      <table className="w-full table-fixed border-separate border-spacing-1 text-left text-slate-950 sm:border-spacing-2" aria-label="Base-word spelling maths">
        <thead><tr>{copy.columns.map((heading, index) => <th key={heading} scope="col" className={`break-words rounded-xl p-1 text-xs font-black sm:p-3 sm:text-sm ${TILE_COLOURS[index]}`}>{heading}</th>)}</tr></thead>
        <tbody>{copy.rows.map((row) => <tr key={row[0]}>{row.map((word, index) => <td key={word} className={`break-words rounded-xl p-1 text-xs font-black sm:p-3 sm:text-lg ${index === 0 ? "bg-amber-100 text-amber-950" : "bg-slate-100 text-slate-950"}`}>{word}</td>)}</tr>)}</tbody>
      </table>
    </div>
  </article>;
}

function LongWordPage() {
  const copy = BASE_WORD_MATHS_REVIEW;
  return <article className="grid gap-6" aria-labelledby="base-word-long-heading">
    <header className="text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">Teaching page 3 · Page 3 of 4</p>
      <h2 id="base-word-long-heading" className="mt-2 text-3xl font-black text-white md:text-4xl">A ridiculously long word 😂</h2>
      <p className="mx-auto mt-4 max-w-3xl text-xl leading-8">{copy.longWordIntroduction}</p></header>
    <section className="grid gap-5 rounded-3xl border-4 border-fuchsia-300 bg-gradient-to-br from-fuchsia-600 via-violet-600 to-cyan-600 p-5 text-center shadow-[0_12px_0_rgba(74,4,78,.45)] sm:p-7" aria-label="A ridiculously long word">
      <p className="break-words rounded-3xl border-4 border-amber-200 bg-amber-100 px-4 py-5 text-2xl font-black text-violet-950 shadow-[0_8px_0_rgba(120,53,15,.35)] sm:text-3xl">{copy.longWord}</p>
      <div className="flex flex-wrap items-center justify-center gap-2" aria-label="Build the long word from one base word and five affixes">
        {copy.longWordParts.map((part, index) => <div key={part.text} className="flex items-center gap-2">
          {index > 0 ? <span aria-hidden="true" className="text-xl font-black text-white">+</span> : null}
          <div className={`min-w-20 rotate-[-2deg] rounded-2xl border-4 border-white px-3 py-3 shadow-[0_6px_0_rgba(15,23,42,.4)] even:rotate-[2deg] ${TILE_COLOURS[index]}`}>
            <span className="block text-[10px] font-black uppercase tracking-wider">{part.role}</span><strong className="block text-lg sm:text-xl">{part.text}</strong>
          </div>
        </div>)}
      </div>
      <p className="text-sm font-bold text-white">anti- + dis- + establish + -ment + -arian + -ism</p>
    </section>
  </article>;
}
