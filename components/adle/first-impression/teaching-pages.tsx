"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";

export interface TeachingPageExample {
  text: string;
  explanation?: string;
}

export interface TeachingPageSection {
  heading?: string;
  tone?: "standard" | "gold";
  paragraphs: readonly string[];
  examples?: readonly TeachingPageExample[];
}

export type WeakVowelSecretTipBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "examples"; items: readonly { text: string; explanation?: string }[] }
  | { kind: "comparison"; columns: readonly [string, string]; rows: readonly (readonly [string, string])[] }
  | { kind: "group"; heading: string; words: readonly string[] };

export interface WeakVowelSecretTip {
  heading: string;
  blocks: readonly WeakVowelSecretTipBlock[];
}

export interface TeachingPageConfig {
  id: string;
  type: "teaching";
  eyebrow?: string;
  title: string;
  subtitle?: string;
  paragraphs: readonly string[];
  highlightFocusWords?: readonly string[];
  callout?: string;
  model?: { first: string; second: string; result: string };
  examples?: readonly TeachingPageExample[];
  sections?: readonly TeachingPageSection[];
  weakVowelFeature?:
    | { kind: "sound_contrast"; stress: readonly [string, string]; fact: string; schwaExamples: readonly string[]; otherExamples: readonly string[]; vowelReminder: string }
    | { kind: "final_a_groups"; groups: readonly { heading: string; words: readonly string[] }[]; note: string }
    | { kind: "final_a_strategy"; choices: readonly { heading: string; example: string; explanation: string }[]; note: string }
    | { kind: "ending_secret_story"; intro: readonly string[]; examples: readonly { stem: string; ending: string; suffix?: string; sound: string }[]; conclusion: string; tips: readonly WeakVowelSecretTip[]; targetPosition?: "initial" | "medial" | "final" }
    | { kind: "ending_secret_rule"; rule: string; clues: readonly string[]; conclusion: string; motto: string; tips: readonly WeakVowelSecretTip[] };
}

export interface MeetWordConfig {
  id: string;
  word: string;
  label?: string;
  wordParts?: readonly string[];
  detail?: string;
  provenance?: string;
  imageSrc?: string;
  highlightStart?: number;
  highlightLength?: number;
}

