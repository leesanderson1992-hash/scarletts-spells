"use client";

import { useRef, useState, type CSSProperties } from "react";
import type { LatinRootLessonContent } from "@/lib/adle/morphology/latin-root-lesson";
import { latinRootTeachingPages } from "@/lib/adle/morphology/latin-root-teaching-pages";
import { latinRootWordSums } from "@/lib/adle/morphology/latin-root-introduction";
import { playInteractionSound } from "@/components/adle/activities/shared/sound";
import { SpellWandStars } from "./spell-wand-stars";
import styles from "./latin-root-lesson.module.css";

export function LatinRootIntroduction({ content, muted, onPageChange, onComplete, initialSlide = 0, canonicalContentOnly = false }: {
  canonicalContentOnly?: boolean; initialSlide?: number; content: LatinRootLessonContent; muted: boolean; onPageChange: (slide: number) => void; onComplete: () => void;
}) {
  const [slide, setSlide] = useState(Math.min(5, Math.max(0, initialSlide)));
  const [cast, setCast] = useState(0);
  const focus = useRef<HTMLElement>(null);
  const reading = latinRootTeachingPages(content).pages[slide];
  const sums = latinRootWordSums(content, !canonicalContentOnly);
  const reveal = slide === 3 || slide === 5;
  const spell = slide === 3 ? "LUMOS" : "EXPELLIARMUS";
  function move(next: number) {
    setSlide(next);
    onPageChange(next);
    requestAnimationFrame(() => {
      focus.current?.focus({ preventScroll: true });
      focus.current?.closest(".word-lab-workspace")?.scrollTo({ top: 0 });
    });
  }
  function castSpell() {
    playInteractionSound("spell_cast", muted);
    setCast(previous => previous + 1);
    if (!reveal) move(slide + 1);
  }
  return <div className={styles.rootIntroduction}><SpellWandStars>
    <section ref={focus} tabIndex={-1} className={`teaching-pages ${styles.introPages}`} aria-label="Lesson teaching pages">
      <div className={styles.introPageViewport}><article className={`${styles.introReading} ${slide === 0 ? "base-word-intro-page" : ""}`} data-teaching-page-type="reading" aria-labelledby="latin-root-intro-title">
      <header><p className={styles.introEyebrow}>Advanced Spellcraft · Page {slide + 1} of 6</p>
        <h1 id="latin-root-intro-title">{slide < 2 ? (slide === 1 ? "What is this sorcery?" : reading.title) : "The Magic of Latin"}</h1></header>
      {slide < 2 ? <>
        <div className={`${styles.introCopy} ${slide === 0 ? `base-word-intro-copy ${styles.introTextBox} ${styles.welcomeTextBox}` : ""}`}>{reading.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div>
        {slide === 1 ? <>
          <div className={`base-word-maths-panel ${styles.spellingMathsPanel}`}><p className={styles.introTotal}><strong>{content.families[0].root.toUpperCase()} = {content.families[0].meaning.toUpperCase()}</strong> · One root, {sums.length} family words!</p>
          <table className={styles.wordSums} aria-label="Latin-root spelling maths"><thead><tr>{["Prefix", "Root", "Suffix", "= Whole word"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>{sums.map(word => <tr key={word.word}>{(["prefix", "root", "suffix"] as const).map((role, index) => {
              const parts = word.parts.filter(part => part.role === role);
              return <td key={role}><div className={styles.sumPart}>{index > 0 && parts.length > 0 && (role === "suffix" || word.parts.some(part => part.role === "prefix")) ? <span className={styles.sumOperator} aria-hidden="true">+</span> : null}
                {parts.length ? parts.map(part => <div key={part.text}><strong>{part.text}</strong><small>{part.meaning}</small></div>) : <div><span aria-label={`No ${role}`}>—</span><small>no {role}</small></div>}</div></td>;
            })}<td><div className={styles.sumPart}><span className={styles.sumOperator} aria-hidden="true">=</span><strong>{word.word}</strong><small>{word.meaning}</small></div></td></tr>)}</tbody>
          </table></div>
        </> : null}
      </> : reveal ? <div className={`base-word-long-panel ${styles.introReveal} ${styles.magicTeachingPanel}`} key={cast} data-intro-spell-reveal>
        <div className={styles.introBurst} style={{ "--spell-length": spell.length } as CSSProperties}><h2>{spell}!</h2>
          <div className={styles.introRevealStars} aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <span key={i} style={{ "--angle": `${i * 30}deg` } as CSSProperties}>✦</span>)}</div></div>
        <div className={`${styles.spellAnswerBox} ${styles.magicAnswerBox}`}>
          <h3>Did you get it right?</h3>
          <p>{slide === 3 ? "The Lumos spell lights up any room!" : "The Expelliarmus spell disarms an opponent!"}</p>
        </div>
      </div> : <>
        <p className={styles.magicIntroduction}>{slide === 2 ? "Did you know that many famous spells in the Harry Potter books are inspired by Latin?" : "Let’s try a harder one. Sometimes more than one Latin word was used!"}</p>
        <div className={`base-word-long-panel ${styles.introGuess} ${styles.magicTeachingPanel}`}><h2 className={styles.magicAnswerBox}>{slide === 2 ? "Can you guess which spell this Latin word might inspire?" : "Can you guess the spell these two Latin words inspired?"}</h2>
        <button type="button" data-latin-spell-tile className={`${styles.latinIngredients} ${styles.latinSpellTile}`} onClick={castSpell} aria-label={slide === 2 ? "lumen, light — tap to reveal" : "expello, drive out, plus arma, weapons — tap to reveal"}>{(slide === 2 ? [{ word: "lumen", meaning: "light" }] : [{ word: "expello", meaning: "drive out" }, { word: "arma", meaning: "weapons" }]).map((part, i) => <div className={styles.latinIngredientGroup} key={part.word}>{i > 0 ? <span>+</span> : null}<div className={i === 0 ? "bg-amber-100 text-amber-950" : "bg-cyan-100 text-cyan-950"}><span className={styles.latinIngredientLabel}>Latin word</span><strong>{part.word}</strong><small>{part.meaning}</small></div></div>)}</button>
        <p>Say your guess, then tap the Latin tile with your wand!</p>
      </div></>}
      </article></div>
      <nav aria-label="Teaching page navigation"><button type="button" className="brand-secondary-btn" disabled={slide === 0} onClick={() => move(slide - 1)}>Back</button>
        {slide === 2 || slide === 4 ? null : <button type="button" className="brand-primary-btn" onClick={() => slide === 5 ? onComplete() : move(slide + 1)}>{reveal ? "Next" : "Next page"}</button>}
      </nav>
    </section>
  </SpellWandStars></div>;
}
