import Link from "next/link";
import { notFound } from "next/navigation";
import { canOpenAdleDesignPreview } from "@/lib/adle/design-preview-access";
import { APPROVED_CONVERGENCE_LESSONS } from "@/lib/adle/homophone/convergence-preview";
import { HOMOPHONE_LESSONS } from "@/lib/adle/homophone/lesson";
import styles from "./teaching-mockup.module.css";

export const dynamic = "force-dynamic";

const examples = [
  { id: "pair", label: "Two words", key: "D4_HOM_CONFUSABLE_WORDS_ACCEPT_EXCEPT" },
  { id: "triad", label: "Three words", key: "D4_HOM_CONTENT_WORD_HOMOPHONES_SENT_CENT_SCENT" },
  { id: "multiple", label: "Several pairs", key: "D4_HOM_CONFUSABLE_WORDS_SE_SY_CE_CY" },
] as const;

type Props = { searchParams?: Promise<{ example?: string }> };

export default async function HomophoneTeachingMockup({ searchParams }: Props) {
  if (!canOpenAdleDesignPreview()) notFound();
  const requested = (await searchParams)?.example;
  const selected = examples.find(example => example.id === requested) ?? examples[0];
  const lesson = APPROVED_CONVERGENCE_LESSONS.find(item => item.microSkillKey === selected.key);
  if (!lesson) notFound();
  const sets = selected.id === "multiple" ? lesson.sets.slice(0, 3) : lesson.sets;
  const wordCount = sets.reduce((total, set) => total + set.members.length, 0);
  const standardIntro = HOMOPHONE_LESSONS[0].teachingIntro;
  const relationKinds = new Set(sets.map(set => set.relationKind));
  const category = relationKinds.size === 1 && relationKinds.has("homophone")
    ? "These words are homophones."
    : "These words are confusables.";

  return <main className={styles.shell}>
    <div className={styles.reviewBar}>
      <div>
        <p className={styles.reviewEyebrow}>ADLE design review</p>
        <h1>Homophone teaching page · first page mock-up</h1>
        <p>The shared lesson introduction, with focus words and approved meanings made prominent.</p>
      </div>
      <Link href="/dev/adle/homophone-convergence">Back to lesson reviews</Link>
    </div>

    <nav className={styles.exampleNav} aria-label="Mock-up examples">
      {examples.map(example => <Link key={example.id}
        href={`/dev/adle/homophone-convergence/mockup?example=${example.id}`}
        aria-current={selected.id === example.id ? "page" : undefined}>
        {example.label}
      </Link>)}
    </nav>

    <section className={styles.lessonFrame} aria-label={`${selected.label} first teaching page mock-up`}>
      <div className={styles.pageTopline}><span>LEARN · PAGE 1</span><span>{wordCount} focus words</span></div>
      <header className={styles.lessonHeader}>
        <h2>{standardIntro.title}</h2>
      </header>

      <div className={styles.standardIntro} aria-label="Standard homophone and confusable introduction">
        {standardIntro.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
      </div>

      <p className={styles.category}>{category}</p>

      <div className={styles.focusArea}>
        <h3>Today’s focus words</h3>
        <p>Read each meaning. Then choose the word that fits the whole sentence.</p>
        <div className={styles.sets}>
          {sets.map((set, setIndex) => <section key={set.setKey} className={styles.set} aria-label={`Word group ${setIndex + 1}`}>
            {sets.length > 1 ? <h4 className={styles.setLabel}>Group {setIndex + 1}: {set.members.map(member => member.word).join(" · ")}</h4> : null}
            <div className={`${styles.cards} ${set.members.length === 3 ? styles.triad : ""}`}>
              {set.members.map((member, memberIndex) => <article key={member.word}
                className={`${styles.wordCard} ${styles[`tone${(setIndex * 2 + memberIndex) % 6}`]}`}>
                <span className={styles.role}>{member.grammaticalRole}</span>
                <h5>{member.word}</h5>
                <p>{member.intendedSense}</p>
              </article>)}
            </div>
          </section>)}
        </div>
      </div>

      <aside className={styles.takeaway}>
        <span aria-hidden="true">✦</span>
        <p><strong>Remember:</strong> choose by meaning in the whole sentence.</p>
      </aside>
      <p className={styles.mockupNote}>Design mock-up · approved lesson meanings · no learner activity or evidence</p>
    </section>
  </main>;
}
