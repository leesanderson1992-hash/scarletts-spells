"use client";

import Image from "next/image";

export type HomophoneConcept = "apostrophe" | "c_or_s" | "past_ed";
export type HomophoneWordPage = { word: string; definition: string; cheatCode: string; imageSrc?: string; imageDescription?: string };
export type HomophoneTeachingGroup = { id: string; words: HomophoneWordPage[] };

const colours = [
  "border-rose-300 bg-rose-100 text-rose-950",
  "border-sky-300 bg-sky-100 text-sky-950",
  "border-amber-300 bg-amber-100 text-amber-950",
  "border-emerald-300 bg-emerald-100 text-emerald-950",
  "border-violet-300 bg-violet-100 text-violet-950",
  "border-orange-300 bg-orange-100 text-orange-950",
];

function HighlightedIntroFocus({ text, words }: { text: string; words: readonly string[] }) {
  const escaped = words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((left, right) => right.length - left.length);
  const expression = new RegExp(`(?<![A-Za-z])(${escaped.join("|")})(?![A-Za-z])`, "gi");
  const wordSet = new Set(words.map(word => word.toLocaleLowerCase("en-GB").replace(/’/g, "'")));
  return <>{text.split(expression).map((part, index) => wordSet.has(part.toLocaleLowerCase("en-GB").replace(/’/g, "'"))
    ? <mark key={index} className="rounded-lg bg-amber-200 px-2 py-0.5 font-black text-amber-950">{part}</mark>
    : part)}</>;
}

