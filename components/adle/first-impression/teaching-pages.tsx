"use client";

import { useEffect, useRef, useState } from "react";

export interface TeachingPageExample {
  text: string;
  explanation?: string;
}

export interface TeachingPageSection {
  heading?: string;
  paragraphs: readonly string[];
  examples?: readonly TeachingPageExample[];
}

export interface TeachingPageConfig {
  id: string;
  type: "teaching";
  eyebrow?: string;
  title: string;
  paragraphs: readonly string[];
  callout?: string;
  model?: { first: string; second: string; result: string };
  examples?: readonly TeachingPageExample[];
  sections?: readonly TeachingPageSection[];
}

export interface MeetWordConfig {
  id: string;
  word: string;
  label?: string;
  wordParts?: readonly string[];
  detail?: string;
  provenance?: string;
}

export interface TeachingPagesConfig {
  pages: readonly TeachingPageConfig[];
  meetWords: {
    title?: string;
    introduction?: string;
    words: readonly MeetWordConfig[];
  };
}

export function validateTeachingPagesConfig(config: TeachingPagesConfig): boolean {
  return config.pages.length >= 1
    && config.pages.length <= 3
    && config.pages.every((page) => page.type === "teaching" && page.id.trim() !== "" && page.title.trim() !== "")
    && config.meetWords.words.length > 0
    && config.meetWords.words.every((word) => word.id.trim() !== "" && word.word.trim() !== "");
}

export function TeachingPages(props: {
  config: TeachingPagesConfig;
  initialPageIndex?: number;
  onPageChange?: (pageIndex: number) => void;
  onComplete: () => void;
  completionLabel?: string;
}) {
  const total = props.config.pages.length + 1;
  const initialPageIndex = Math.min(Math.max(props.initialPageIndex ?? 0, 0), total - 1);
  const [pageIndex, setPageIndex] = useState(initialPageIndex);
  const focusRef = useRef<HTMLDivElement>(null);
  const onPageChangeRef = useRef(props.onPageChange);
  const isMeetWords = pageIndex === total - 1;

  useEffect(() => {
    onPageChangeRef.current = props.onPageChange;
  }, [props.onPageChange]);

  useEffect(() => {
    focusRef.current?.focus({ preventScroll: true });
    onPageChangeRef.current?.(pageIndex);
  }, [pageIndex]);

  function move(next: number) {
    setPageIndex(Math.min(Math.max(next, 0), total - 1));
  }

  const page = props.config.pages[pageIndex];
  return (
    <section className="grid gap-5 text-cyan-50" aria-label="Lesson teaching pages">
      <div ref={focusRef} tabIndex={-1} className="outline-none">
        {isMeetWords ? (
          <MeetWords config={props.config.meetWords} pageNumber={pageIndex + 1} pageCount={total} />
        ) : page ? (
          <TeachingPage page={page} pageNumber={pageIndex + 1} pageCount={total} />
        ) : null}
      </div>
      <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="Teaching page navigation">
        <button
          type="button"
          disabled={pageIndex === 0}
          className="min-h-12 rounded-full border border-cyan-200/60 px-6 font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => move(pageIndex - 1)}
        >
          Back
        </button>
        {isMeetWords ? (
          <button type="button" className="min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950" onClick={props.onComplete}>
            {props.completionLabel ?? "Start the activities"}
          </button>
        ) : (
          <button type="button" className="min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950" onClick={() => move(pageIndex + 1)}>
            Next page
          </button>
        )}
      </nav>
    </section>
  );
}

