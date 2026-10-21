"use client";

import { useEffect, useState } from "react";
import { PreviewThemeControl } from "@/app/dev/adle/preview/preview-theme-control";
import { WordLabScene } from "@/components/adle/morphology/word-lab-scene";
import "./style.css";

const wordExamples = [
  { word: "sugar", lead: "sug", ending: "ar", sound: "SHU-guh" },
  { word: "dollar", lead: "doll", ending: "ar", sound: "DOL-uh" },
  { word: "calendar", lead: "calend", ending: "ar", sound: "KAL-in-duh" },
  { word: "grammar", lead: "gramm", ending: "ar", sound: "GRAM-uh" },
  { word: "regular", lead: "regul", ending: "ar", sound: "REG-yuh-luh" },
  { word: "popular", lead: "popul", ending: "ar", sound: "POP-yuh-luh" },
] as const;

function DetectiveTips() {
  return <div className="final-ar-tip-stack" aria-label="Four detective tips">
    <section className="final-ar-tip final-ar-tip-pink">
      <h3><span>01</span> Detective Tip 1: Listen for the lazy ending</h3>
      <p>Say <strong>sugar</strong> slowly. Can you hear a strong <strong>ar</strong> sound at the end?</p>
      <p><strong>No!</strong> You hear a soft <strong>“uh”</strong>.</p>
      <p>That&apos;s because the final syllable is <strong>unstressed</strong>. It doesn&apos;t get a strong beat, so its vowel becomes weak.</p>
    </section>
    <section className="final-ar-tip final-ar-tip-purple">
      <h3><span>02</span> Detective Tip 2: Look for the AR family</h3>
      <p>Some words share a useful spelling pattern.</p>
      <p><strong>The -ular family:</strong> regular · popular · particular · circular</p>
      <p><strong>Similar-looking endings:</strong> simil<strong>ar</strong> ends <strong>-ilar</strong>; famil<strong>iar</strong> ends <strong>-iliar</strong>.</p>
      <p>If you remember how one word in a family ends, it can help you spell the others!</p>
    </section>
    <section className="final-ar-tip final-ar-tip-blue">
      <h3><span>03</span> Detective Tip 3: Ask the word&apos;s relatives!</h3>
      <p>Sometimes, changing a word helps reveal its hidden vowel.</p>
      <p><strong>popular → popularity</strong></p>
      <p>In <em>popular</em>, the final <strong>a</strong> is weak and sounds like “uh”. In <em>popularity</em>, that <strong>a</strong> becomes clearer.</p>
      <p>The word&apos;s relatives can sometimes give you a clue about its spelling. But be careful! Not every word has a helpful relative.</p>
    </section>
    <section className="final-ar-tip final-ar-tip-pink">
      <h3><span>04</span> Detective Tip 4: Don&apos;t trust your ears alone!</h3>
      <p>Listen to sug<strong>ar</strong>, teach<strong>er</strong> and act<strong>or</strong>. They all end with a very similar <strong>“uh”</strong> sound, but their endings are spelt differently.</p>
      <p>Your ears can tell you there&apos;s a schwa, but they can&apos;t always tell you which letters to write. That&apos;s why we use <strong>spelling patterns, word families and memory</strong>.</p>
    </section>
  </div>;
}

function PageTwo() {
  return <article className="final-ar-mockup-page" aria-labelledby="final-ar-page-two-title">
    <header className="final-ar-page-heading"><p>THE SECRET LIFE OF VOWELS · PAGE 2 OF 4</p><h1 id="final-ar-page-two-title">The Secret of the Lazy -ar</h1><span>When AR sounds like “uh”!</span></header>
    <div className="final-ar-page-two-grid">
      <section className="final-ar-story-card">
        <p>You already know that <strong>ar</strong> can make a strong sound, like in <strong>car</strong>, <strong>star</strong> and <strong>park</strong>.</p>
        <p>But did you know that <strong>ar</strong> has a secret?</p>
        <p>When <strong>-ar</strong> comes at the end of some words, in British English it can become lazy!</p>
        <p>Instead of making a strong sound, it makes a quiet <strong>“uh”</strong> sound called the <strong>schwa /ə/</strong>.</p>
        <h2>Listen to these words</h2>
        <ul className="final-ar-examples">{wordExamples.map((example) => <li key={example.word}><span>{example.lead}<strong>{example.ending}</strong></span><span aria-hidden="true">→</span><span>{example.sound}</span></li>)}</ul>
        <p className="final-ar-story-close">Even though we write <strong>ar</strong>, we hear <strong>“uh”</strong> at the end!</p>
      </section>
      <div className="final-ar-tips-column"><DetectiveTips /></div>
    </div>
  </article>;
}

function PageThree() {
  return <article className="final-ar-mockup-page" aria-labelledby="final-ar-page-three-title">
    <header className="final-ar-page-heading"><p>THE SECRET LIFE OF VOWELS · PAGE 3 OF 4</p><h1 id="final-ar-page-three-title">Today&apos;s Secret Rule</h1></header>
    <section className="final-ar-rule"><span aria-hidden="true">✦</span><p>At the end of <strong>some</strong> words, <strong>-ar</strong> makes the weak <strong>“uh”</strong> sound <strong>/ə/</strong>.</p><strong>Hear the “uh”, look for a clue, remember the AR!</strong></section>
    <h2 className="final-ar-tip-recap-title">Four detective tips to remember</h2>
    <DetectiveTips />
  </article>;
}

export function FinalArTeachingMockup() {
  const [page, setPage] = useState<2 | 3>(2);
  const [muted, setMuted] = useState(true);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const workspace = document.querySelector<HTMLElement>(".final-ar-mockup-scene .word-lab-workspace");
      if (workspace) workspace.scrollTop = 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [page]);
  return <main className="adle-preview-config brand-page min-h-screen px-2 py-2">
    <section className="adle-preview-settings brand-card mx-auto mb-2 flex max-w-7xl flex-wrap items-center gap-3 rounded-2xl px-3 py-2" aria-label="Final ar teaching mockup settings">
      <div className="mr-auto"><h1 className="text-lg font-black">Final -ar teaching pages · ADLE mockup</h1><p className="text-xs">Pages 2 and 3 · layout review only · no lesson content published</p></div>
      <div className="final-ar-preview-pages" role="group" aria-label="Teaching page"><button type="button" aria-pressed={page === 2} onClick={() => setPage(2)}>Page 2</button><button type="button" aria-pressed={page === 3} onClick={() => setPage(3)}>Page 3</button></div>
      <PreviewThemeControl />
    </section>
    <WordLabScene key={page} className="weak-vowel-lesson final-ar-mockup-scene" beat={{ id: "final-ar-mockup", activityId: "teaching", state: "focus", say: "Listen for the quiet ending, then look for its spelling.", goal: "Discover the secret of final -ar", waitFor: "activity_complete", onComplete: "Ready for today's words." }} phase={0} muted={muted} onMutedChange={setMuted} guideName="ADIE" phases={["Learn", "Call It to Dinner", "Vowel Detective", "Cover", "Dictate", "Reflect"]} phaseCues={["Learn the idea", "Find the syllables", "Investigate the vowel", "Remember the word", "Write the sentence", "Think back"]}>
      {page === 2 ? <PageTwo /> : <PageThree />}
      <nav className="final-ar-page-navigation" aria-label="Mockup page navigation"><button type="button" disabled={page === 2} onClick={() => setPage(2)}>Back</button><span>Page {page} of 4</span><button type="button" disabled={page === 3} onClick={() => setPage(3)}>Next page</button></nav>
    </WordLabScene>
  </main>;
}