export function HomophoneStandardIntroPage({ title, paragraphs, focus, focusWords, category, pageNumber, pageCount }: {
  title: string; paragraphs: readonly string[]; focus: string; focusWords: readonly string[]; category: string; pageNumber: number; pageCount: number;
}) {
  return <section className="mx-auto w-full max-w-5xl rounded-[2rem] border-2 border-pink-300 border-l-8 border-l-pink-600 bg-white px-5 py-7 text-center text-slate-800 shadow-[0_8px_0_rgba(190,24,93,.12)] sm:px-10 sm:py-10" data-teaching-page-type="homophone-standard-intro">
    <p className="text-xs font-black uppercase tracking-[.2em] text-slate-800">Learn · Page {pageNumber} of {pageCount}</p>
    <h1 className="mt-3 text-3xl font-black leading-tight text-slate-950 md:text-4xl">{title}</h1>
    <div className="mx-auto mt-7 grid max-w-4xl gap-5 text-base leading-relaxed sm:text-lg">{paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div>
    <p className="mx-auto mt-6 max-w-4xl text-base leading-relaxed sm:text-lg"><HighlightedIntroFocus text={focus} words={focusWords} /></p>
    <p className="mx-auto mt-6 w-fit max-w-full rounded-2xl border-2 border-cyan-200 bg-cyan-100 px-5 py-4 text-lg font-black text-cyan-950 sm:text-xl">{category}</p>
  </section>;
}

function WordCard({ word, index, showCheat = true, comparisonLabel }: { word: HomophoneWordPage; index: number; showCheat?: boolean; comparisonLabel?: string }) {
  return <article className={`grid content-center gap-2 rounded-3xl border-2 p-5 text-center shadow-lg sm:p-6 ${colours[index % colours.length]}`}>
    {comparisonLabel ? <p className="text-xs font-black uppercase tracking-wider">{comparisonLabel}</p> : null}
    <h3 className="text-3xl font-black sm:text-4xl">{word.word}</h3>
    <p className="text-base font-semibold leading-relaxed sm:text-lg">{word.definition}</p>
    {showCheat ? <p className="mt-2 rounded-2xl bg-white/75 p-3 text-sm font-bold leading-relaxed sm:text-base"><span className="block text-xs font-black uppercase tracking-wide">Cheat code</span>{word.cheatCode}</p> : null}
  </article>;
}

function PageHeading({ eyebrow, title, pageNumber, pageCount, compact = false }: { eyebrow: string; title: string; pageNumber: number; pageCount: number; compact?: boolean }) {
  return <header className={`rounded-3xl border-2 border-indigo-300 bg-indigo-100 text-center text-indigo-950 shadow-lg ${compact ? "px-3 py-2 sm:px-4 sm:py-3" : "p-4"}`}><p className="text-xs font-black uppercase tracking-[.2em]">{eyebrow} · Page {pageNumber} of {pageCount}</p><h1 className={`font-black ${compact ? "mt-1 text-xl sm:text-2xl" : "mt-2 text-3xl md:text-4xl"}`}>{title}</h1></header>;
}

export function HomophoneCheatPage({ word, pageNumber, pageCount }: { word: HomophoneWordPage; pageNumber: number; pageCount: number }) {
  return <section className="mx-auto grid w-full max-w-2xl gap-2 sm:gap-3" data-teaching-page-type="homophone-cheat" data-homophone-compact-cheat>
    <PageHeading eyebrow="Cheat Codes to Remember" title="Choose the word by its meaning" pageNumber={pageNumber} pageCount={pageCount} compact />
    <article className={`grid gap-1 rounded-3xl border-2 p-3 text-center shadow-lg sm:gap-2 sm:p-4 ${colours[(pageNumber - 2) % colours.length]}`}>
      <h2 className="text-2xl font-black leading-tight sm:text-3xl">{word.word}</h2>
      <p className="text-sm font-semibold leading-snug sm:text-base">{word.definition}</p>
      <div className="mt-1 grid grid-cols-[minmax(0,46%)_minmax(0,54%)] items-center gap-2 sm:gap-3">
        {word.imageSrc ? <Image src={word.imageSrc} alt={word.imageDescription || `Visual reminder for ${word.word}`}
          width={768} height={512} className="aspect-[3/2] w-full rounded-xl border border-white/80 bg-white/80 object-cover shadow-sm" /> : <div />}
        <p className="rounded-2xl bg-white/80 p-2 text-left text-xs font-bold leading-snug sm:p-3 sm:text-sm sm:leading-relaxed">
          <span className="mb-1 block text-[10px] font-black uppercase tracking-wide sm:text-xs">Cheat code</span>{word.cheatCode}
        </p>
      </div>
    </article>
  </section>;
}

export function HomophonePairPage({ groups, concept, pageNumber, pageCount }: { groups: HomophoneTeachingGroup[]; concept: HomophoneConcept; pageNumber: number; pageCount: number }) {
  const title = concept === "apostrophe" ? "The apostrophe changes the meaning" : concept === "c_or_s" ? "Watch the one-letter change" : "Watch the -ed transformation";
  const comparisonLabel = (word: HomophoneWordPage, wordIndex: number) => concept === "apostrophe"
    ? word.word.includes("'") || word.word.includes("’") ? "With apostrophe" : "Without apostrophe"
    : concept === "c_or_s" ? wordIndex === 0 ? "C · noun" : "S · verb"
      : word.word.endsWith("ed") ? "Past action · -ed" : "Different word · no -ed";
  return <section className="mx-auto grid w-full max-w-5xl gap-3" data-teaching-page-type="homophone-pairs">
    <PageHeading eyebrow="Compare the pairs" title={title} pageNumber={pageNumber} pageCount={pageCount} />
    {groups.map((group, groupIndex) => <section key={group.id} aria-label={group.words.map(word => word.word).join(" and ")} className="rounded-3xl border border-white/30 bg-slate-950/35 p-3 sm:p-4">
      <div className="grid gap-3 sm:grid-cols-2">{group.words.map((word, wordIndex) => <WordCard key={word.word} word={word} index={groupIndex * 2 + wordIndex} comparisonLabel={comparisonLabel(word, wordIndex)} />)}</div>
    </section>)}
  </section>;
}

export function HomophoneMeetWordsPage({ groups, pageNumber, pageCount }: { groups: HomophoneTeachingGroup[]; pageNumber: number; pageCount: number }) {
  return <section className="mx-auto grid w-full max-w-5xl gap-5" data-teaching-page-type="homophone-meet-words">
    <PageHeading eyebrow="Meet the Words" title="See the words together" pageNumber={pageNumber} pageCount={pageCount} />
    <p className="rounded-2xl bg-cyan-100 p-3 text-center text-base font-semibold text-cyan-950">Compare each group before you choose a word in a sentence.</p>
    <div className="grid gap-4">{groups.map((group, groupIndex) => <section key={group.id} aria-label={group.words.map(word => word.word).join(" and ")} className="rounded-3xl border border-white/30 bg-slate-950/35 p-3 sm:p-4">
      <div className={`grid gap-3 ${group.words.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>{group.words.map((word, wordIndex) => <WordCard key={word.word} word={word} index={groupIndex * 2 + wordIndex} showCheat={false} />)}</div>
    </section>)}</div>
  </section>;
}

export function HomophoneConceptPage({ concept, pageNumber, pageCount }: { concept: HomophoneConcept; pageNumber: number; pageCount: number }) {
  if (concept === "apostrophe") return <article className="mx-auto grid w-full max-w-4xl gap-4 text-center [&>h2]:rounded-2xl [&>h2]:bg-sky-100 [&>h2]:p-3 [&>h2]:text-sky-950 [&>p]:rounded-2xl [&>p]:bg-white/90 [&>p]:p-4 [&>p]:text-slate-950" data-teaching-page-type="homophone-concept">
    <PageHeading eyebrow="Learn" title="The Tiny Mark That Changes Everything! ✨" pageNumber={pageNumber} pageCount={pageCount} />
    <p className="text-xl font-bold">One little apostrophe ( ’ ) can completely change a word&apos;s meaning!</p>
    <p className="font-semibold">An apostrophe has two important jobs:</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <section className="rounded-3xl border-2 border-violet-300 bg-violet-100 p-5 text-violet-950"><h2 className="text-xl font-black">1. Contractions — Joining Words</h2><p>It replaces missing letters when two words become one.</p><p className="mt-3"><strong>We&apos;re</strong> = We are</p><p><strong>Were</strong> = Something happened in the past</p></section>
      <section className="rounded-3xl border-2 border-amber-300 bg-amber-100 p-5 text-amber-950"><h2 className="text-xl font-black">2. Possession — Showing Ownership</h2><p>It helps show who something belongs to.</p><p className="mt-3"><strong>The girl&apos;s bag</strong> = One girl owns the bag.</p><p><strong>The girls&apos; bag</strong> = More than one girl owns the bag.</p></section>
    </div>
    <h2 className="text-xl font-black">🔎 Be an Apostrophe Detective!</h2>
    <p>Sometimes, forgetting one tiny mark creates a <strong>real word with a completely different meaning!</strong></p>
    <p>In the next slides, discover how adding, removing or moving an apostrophe can transform both the <strong>meaning and the picture</strong> of a word.</p>
    <p className="text-xl font-black text-cyan-50">Tiny mark. BIG difference!</p>
  </article>;

  if (concept === "c_or_s") return <article className="mx-auto grid w-full max-w-4xl gap-4 text-center [&>h2]:rounded-2xl [&>h2]:bg-sky-100 [&>h2]:p-3 [&>h2]:text-sky-950 [&>p]:rounded-2xl [&>p]:bg-white/90 [&>p]:p-4 [&>p]:text-slate-950" data-teaching-page-type="homophone-concept">
    <PageHeading eyebrow="Learn" title="C or S? One Letter Changes Everything! 🔎" pageNumber={pageNumber} pageCount={pageCount} />
    <p className="text-xl font-bold">Some words look almost identical, but swapping C and S can completely change their meaning!</p>
    <p>In some special word pairs, there is a clever spelling pattern:</p>
    <div className="grid gap-4 sm:grid-cols-2"><section className="rounded-3xl border-2 border-sky-300 bg-sky-100 p-5 text-sky-950"><h2 className="text-2xl font-black">C = Noun 📦</h2><p>A thing, an idea or something you have.</p></section><section className="rounded-3xl border-2 border-rose-300 bg-rose-100 p-5 text-rose-950"><h2 className="text-2xl font-black">S = Verb ⚡</h2><p>An action or something you do.</p></section></div>
    <h2 className="text-xl font-black">Watch the Transformation!</h2>
    <div className="grid gap-3 sm:grid-cols-2"><section className="rounded-2xl bg-amber-100 p-4 text-amber-950"><h3 className="font-black">-ce / -se</h3><p><strong>Advice</strong> = Helpful guidance (noun).</p><p><strong>Advise</strong> = To give someone guidance (verb).</p></section><section className="rounded-2xl bg-emerald-100 p-4 text-emerald-950"><h3 className="font-black">-cy / -sy</h3><p><strong>Prophecy</strong> = A prediction about the future (noun).</p><p><strong>Prophesy</strong> = To predict the future (verb).</p></section></div>
    <h2 className="text-xl font-black">🕵️ Your Detective Mission</h2>
    <p>In the next slides, discover how changing just <strong>one letter</strong> transforms a word&apos;s meaning, its job in a sentence and sometimes even its sound!</p>
    <p className="text-lg font-black text-cyan-50">Remember: C for the noun, S for the action — in these special pairs!</p>
  </article>;

  return <article className="mx-auto grid w-full max-w-4xl gap-4 text-center [&>h2]:rounded-2xl [&>h2]:bg-sky-100 [&>h2]:p-3 [&>h2]:text-sky-950 [&>p]:rounded-2xl [&>p]:bg-white/90 [&>p]:p-4 [&>p]:text-slate-950" data-teaching-page-type="homophone-concept">
    <PageHeading eyebrow="Learn" title="Sounds Like T… But Is It -ed? 🔎" pageNumber={pageNumber} pageCount={pageCount} />
    <p className="text-xl font-bold">Two words can sound exactly the same but have completely different meanings!</p>
    <p>When we add <strong>-ed</strong> to a verb to show something happened in the past, the ending sometimes sounds like <strong>/t/</strong> instead of /d/.</p>
    <p>But here&apos;s the tricky part: spelling that /t/ sound with a <strong>t</strong> can create a completely different real word!</p>
    <h2 className="text-xl font-black">Watch the Transformation!</h2>
    <div className="grid gap-3 sm:grid-cols-3">
      <section className="rounded-2xl bg-rose-100 p-4 text-rose-950"><p><strong>Passed</strong> = Went past something or succeeded at a test.</p><p><strong>Past</strong> = A time that has already happened.</p></section>
      <section className="rounded-2xl bg-sky-100 p-4 text-sky-950"><p><strong>Missed</strong> = Failed to catch, hit or reach something.</p><p><strong>Mist</strong> = A thin cloud of tiny water droplets.</p></section>
      <section className="rounded-2xl bg-amber-100 p-4 text-amber-950"><p><strong>Guessed</strong> = Made an answer without knowing for certain.</p><p><strong>Guest</strong> = Someone invited to visit.</p></section>
    </div>
    <h2 className="text-xl font-black">🕵️ Your Detective Mission</h2>
    <p>Ask yourself: <strong>Am I describing an action that already happened?</strong></p>
    <p>If yes, you probably need <strong>-ed</strong>, even when you hear a /t/ sound!</p>
    <p>In the next slides, discover how two words that sound identical can tell completely different stories.</p>
    <p className="text-lg font-black text-cyan-50">Remember: Don&apos;t just trust your ears — investigate the meaning!</p>
  </article>;
}