function TeachingPage(props: { page: TeachingPageConfig; pageNumber: number; pageCount: number }) {
  const { page } = props;
  return (
    <article className="grid gap-5 text-left" aria-labelledby={`teaching-page-${page.id}`}>
      <header className="text-center">
        <p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">
          {page.eyebrow ?? "Learn"} · Page {props.pageNumber} of {props.pageCount}
        </p>
        <h1 id={`teaching-page-${page.id}`} className="mt-2 text-3xl font-black text-white md:text-4xl">{page.title}</h1>
      </header>
      {page.paragraphs.length > 0 ? (
        <div className="mx-auto grid max-w-3xl gap-3 text-center text-lg leading-8 text-cyan-50">
          {page.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </div>
      ) : null}
      {page.callout ? <p className="rounded-2xl border-2 border-cyan-200 bg-cyan-100 px-5 py-4 text-center text-xl font-black text-cyan-950">{page.callout}</p> : null}
      {page.model ? (
        <div className="mx-auto flex flex-wrap items-center justify-center gap-3 rounded-3xl border border-cyan-300/20 bg-slate-950/45 p-5" aria-label={`${page.model.first} plus ${page.model.second} makes ${page.model.result}`}>
          <span className="rounded-2xl bg-cyan-100 px-4 py-3 text-xl font-black text-cyan-950">{page.model.first}</span>
          <span aria-hidden="true" className="text-2xl text-cyan-200">+</span>
          <span className="rounded-2xl bg-amber-100 px-4 py-3 text-xl font-black text-amber-950">{page.model.second}</span>
          <span aria-hidden="true" className="text-2xl text-cyan-200">→</span>
          <span className="rounded-2xl bg-emerald-100 px-4 py-3 text-xl font-black text-emerald-950">{page.model.result}</span>
        </div>
      ) : null}
      {page.examples?.length ? <ExampleGrid examples={page.examples} /> : null}
      {page.sections?.map((section, index) => (
        <section key={section.heading ?? index} className="grid gap-3 rounded-3xl border border-cyan-300/30 bg-slate-950/35 p-5">
          {section.heading ? <h2 className="text-xl font-black text-white">{section.heading}</h2> : null}
          {section.paragraphs.map((paragraph) => <p key={paragraph} className="leading-relaxed text-cyan-50">{paragraph}</p>)}
          {section.examples?.length ? <ExampleGrid examples={section.examples} /> : null}
        </section>
      ))}
    </article>
  );
}

function ExampleGrid(props: { examples: readonly TeachingPageExample[] }) {
  return <ul className="grid gap-3 sm:grid-cols-2" aria-label="Examples">{props.examples.map((example) => (
    <li key={`${example.text}:${example.explanation ?? ""}`} className="rounded-2xl bg-white p-4 text-left text-slate-950">
      <p className="text-lg font-black">{example.text}</p>
      {example.explanation ? <p className="mt-1 text-sm font-semibold text-slate-600">{example.explanation}</p> : null}
    </li>
  ))}</ul>;
}

function MeetWords(props: { config: TeachingPagesConfig["meetWords"]; pageNumber: number; pageCount: number }) {
  return (
    <section className="grid gap-5 text-center" aria-labelledby="meet-the-words-title" data-teaching-page-type="meet_words">
      <header>
        <p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">Meet the Words · Page {props.pageNumber} of {props.pageCount}</p>
        <h1 id="meet-the-words-title" className="mt-2 text-3xl font-black text-white md:text-4xl">{props.config.title ?? "Today’s words"}</h1>
        {props.config.introduction ? <p className="mx-auto mt-3 max-w-2xl text-lg leading-8 text-cyan-50">{props.config.introduction}</p> : null}
      </header>
      <ul className="grid gap-3 sm:grid-cols-2" aria-label="Lesson words">
        {props.config.words.map((word) => (
          <li key={word.id} className="rounded-2xl border border-white/25 bg-white p-4 text-left text-slate-950 shadow-[0_10px_0_rgba(8,47,73,.2)]">
            {word.label ? <p className="text-xs font-black uppercase tracking-[.14em] text-cyan-700">{word.label}</p> : null}
            <p className="mt-1 text-2xl font-black">{word.wordParts?.length ? <><span className="text-cyan-800">{word.wordParts.join(" + ")}</span><span aria-hidden="true" className="mx-2 text-slate-400">→</span></> : null}{word.word}</p>
            {word.detail ? <p className="mt-1 text-sm font-semibold text-slate-600">{word.detail}</p> : null}
            {word.provenance ? <p className="mt-2 text-xs font-bold text-amber-700">{word.provenance}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