export interface TeachingPagesConfig {
  pages: readonly TeachingPageConfig[];
  meetWords: {
    title?: string;
    introduction?: string;
    presentation?: "combined" | "one_word_per_page";
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
  const oneWordPerPage = props.config.meetWords.presentation === "one_word_per_page";
  const total = props.config.pages.length + (oneWordPerPage ? props.config.meetWords.words.length : 1);
  const initialPageIndex = Math.min(Math.max(props.initialPageIndex ?? 0, 0), total - 1);
  const [pageIndex, setPageIndex] = useState(initialPageIndex);
  const focusRef = useRef<HTMLDivElement>(null);
  const onPageChangeRef = useRef(props.onPageChange);
  const isMeetWords = pageIndex >= props.config.pages.length;

  useEffect(() => {
    onPageChangeRef.current = props.onPageChange;
  }, [props.onPageChange]);

  useEffect(() => {
    focusRef.current?.scrollTo({ top: 0 });
    focusRef.current?.focus({ preventScroll: true });
    onPageChangeRef.current?.(pageIndex);
  }, [pageIndex]);

  function move(next: number) {
    setPageIndex(Math.min(Math.max(next, 0), total - 1));
  }

  const page = props.config.pages[pageIndex];
  return (
    <section className="teaching-pages grid gap-5 text-cyan-50" aria-label="Lesson teaching pages">
      <div ref={focusRef} tabIndex={-1} className="outline-none">
        {isMeetWords ? (
          <MeetWords config={props.config.meetWords} pageNumber={pageIndex + 1} pageCount={total} wordIndex={oneWordPerPage ? pageIndex - props.config.pages.length : undefined} />
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
        {pageIndex === total - 1 ? (
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
  const feature = page.weakVowelFeature;
  return (
    <article className={`grid gap-5 text-left ${feature ? "weak-vowel-teaching-page" : ""}`} data-teaching-page-type="reading" aria-labelledby={`teaching-page-${page.id}`}>
      <header className="text-center">
        <p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">
          {page.eyebrow ?? "Learn"} · Page {props.pageNumber} of {props.pageCount}
        </p>
        <h1 id={`teaching-page-${page.id}`} className="mt-2 text-3xl font-black text-white md:text-4xl">{page.title}</h1>
        {page.subtitle ? <p className="weak-vowel-secret-subtitle mt-1 text-lg font-bold">{page.subtitle}</p> : null}
      </header>
      {page.paragraphs.length > 0 ? (
        <div className="mx-auto grid max-w-3xl gap-3 text-center text-lg leading-8 text-cyan-50">
          {page.paragraphs.map((paragraph, index) => <p key={paragraph}>{page.highlightFocusWords?.length && index === page.paragraphs.length - 1 ? <HighlightedFocusWords text={paragraph} words={page.highlightFocusWords} /> : paragraph}</p>)}
        </div>
      ) : null}
      {feature?.kind === "sound_contrast" ? <div className="grid gap-3">
        <div className="weak-vowel-panel-grid grid gap-3 sm:grid-cols-2">
          <section className="weak-vowel-panel weak-vowel-panel-strong rounded-2xl p-4"><h2 className="font-black">Stressed vowels and syllables</h2><p>{feature.stress[0]}</p></section>
          <section className="weak-vowel-panel weak-vowel-panel-quiet rounded-2xl p-4"><h2 className="font-black">Unstressed vowels and syllables</h2><p>{feature.stress[1]}</p></section>
        </div>
        <p className="weak-vowel-fact rounded-2xl px-4 py-3"><strong>Fun fact:</strong> {feature.fact} A schwa can sound like <u className="font-black">“uh”</u>.</p>
        <p className="text-center text-sm font-bold">Stretch these words slowly and listen for the quiet sound:</p>
        <div className="weak-vowel-panel-grid grid gap-3 sm:grid-cols-2">
          <section className="weak-vowel-panel weak-vowel-panel-quiet rounded-2xl p-4"><h2 className="font-black">Unstressed schwa /ə/</h2><ul>{feature.schwaExamples.map(example => <li key={example}>{example}</li>)}</ul></section>
          <section className="weak-vowel-panel weak-vowel-panel-strong rounded-2xl p-4"><h2 className="font-black">Another unstressed vowel /ɪ/</h2><ul>{feature.otherExamples.map(example => <li key={example}>{example}</li>)}</ul></section>
        </div>
        <p className="text-center text-sm font-black">{feature.vowelReminder}</p>
      </div> : null}
      {feature?.kind === "final_a_groups" ? <div className="grid gap-3">
        <table className="weak-vowel-groups-table w-full table-fixed border-separate border-spacing-2" aria-label="Two groups of nouns ending in a"><thead><tr>{feature.groups.map(group => <th key={group.heading} scope="col" className="rounded-xl p-3 text-left">{group.heading}</th>)}</tr></thead>
          <tbody><tr>{feature.groups.map(group => <td key={group.heading} className="rounded-xl p-3 align-top">{group.words.join(" · ")}</td>)}</tr></tbody></table>
        <p className="text-center text-sm font-semibold">{feature.note}</p>
      </div> : null}
      {feature?.kind === "final_a_strategy" ? <div className="grid gap-3">
        <div className="weak-vowel-panel-grid grid gap-3 sm:grid-cols-2">{feature.choices.map(choice => <section key={choice.heading} className="weak-vowel-panel weak-vowel-panel-strong rounded-2xl p-4"><h2 className="font-black">{choice.heading}</h2><p>{choice.explanation}</p><p className="mt-2 font-bold">{choice.example}</p></section>)}</div>
        <p className="weak-vowel-fact rounded-2xl px-4 py-3 text-sm">{feature.note}</p>
      </div> : null}
      {feature?.kind === "ending_secret_story" ? <div className="weak-vowel-secret-story-layout">
        <section className="weak-vowel-secret-story-card" aria-label={feature.targetPosition === "initial" ? "The first letter's secret" : feature.targetPosition === "medial" ? "The middle vowel's secret" : "The ending's secret"}>
          {feature.intro.map((paragraph) => <p key={paragraph}><RichCopy text={paragraph} /></p>)}
          <h2>Listen to these words</h2>
          <ul className="weak-vowel-secret-examples">{feature.examples.map((example) => <li key={`${example.stem}${example.ending}${example.suffix ?? ""}`}><span>{feature.targetPosition === "initial" ? <><strong>{example.ending}</strong>{example.stem}</> : <>{example.stem}<strong>{example.ending}</strong>{example.suffix ?? ""}</>}</span><span aria-hidden="true">→</span><span>{example.sound}</span></li>)}</ul>
          <p className="weak-vowel-secret-conclusion"><RichCopy text={feature.conclusion} /></p>
        </section>
        <SecretTipCards tips={feature.tips} />
      </div> : null}
      {feature?.kind === "ending_secret_rule" ? <div className="weak-vowel-secret-rule-layout">
        <section className="weak-vowel-secret-rule-card" aria-label="Today's secret rule"><span aria-hidden="true">✦</span><p><RichCopy text={feature.rule} /></p>
          <ul>{feature.clues.map((clue) => <li key={clue}><RichCopy text={clue} /></li>)}</ul>
          <p><RichCopy text={feature.conclusion} /></p><strong><RichCopy text={feature.motto} /></strong>
        </section>
        <h2 className="weak-vowel-secret-recap-heading">{feature.tips.length} detective tips to remember</h2>
        <SecretTipCards tips={feature.tips} recap />
      </div> : null}
      {page.callout ? <p className="teaching-key-idea rounded-2xl border-2 border-cyan-200 bg-cyan-100 px-5 py-4 text-center text-xl font-black text-cyan-950">{page.callout}</p> : null}
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
        <section key={section.heading ?? index} className={section.tone === "gold" ? "teaching-gold-clue grid gap-3 rounded-3xl border-2 border-amber-300 bg-gradient-to-br from-amber-100 via-yellow-50 to-amber-200 p-5 text-amber-950 shadow-[0_8px_0_rgba(180,83,9,.42)]" : "grid gap-3 rounded-3xl border border-cyan-300/30 bg-slate-950/35 p-5"}>
          {section.heading ? <h2 className={section.tone === "gold" ? "text-xl font-black text-amber-950" : "text-xl font-black text-white"}>{section.heading}</h2> : null}
          {section.paragraphs.map((paragraph) => <p key={paragraph} className={section.tone === "gold" ? "leading-relaxed text-amber-950" : "leading-relaxed text-cyan-50"}>{paragraph}</p>)}
          {section.examples?.length ? <ExampleGrid examples={section.examples} /> : null}
        </section>
      ))}
    </article>
  );
}

function RichCopy(props: { text: string }) {
  return <>{props.text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith("**") && part.endsWith("**")
    ? <strong key={index}>{part.slice(2, -2)}</strong> : <span key={index}>{part}</span>)}</>;
}

function SecretTipCards(props: { tips: readonly WeakVowelSecretTip[]; recap?: boolean }) {
  return <div className={`weak-vowel-secret-tip-stack${props.recap ? " is-recap" : ""}`} aria-label={`${props.tips.length} detective tips`}>
    {props.tips.map((tip, index) => <section key={tip.heading} className={`weak-vowel-secret-tip weak-vowel-secret-tip-${["pink", "purple", "blue", "pink"][index % 4]}`}>
      <h3><span>{String(index + 1).padStart(2, "0")}</span>{tip.heading}</h3>
      {tip.blocks.map((block, blockIndex) => block.kind === "paragraph"
        ? <p key={blockIndex}><RichCopy text={block.text} /></p>
        : block.kind === "examples"
          ? <ul key={blockIndex} className="weak-vowel-secret-tip-examples">{block.items.map((item) => <li key={item.text}><RichCopy text={item.text} />{item.explanation ? <span> — {item.explanation}</span> : null}</li>)}</ul>
          : block.kind === "comparison"
            ? <table key={blockIndex} className="weak-vowel-secret-comparison"><thead><tr><th scope="col">{block.columns[0]}</th><th scope="col">{block.columns[1]}</th></tr></thead><tbody>{block.rows.map(([spoken, spelling]) => <tr key={`${spoken}:${spelling}`}><td>{spoken}</td><td>{spelling}</td></tr>)}</tbody></table>
          : <p key={blockIndex}><strong>{block.heading}</strong> {block.words.join(" · ")}</p>)}
    </section>)}
  </div>;
}

function HighlightedFocusWords(props: { text: string; words: readonly string[] }) {
  const pattern = new RegExp(`(?<![A-Za-z])(?:${[...props.words].sort((a, b) => b.length - a.length).map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![A-Za-z])`, "gi");
  const parts: ReactNode[] = [];
  let from = 0;
  for (const match of props.text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > from) parts.push(props.text.slice(from, index));
    parts.push(<mark key={`${index}-${match[0]}`} className="rounded-lg bg-amber-200 px-2 py-0.5 font-black text-amber-950">{match[0]}</mark>);
    from = index + match[0].length;
  }
  if (from < props.text.length) parts.push(props.text.slice(from));
  return <>{parts}</>;
}

function ExampleGrid(props: { examples: readonly TeachingPageExample[] }) {
  return <ul className="teaching-examples grid gap-3 sm:grid-cols-2" aria-label="Examples">{props.examples.map((example) => (
    <li key={`${example.text}:${example.explanation ?? ""}`} className="teaching-example rounded-2xl bg-white p-4 text-left text-slate-950" data-transformation={example.text.includes("→") ? "true" : undefined}>
      <p className="text-lg font-black">{example.text}</p>
      {example.explanation ? <p className="mt-1 text-sm font-semibold text-slate-600">{example.explanation}</p> : null}
    </li>
  ))}</ul>;
}

function MeetWords(props: { config: TeachingPagesConfig["meetWords"]; pageNumber: number; pageCount: number; wordIndex?: number }) {
  const words = props.wordIndex === undefined ? props.config.words : [props.config.words[props.wordIndex]];
  const familyColumns = words.length === 6 && [0, 3].every(start =>
    ["base", "comparative", "superlative"].every((degree, offset) => words[start + offset].label?.startsWith(`${degree} · `)));
  const singleWord = props.wordIndex !== undefined;
  const card = (word: MeetWordConfig) => <li key={word.id} className={`rounded-2xl border border-white/25 bg-white p-4 text-left text-slate-950 shadow-[0_10px_0_rgba(8,47,73,.2)] ${singleWord ? "mx-auto flex w-full max-w-2xl items-center gap-4 sm:gap-7 sm:p-6" : ""}`}>
    {word.imageSrc ? <Image src={word.imageSrc} alt="" width={320} height={220} className={singleWord ? "h-28 w-28 shrink-0 rounded-xl object-contain sm:h-40 sm:w-44" : "mx-auto mb-2 h-36 w-full rounded-xl object-contain"} /> : null}
    <div className={singleWord ? "min-w-0 flex-1" : ""}>
      {word.label ? <p className="text-xs font-black uppercase tracking-[.14em] text-cyan-700">{word.label}</p> : null}
      <p className="mt-1 text-2xl font-black sm:text-3xl">{word.wordParts?.length ? <><span className="text-cyan-800">{word.wordParts.join(" + ")}</span><span aria-hidden="true" className="mx-2 text-slate-400">→</span></> : null}{word.highlightStart !== undefined && word.highlightLength !== undefined ? <>{word.word.slice(0, word.highlightStart)}<span className="rounded bg-amber-200 px-0.5 text-amber-950">{word.word.slice(word.highlightStart, word.highlightStart + word.highlightLength)}</span>{word.word.slice(word.highlightStart + word.highlightLength)}</> : word.word}</p>
      {word.detail ? <p className="mt-1 text-sm font-semibold text-slate-600 sm:text-base">{word.detail}</p> : null}
      {word.provenance ? <p className="mt-2 text-xs font-bold text-amber-700">{word.provenance}</p> : null}
    </div>
  </li>;
  return (
    <section className="grid gap-5 text-center" aria-labelledby="meet-the-words-title" data-teaching-page-type="meet_words">
      <header>
        <p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">{props.wordIndex === undefined ? "Meet the Words" : "Cheat Codes to Remember"} · Page {props.pageNumber} of {props.pageCount}</p>
        <h1 id="meet-the-words-title" className="mt-2 text-3xl font-black text-white md:text-4xl">{props.config.title ?? "Today’s words"}</h1>
        {props.config.introduction ? <p className="mx-auto mt-3 max-w-2xl text-lg leading-8 text-cyan-50">{props.config.introduction}</p> : null}
      </header>
      {familyColumns ? <div className="grid gap-4 sm:grid-cols-2" aria-label="Lesson word families">
        {[0, 3].map(start => <section key={words[start].id} aria-label={`${words[start].word} family`}>
          <ul className="grid gap-3" aria-label={`${words[start].word}: base, comparative, superlative`}>{words.slice(start, start + 3).map(card)}</ul>
        </section>)}
      </div> : <ul className={singleWord ? "mx-auto grid w-full max-w-2xl gap-3" : "grid gap-3 sm:grid-cols-2"} aria-label="Lesson words">{words.map(card)}</ul>}
    </section>
  );
}
